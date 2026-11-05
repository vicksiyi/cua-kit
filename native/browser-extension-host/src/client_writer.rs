//! One bounded writer thread per Unix client, matching the evidenced native
//! responsibility. Limits and Core compatibility are independent reconstruction.
use crate::transport;
use serde_json::Value;
use std::collections::VecDeque;
use std::io::{self, Write};
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::sync::{mpsc::Sender, Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};

#[derive(Clone, Copy, Debug)]
pub struct QueueLimits {
    pub max_messages: usize,
    pub max_bytes: usize,
    pub max_frame_bytes: usize,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DisconnectReason {
    Explicit,
    QueueOverflow,
    FrameRejected,
    WriteFailed,
}
#[derive(Debug, PartialEq, Eq)]
pub struct Disconnect {
    pub client: String,
    pub reason: DisconnectReason,
}
struct State {
    frames: VecDeque<Vec<u8>>,
    messages: usize,
    bytes: usize,
    closed: bool,
}
struct Shared {
    state: Mutex<State>,
    ready: Condvar,
    shutdown: UnixStream,
    events: Sender<Disconnect>,
    client: String,
}
impl Shared {
    fn close(&self, reason: DisconnectReason) {
        let mut state = self.state.lock().unwrap();
        if state.closed {
            return;
        }
        state.closed = true;
        state.frames.clear();
        state.messages = 0;
        state.bytes = 0;
        // Wake an in-progress write and readers, not only an idle queue consumer.
        let _ = self.shutdown.shutdown(Shutdown::Both);
        self.ready.notify_all();
        let _ = self.events.send(Disconnect {
            client: self.client.clone(),
            reason,
        });
    }
}

pub struct ClientWriter {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
    limits: QueueLimits,
}
impl ClientWriter {
    pub fn start(
        client: String,
        mut stream: UnixStream,
        limits: QueueLimits,
        events: Sender<Disconnect>,
    ) -> io::Result<Self> {
        if limits.max_messages == 0 || limits.max_bytes == 0 || limits.max_frame_bytes == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "writer queue limits must be positive",
            ));
        }
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                frames: VecDeque::new(),
                messages: 0,
                bytes: 0,
                closed: false,
            }),
            ready: Condvar::new(),
            shutdown: stream.try_clone()?,
            events,
            client,
        });
        let task = shared.clone();
        let worker = thread::Builder::new()
            .name("core-client-writer".into())
            .spawn(move || loop {
                let frame = {
                    let mut state = task.state.lock().unwrap();
                    while !state.closed && state.frames.is_empty() {
                        state = task.ready.wait(state).unwrap();
                    }
                    if state.closed {
                        return;
                    }
                    state.frames.pop_front().unwrap()
                };
                // The in-flight frame still consumes both byte and message budgets.
                if stream.write_all(&frame).is_err() {
                    task.close(DisconnectReason::WriteFailed);
                    return;
                }
                let mut state = task.state.lock().unwrap();
                if state.closed {
                    return;
                }
                state.messages -= 1;
                state.bytes -= frame.len();
            })?;
        Ok(Self {
            shared,
            worker: Some(worker),
            limits,
        })
    }
    pub fn enqueue(&self, message: &Value) -> io::Result<()> {
        let frame = transport::encode(message, self.limits.max_frame_bytes).map_err(|error| {
            self.shared.close(DisconnectReason::FrameRejected);
            error
        })?;
        let mut state = self.shared.state.lock().unwrap();
        if state.closed {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "client writer closed",
            ));
        }
        if state.messages >= self.limits.max_messages
            || frame.len() > self.limits.max_bytes.saturating_sub(state.bytes)
        {
            drop(state);
            self.shared.close(DisconnectReason::QueueOverflow);
            return Err(io::Error::new(
                io::ErrorKind::WouldBlock,
                "client writer queue exceeded",
            ));
        }
        state.messages += 1;
        state.bytes += frame.len();
        state.frames.push_back(frame);
        self.shared.ready.notify_one();
        Ok(())
    }
    pub fn disconnect(&mut self) {
        self.shared.close(DisconnectReason::Explicit);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
impl Drop for ClientWriter {
    fn drop(&mut self) {
        self.disconnect();
    }
}
