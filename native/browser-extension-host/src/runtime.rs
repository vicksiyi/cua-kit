//! Native Core host composition. Original app-server/signature policy is not implemented.
use crate::{
    client_writer::{ClientWriter, Disconnect, QueueLimits},
    endpoint::OwnedEndpoint,
    rpc_router::{Delivery, Destination, RpcRouter},
    transport::{self, Decoder},
};
use serde_json::Value;
use std::{
    collections::{BTreeMap, VecDeque},
    fs::File,
    io::{self, Read, Write},
    net::Shutdown,
    os::{
        fd::{AsRawFd, FromRawFd, RawFd},
        unix::{fs::FileTypeExt, net::UnixStream},
    },
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender, TrySendError},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
const MAX_FRAME: usize = 1024 * 1024;
const MAX_CONNECTIONS: usize = 64;
const MAX_QUEUED_BYTES: usize = 4 * MAX_FRAME;
fn failure(message: &'static str) -> io::Error {
    io::Error::other(message)
}

struct NonblockingFile {
    file: File,
    flags: i32,
}
impl NonblockingFile {
    fn duplicate(fd: RawFd) -> io::Result<Self> {
        // SAFETY: dup returns a new owned descriptor; fcntl receives valid fd/flags.
        let copy = unsafe { libc::dup(fd) };
        if copy < 0 {
            return Err(io::Error::last_os_error());
        }
        let file = unsafe { File::from_raw_fd(copy) };
        let flags = unsafe { libc::fcntl(copy, libc::F_GETFL) };
        if flags < 0 || unsafe { libc::fcntl(copy, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { file, flags })
    }
}
impl Drop for NonblockingFile {
    fn drop(&mut self) {
        unsafe {
            libc::fcntl(self.file.as_raw_fd(), libc::F_SETFL, self.flags);
        }
    }
}
struct Output {
    frames: VecDeque<Vec<u8>>,
    offset: usize,
    bytes: usize,
}
impl Output {
    fn new() -> Self {
        Self {
            frames: VecDeque::new(),
            offset: 0,
            bytes: 0,
        }
    }
    fn enqueue(&mut self, message: &Value) -> io::Result<()> {
        let frame = transport::encode(message, MAX_FRAME)?;
        if self.frames.len() >= 1024 || frame.len() > MAX_QUEUED_BYTES.saturating_sub(self.bytes) {
            return Err(failure("extension output queue exceeded"));
        }
        self.bytes += frame.len();
        self.frames.push_back(frame);
        Ok(())
    }
    fn flush(&mut self, output: &mut File) -> io::Result<()> {
        while let Some(frame) = self.frames.front() {
            match output.write(&frame[self.offset..]) {
                Ok(0) => return Err(failure("extension output closed")),
                Ok(size) => {
                    self.offset += size;
                    if self.offset == frame.len() {
                        self.bytes -= frame.len();
                        self.frames.pop_front();
                        self.offset = 0;
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }
}
enum Event {
    Ready(String),
    Message(String, Value),
    Closed(String),
}
struct Connection {
    cancel: Arc<AtomicBool>,
    stream: UnixStream,
    reader: Option<JoinHandle<()>>,
    writer: Option<ClientWriter>,
}
impl Drop for Connection {
    fn drop(&mut self) {
        self.cancel.store(true, Ordering::Release);
        let _ = self.stream.shutdown(Shutdown::Both);
        self.writer.take();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
fn publish(sender: &SyncSender<Event>, mut event: Event, cancel: &AtomicBool) -> bool {
    while !cancel.load(Ordering::Acquire) {
        match sender.try_send(event) {
            Ok(()) => return true,
            Err(TrySendError::Disconnected(_)) => return false,
            Err(TrySendError::Full(returned)) => {
                event = returned;
                thread::sleep(Duration::from_millis(2));
            }
        }
    }
    false
}
fn start_reader(
    id: String,
    stream: UnixStream,
    endpoint: Arc<OwnedEndpoint>,
    sender: SyncSender<Event>,
) -> io::Result<Connection> {
    // macOS accepts can inherit O_NONBLOCK from the listening socket. Reader
    // threads use bounded blocking authentication and interruptible blocking reads.
    stream.set_nonblocking(false)?;
    let mut reader = stream.try_clone()?;
    let cancel = Arc::new(AtomicBool::new(false));
    let flag = cancel.clone();
    let worker = thread::Builder::new()
        .name("core-host-reader".into())
        .spawn(move || {
            if endpoint
                .authenticate(&mut reader, Duration::from_secs(5))
                .is_ok()
                && publish(&sender, Event::Ready(id.clone()), &flag)
            {
                while !flag.load(Ordering::Acquire) {
                    match transport::receive(&mut reader, MAX_FRAME) {
                        Ok(Some(message)) => {
                            if !publish(&sender, Event::Message(id.clone(), message), &flag) {
                                break;
                            }
                        }
                        _ => break,
                    }
                }
            }
            publish(&sender, Event::Closed(id), &flag);
        })?;
    Ok(Connection {
        cancel,
        stream,
        reader: Some(worker),
        writer: None,
    })
}
fn remove(
    id: &str,
    connections: &mut BTreeMap<String, Connection>,
    router: &mut RpcRouter,
) -> Vec<Delivery> {
    connections.remove(id);
    router.remove_client(id)
}
fn deliver(
    deliveries: Vec<Delivery>,
    connections: &mut BTreeMap<String, Connection>,
    router: &mut RpcRouter,
    output: &mut Output,
) -> io::Result<()> {
    let mut pending: VecDeque<_> = deliveries.into();
    while let Some(delivery) = pending.pop_front() {
        match &delivery.destination {
            Destination::Extension => output.enqueue(&delivery.message)?,
            Destination::Client(id) => {
                let sent = connections
                    .get(id)
                    .and_then(|c| c.writer.as_ref())
                    .is_some_and(|writer| writer.enqueue(&delivery.message).is_ok());
                if !sent {
                    pending.extend(remove(id, connections, router));
                }
            }
        }
    }
    Ok(())
}

/// Caller owns stdio descriptors. Runs until EOF, failure, or the supplied stop flag.
/// Joins all client workers and drops the private endpoint on every return path.
pub fn run(parent: &Path, input_fd: RawFd, output_fd: RawFd, stop: &AtomicBool) -> io::Result<()> {
    run_with_lifecycle(parent, input_fd, output_fd, stop, &|_| {})
}
pub fn run_with_lifecycle(
    parent: &Path,
    input_fd: RawFd,
    output_fd: RawFd,
    stop: &AtomicBool,
    report: &dyn Fn(&str),
) -> io::Result<()> {
    let endpoint = Arc::new(OwnedEndpoint::bind(parent)?);
    endpoint.listener().set_nonblocking(true)?;
    let mut input = NonblockingFile::duplicate(input_fd)?;
    let mut output_fd = NonblockingFile::duplicate(output_fd)?;
    // libuv/macOS child stdio can be a socketpair. An idle peer close makes
    // its read half readable (EOF), without POLLHUP when no writes are pending.
    let output_close_event = if output_fd.file.metadata()?.file_type().is_socket() {
        libc::POLLIN
    } else {
        0
    };
    let (sender, events) = mpsc::sync_channel(128);
    let (notice_sender, notices) = mpsc::channel::<Disconnect>();
    let mut connections = BTreeMap::new();
    let mut router = RpcRouter::new(30_000, 1024);
    let mut output = Output::new();
    let mut decoder = Decoder::new(MAX_FRAME);
    let epoch = Instant::now();
    let mut serial = 0_u64;
    eprintln!(
        "@core native host endpoint: {}",
        endpoint.descriptor_path().display()
    );
    report("ready");
    let mut final_event = "server-error";
    let result = (|| {
        while !stop.load(Ordering::Acquire) {
            let now = epoch.elapsed().as_millis().min(u64::MAX as u128) as u64;
            let expired = router.expire(now);
            deliver(expired, &mut connections, &mut router, &mut output)?;
            for notice in notices.try_iter() {
                let deliveries = remove(&notice.client, &mut connections, &mut router);
                deliver(deliveries, &mut connections, &mut router, &mut output)?;
            }
            for _ in 0..64 {
                let Ok(event) = events.try_recv() else {
                    break;
                };
                match event {
                    Event::Ready(id) => {
                        if let Some(connection) = connections.get_mut(&id) {
                            let writer = ClientWriter::start(
                                id.clone(),
                                connection.stream.try_clone()?,
                                QueueLimits {
                                    max_messages: 1024,
                                    max_bytes: MAX_QUEUED_BYTES,
                                    max_frame_bytes: MAX_FRAME,
                                },
                                notice_sender.clone(),
                            )?;
                            router.add_client(&id).map_err(failure)?;
                            connection.writer = Some(writer);
                        }
                    }
                    Event::Message(id, message) => {
                        if !connections.contains_key(&id) {
                            continue;
                        }
                        let deliveries = match router.from_client(&id, message, now) {
                            Ok(messages) => messages,
                            Err(_) => remove(&id, &mut connections, &mut router),
                        };
                        deliver(deliveries, &mut connections, &mut router, &mut output)?;
                    }
                    Event::Closed(id) => {
                        let deliveries = remove(&id, &mut connections, &mut router);
                        deliver(deliveries, &mut connections, &mut router, &mut output)?;
                    }
                }
            }
            for _ in 0..16 {
                match endpoint.listener().accept() {
                    Ok((stream, _)) => {
                        if connections.len() >= MAX_CONNECTIONS {
                            let _ = stream.shutdown(Shutdown::Both);
                            continue;
                        }
                        serial = serial
                            .checked_add(1)
                            .ok_or_else(|| failure("connection identifier exhausted"))?;
                        let id = serial.to_string();
                        let connection =
                            start_reader(id.clone(), stream, endpoint.clone(), sender.clone())?;
                        connections.insert(id, connection);
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                    Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                    Err(error) => return Err(error),
                }
            }
            output.flush(&mut output_fd.file).map_err(|error| {
                final_event = "output-error";
                error
            })?;
            let mut poll = [
                libc::pollfd {
                    fd: input.file.as_raw_fd(),
                    events: libc::POLLIN,
                    revents: 0,
                },
                libc::pollfd {
                    fd: output_fd.file.as_raw_fd(),
                    events: output_close_event
                        | if output.frames.is_empty() {
                            0
                        } else {
                            libc::POLLOUT
                        },
                    revents: 0,
                },
                libc::pollfd {
                    fd: endpoint.listener().as_raw_fd(),
                    events: libc::POLLIN,
                    revents: 0,
                },
            ];
            // SAFETY: poll points to the initialized fixed array for its exact length.
            if unsafe { libc::poll(poll.as_mut_ptr(), poll.len() as libc::nfds_t, 10) } < 0 {
                let error = io::Error::last_os_error();
                if error.kind() == io::ErrorKind::Interrupted {
                    continue;
                }
                return Err(error);
            }
            if poll[1].revents
                & (output_close_event | libc::POLLERR | libc::POLLHUP | libc::POLLNVAL)
                != 0
            {
                final_event = "output-error";
                return Err(failure("extension output closed"));
            }
            if poll[0].revents != 0 {
                for _ in 0..16 {
                    let mut bytes = [0u8; 8192];
                    match input.file.read(&mut bytes) {
                        Ok(0) => {
                            let result = decoder.finish();
                            final_event = if result.is_ok() {
                                "input-ended"
                            } else {
                                "invalid-extension-message"
                            };
                            return result;
                        }
                        Ok(count) => {
                            for message in decoder.feed(&bytes[..count]).map_err(|error| {
                                final_event = "invalid-extension-message";
                                error
                            })? {
                                let deliveries =
                                    router.from_extension(message, now).map_err(|error| {
                                        final_event = "invalid-extension-message";
                                        failure(error)
                                    })?;
                                deliver(deliveries, &mut connections, &mut router, &mut output)?;
                            }
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                        Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                        Err(error) => {
                            final_event = "input-error";
                            return Err(error);
                        }
                    }
                }
            }
        }
        final_event = "explicit-close";
        Ok(())
    })();
    report(final_event);
    router.close();
    connections.clear();
    result
}
