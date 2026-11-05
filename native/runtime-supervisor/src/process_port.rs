//! Owned POSIX worker process and bounded JSONL transport. Sandbox policy is
//! supplied by the caller's launcher; process groups alone are not a sandbox.
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    process::Stdio,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{ChildStdin, Command},
    sync::{mpsc, oneshot},
    task::JoinHandle,
};

#[derive(Clone)]
pub struct ProcessSpec {
    pub command: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    /// Exact environment; never inherit model credentials or caller configuration.
    pub env: BTreeMap<String, String>,
    pub max_frame_bytes: usize,
    pub max_queued_bytes: usize,
    pub terminate_grace: Duration,
}
struct Frame {
    value: Value,
    bytes: usize,
}
pub struct ProcessWorker {
    pub pid: u32,
    input: Option<ChildStdin>,
    frames: mpsc::Receiver<Frame>,
    queued: Arc<AtomicUsize>,
    shutdown: Option<oneshot::Sender<()>>,
    manager: Option<JoinHandle<Result<(), String>>>,
    max_frame_bytes: usize,
    failure: Option<String>,
}
impl ProcessWorker {
    pub async fn start(spec: ProcessSpec) -> Result<Self, String> {
        if !spec.command.is_absolute() || !spec.cwd.is_absolute() {
            return Err("Worker command and cwd must be absolute".into());
        }
        if spec.max_frame_bytes == 0
            || spec.max_queued_bytes < spec.max_frame_bytes
            || spec.terminate_grace > Duration::from_secs(5)
        {
            return Err("Invalid worker transport limits".into());
        }
        let mut command = Command::new(&spec.command);
        command
            .args(&spec.args)
            .current_dir(&spec.cwd)
            .env_clear()
            .envs(&spec.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .process_group(0);
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let pid = child.id().ok_or("Worker PID unavailable")?;
        let input = child.stdin.take();
        let output = child.stdout.take().ok_or("Worker output unavailable")?;
        let (sender, frames) = mpsc::channel(256);
        let queued = Arc::new(AtomicUsize::new(0));
        let reader_queued = queued.clone();
        let mut reader = tokio::spawn(read_frames(
            output,
            sender,
            reader_queued,
            spec.max_frame_bytes,
            spec.max_queued_bytes,
        ));
        let (shutdown, stopped) = oneshot::channel();
        let manager = tokio::spawn(async move {
            let result = tokio::select! {
                _ = stopped => Ok(()),
                read = &mut reader => read.unwrap_or_else(|e| Err(e.to_string())),
                status = child.wait() => {
                    match status {
                        Err(error) => Err(error.to_string()),
                        Ok(_) => match tokio::time::timeout(Duration::from_millis(50), &mut reader).await {
                            Ok(read) => read.unwrap_or_else(|e| Err(e.to_string())),
                            Err(_) => Err("Worker descendants kept output open after exit".into()),
                        }
                    }
                }
            };
            reader.abort();
            // Group retirement also applies if the leader exited before descendants.
            let term = signal_group(&mut child, pid, libc::SIGTERM).await;
            tokio::time::sleep(spec.terminate_grace).await;
            let _ = child.try_wait();
            let kill = signal_group(&mut child, pid, libc::SIGKILL).await;
            let wait = child.wait().await.map_err(|e| e.to_string());
            result.and(term).and(kill).and(wait.map(|_| ()))
        });
        Ok(Self {
            pid,
            input,
            frames,
            queued,
            shutdown: Some(shutdown),
            manager: Some(manager),
            max_frame_bytes: spec.max_frame_bytes,
            failure: None,
        })
    }
    pub async fn send(&mut self, message: &Value) -> Result<(), String> {
        if !message.is_object() {
            return Err("Worker JSONL must contain an object".into());
        }
        if self.manager.as_ref().is_none_or(|task| task.is_finished()) {
            return Err("Worker process is closed".into());
        }
        let mut bytes = serde_json::to_vec(message).map_err(|e| e.to_string())?;
        if bytes.len() > self.max_frame_bytes {
            return Err("Worker input exceeds transport limit".into());
        }
        bytes.push(b'\n');
        self.input
            .as_mut()
            .ok_or("Worker input is closed")?
            .write_all(&bytes)
            .await
            .map_err(|e| e.to_string())
    }
    pub async fn next_message(&mut self) -> Result<Option<Value>, String> {
        match self.frames.recv().await {
            Some(frame) => {
                self.queued.fetch_sub(frame.bytes, Ordering::AcqRel);
                Ok(Some(frame.value))
            }
            None => {
                self.join().await?;
                Ok(None)
            }
        }
    }
    async fn join(&mut self) -> Result<(), String> {
        if let Some(task) = self.manager.take() {
            if let Err(error) = task.await.unwrap_or_else(|e| Err(e.to_string())) {
                self.failure = Some(error);
            }
        }
        self.failure.clone().map_or(Ok(()), Err)
    }
    pub async fn close(&mut self) -> Result<(), String> {
        self.input.take();
        if let Some(stop) = self.shutdown.take() {
            let _ = stop.send(());
        }
        self.join().await
    }
}
impl Drop for ProcessWorker {
    fn drop(&mut self) {
        self.input.take();
        if let Some(stop) = self.shutdown.take() {
            let _ = stop.send(());
        }
        // Manager owns the child and finishes group cleanup after handle drop.
    }
}
async fn signal_group(
    child: &mut tokio::process::Child,
    pid: u32,
    signal: i32,
) -> Result<(), String> {
    // Darwin briefly reports EPERM for zombie-only groups; retry, never ignore
    // persistent permission failures or target a wider process collection.
    for attempt in 0..6 {
        child.try_wait().map_err(|e| e.to_string())?;
        let result = unsafe { libc::kill(-(pid as libc::pid_t), signal) };
        if result == 0 {
            return Ok(());
        }
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            return Ok(());
        }
        if error.raw_os_error() != Some(libc::EPERM) || attempt == 5 {
            return Err(error.to_string());
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    unreachable!()
}

async fn read_frames(
    mut output: tokio::process::ChildStdout,
    sender: mpsc::Sender<Frame>,
    queued: Arc<AtomicUsize>,
    max_frame: usize,
    max_queue: usize,
) -> Result<(), String> {
    let mut chunk = [0u8; 8192];
    let mut line = Vec::new();
    loop {
        let n = output.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if n == 0 {
            return if line.is_empty() {
                Ok(())
            } else {
                Err("Worker ended with a truncated JSONL frame".into())
            };
        }
        for byte in &chunk[..n] {
            if *byte != b'\n' {
                if line.len() >= max_frame {
                    return Err("Worker JSONL frame exceeds limit".into());
                }
                line.push(*byte);
                continue;
            }
            let value: Value = serde_json::from_slice(&line).map_err(|_| "Invalid worker JSONL")?;
            if !value.is_object() {
                return Err("Worker JSONL must contain an object".into());
            }
            let bytes = line.len();
            if queued
                .fetch_add(bytes, Ordering::AcqRel)
                .saturating_add(bytes)
                > max_queue
            {
                queued.fetch_sub(bytes, Ordering::AcqRel);
                return Err("Unconsumed worker output exceeds limit".into());
            }
            if sender.try_send(Frame { value, bytes }).is_err() {
                queued.fetch_sub(bytes, Ordering::AcqRel);
                return Err("Unconsumed worker output exceeds limit".into());
            }
            line.clear();
        }
    }
}
