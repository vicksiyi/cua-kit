//! Native pipe transport for the recovered trusted-worker wire contract.
//! Endpoint authorization belongs to the host, not worker-supplied paths.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::UnixStream,
    sync::mpsc,
    task::JoinHandle,
    time::timeout,
};
use uuid::Uuid;

const MAX_WRITE: usize = 1024 * 1024 + 4;
const MAX_ENCODED: usize = MAX_WRITE.div_ceil(3) * 4;
const MAX_CONNECTIONS: usize = 64;

struct Connection {
    writer: tokio::net::unix::OwnedWriteHalf,
    reader: JoinHandle<()>,
}
/// Bounded event receiver must be drained by the supervisor alongside requests.
/// Backpressure pauses socket reads rather than growing an unbounded JSON queue.
pub struct NativePipeHost {
    allowed: HashSet<PathBuf>,
    endpoint_roots: Vec<PathBuf>,
    connections: HashMap<String, Connection>,
    events: mpsc::Sender<Value>,
    ended: bool,
}
impl NativePipeHost {
    pub fn new(paths: Vec<PathBuf>, events: mpsc::Sender<Value>) -> Result<Self, String> {
        if paths.iter().any(|p| !p.is_absolute()) {
            return Err("Native pipe allowlist requires absolute paths".into());
        }
        Ok(Self {
            allowed: paths.into_iter().collect(),
            endpoint_roots: Vec::new(),
            connections: HashMap::new(),
            events,
            ended: false,
        })
    }
    pub fn with_endpoint_roots(mut self, roots: Vec<PathBuf>) -> Result<Self, String> {
        self.endpoint_roots = crate::registered_endpoints::validate_roots(roots)?;
        Ok(self)
    }
    pub async fn request(&mut self, message: &Value) -> Result<Value, String> {
        if self.ended {
            return Err("Native pipe host is closed".into());
        }
        // Retire remote-closed readers before enforcing the live-connection limit.
        self.connections
            .retain(|_, connection| !connection.reader.is_finished());
        if message["op"] == "connect" {
            let path = message["path"].as_str().ok_or("Missing native pipe path")?;
            if !self.allowed.contains(&PathBuf::from(path))
                && !crate::registered_endpoints::registered_socket(
                    &self.endpoint_roots,
                    std::path::Path::new(path),
                )
            {
                return Err("Native pipe endpoint is not authorized".into());
            }
            if self.connections.len() >= MAX_CONNECTIONS {
                return Err("Native pipe connection limit exceeded".into());
            }
            let stream = timeout(Duration::from_secs(5), UnixStream::connect(path))
                .await
                .map_err(|_| "Native pipe connect timed out".to_string())?
                .map_err(|e| e.to_string())?;
            let id = Uuid::new_v4().to_string();
            let (mut reader, writer) = stream.into_split();
            let events = self.events.clone();
            let event_id = id.clone();
            let task = tokio::spawn(async move {
                let mut buffer = vec![0; 65536];
                let failure = loop {
                    match reader.read(&mut buffer).await {
                        Ok(0) => break None,
                        Ok(n) => {
                            let event = json!({"type":"native_pipe_data","connection_id":event_id,"data_base64":STANDARD.encode(&buffer[..n])});
                            if events.send(event).await.is_err() {
                                return;
                            }
                        }
                        Err(error) => break Some(error.to_string()),
                    }
                };
                let mut closed = json!({"type":"native_pipe_closed","connection_id":event_id});
                if let Some(error) = failure {
                    closed["error"] = Value::String(error);
                }
                let _ = events.send(closed).await;
            });
            self.connections.insert(
                id.clone(),
                Connection {
                    writer,
                    reader: task,
                },
            );
            return Ok(json!({"connection_id":id}));
        }
        let id = message["connection_id"]
            .as_str()
            .ok_or("Unknown native pipe connection")?;
        if !self.connections.contains_key(id) {
            return Err("Unknown native pipe connection".into());
        }
        if message["op"] == "close" {
            let connection = self.connections.remove(id).unwrap();
            connection.reader.abort();
            let _ = connection.reader.await;
            drop(connection.writer);
            self.events
                .send(json!({"type":"native_pipe_closed","connection_id":id}))
                .await
                .map_err(|_| "Native pipe event receiver closed")?;
            return Ok(Value::Null);
        }
        if message["op"] != "write" {
            return Err("Unsupported native pipe operation".into());
        }
        let value = message["data_base64"]
            .as_str()
            .ok_or("Invalid native pipe write")?;
        if value.len() > MAX_ENCODED {
            return Err("Oversized native pipe write".into());
        }
        let bytes = STANDARD
            .decode(value)
            .map_err(|_| "Invalid native pipe base64")?;
        if bytes.len() > MAX_WRITE {
            return Err("Oversized native pipe write".into());
        }
        self.connections
            .get_mut(id)
            .unwrap()
            .writer
            .write_all(&bytes)
            .await
            .map_err(|e| e.to_string())?;
        Ok(Value::Null)
    }
    /// Teardown suppresses further events and joins every reader owned by this host.
    pub async fn close(&mut self) {
        self.ended = true;
        for (_, connection) in self.connections.drain() {
            connection.reader.abort();
            let _ = connection.reader.await;
        }
    }
}
impl Drop for NativePipeHost {
    fn drop(&mut self) {
        for connection in self.connections.values() {
            connection.reader.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::UnixListener;
    struct SocketFile(PathBuf);
    impl Drop for SocketFile {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }
    #[tokio::test]
    async fn real_socket_preserves_bytes_and_close_events() {
        let path = SocketFile(PathBuf::from(format!(
            "/tmp/core-rust-{}.sock",
            Uuid::new_v4()
        )));
        let listener = UnixListener::bind(&path.0).unwrap();
        let (send, mut recv) = mpsc::channel(16);
        let mut host = NativePipeHost::new(vec![path.0.clone()], send).unwrap();
        let result = host
            .request(&json!({"op":"connect","path":path.0}))
            .await
            .unwrap();
        let id = result["connection_id"].as_str().unwrap();
        let (mut server, _) = listener.accept().await.unwrap();
        let payload = vec![0x95; 315_000]; // Larger than the earlier 256 KiB regression.
        let expected = payload.clone();
        let peer = tokio::spawn(async move {
            let mut bytes = vec![0; expected.len()];
            server.read_exact(&mut bytes).await.unwrap();
            assert_eq!(bytes, expected);
            server.write_all(&bytes).await.unwrap();
        });
        host.request(
            &json!({"op":"write","connection_id":id,"data_base64":STANDARD.encode(payload)}),
        )
        .await
        .unwrap();
        let mut actual = Vec::new();
        loop {
            let event = timeout(Duration::from_secs(5), recv.recv())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(event["connection_id"], id);
            if event["type"] == "native_pipe_closed" {
                break;
            }
            actual.extend(
                STANDARD
                    .decode(event["data_base64"].as_str().unwrap())
                    .unwrap(),
            );
        }
        assert_eq!(actual, vec![0x95; 315_000]);
        peer.await.unwrap();
        host.close().await;
        assert!(host
            .request(&json!({"op":"connect","path":path.0}))
            .await
            .is_err());
    }
    #[tokio::test]
    async fn explicit_close_emits_once_and_teardown_closes_socket() {
        let path = SocketFile(PathBuf::from(format!(
            "/tmp/core-rust-{}.sock",
            Uuid::new_v4()
        )));
        let listener = UnixListener::bind(&path.0).unwrap();
        let (send, mut recv) = mpsc::channel(16);
        let mut host = NativePipeHost::new(vec![path.0.clone()], send).unwrap();
        let connected = host
            .request(&json!({"op":"connect","path":path.0}))
            .await
            .unwrap();
        let (mut peer, _) = listener.accept().await.unwrap();
        host.request(&json!({"op":"close","connection_id":connected["connection_id"]}))
            .await
            .unwrap();
        assert_eq!(recv.recv().await.unwrap()["type"], "native_pipe_closed");
        let mut byte = [0];
        assert_eq!(
            timeout(Duration::from_secs(2), peer.read(&mut byte))
                .await
                .unwrap()
                .unwrap(),
            0
        );
        assert!(recv.try_recv().is_err());
        host.request(&json!({"op":"connect","path":path.0}))
            .await
            .unwrap();
        let (mut peer, _) = listener.accept().await.unwrap();
        host.close().await;
        assert_eq!(
            timeout(Duration::from_secs(2), peer.read(&mut byte))
                .await
                .unwrap()
                .unwrap(),
            0
        );
        assert!(recv.try_recv().is_err());
    }
    #[tokio::test]
    async fn rejects_unapproved_paths_and_invalid_payloads() {
        let (send, _recv) = mpsc::channel(16);
        assert!(NativePipeHost::new(vec![PathBuf::from("relative")], send.clone()).is_err());
        let path = SocketFile(PathBuf::from(format!(
            "/tmp/core-rust-{}.sock",
            Uuid::new_v4()
        )));
        let listener = UnixListener::bind(&path.0).unwrap();
        let mut host = NativePipeHost::new(vec![path.0.clone()], send).unwrap();
        assert!(host
            .request(&json!({"op":"connect","path":"/tmp/unauthorized.sock"}))
            .await
            .unwrap_err()
            .contains("not authorized"));
        let connected = host
            .request(&json!({"op":"connect","path":path.0}))
            .await
            .unwrap();
        let (_peer, _) = listener.accept().await.unwrap();
        for payload in ["%%==".to_string(), STANDARD.encode(vec![0; MAX_WRITE + 1])] {
            assert!(host.request(&json!({"op":"write","connection_id":connected["connection_id"],"data_base64":payload})).await.is_err());
        }
        host.close().await;
    }
}
