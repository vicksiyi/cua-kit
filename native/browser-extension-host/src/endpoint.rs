//! Private Unix listener and Core capability handshake. This is NOT the original
//! host's code-signature peer authorization. Original identity policy remains open.
use crate::transport;
use serde_json::json;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;

fn denied(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, message)
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
struct DeadlineStream<'a> {
    stream: &'a mut UnixStream,
    deadline: Instant,
}
impl DeadlineStream<'_> {
    fn remaining(&self) -> io::Result<Duration> {
        self.deadline
            .checked_duration_since(Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    "native host authentication timed out",
                )
            })
    }
}
impl Read for DeadlineStream<'_> {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        self.stream.set_read_timeout(Some(self.remaining()?))?;
        self.stream.read(bytes)
    }
}
impl Write for DeadlineStream<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.stream.set_write_timeout(Some(self.remaining()?))?;
        self.stream.write(bytes)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.stream.flush()
    }
}

pub struct OwnedEndpoint {
    directory: PathBuf,
    identity: (u64, u64),
    listener: Option<UnixListener>,
    token: String,
}
impl OwnedEndpoint {
    /// Parent must already be absolute, private, non-symlink and owned by this user.
    /// The installer/caller owns its creation; this guard removes only our child.
    pub fn bind(parent: &Path) -> io::Result<Self> {
        if !parent.is_absolute() {
            return Err(denied("endpoint parent must be absolute"));
        }
        let metadata = fs::symlink_metadata(parent)?;
        // SAFETY: geteuid takes no arguments and has no memory preconditions.
        let uid = unsafe { libc::geteuid() };
        if !metadata.is_dir() || metadata.mode() & 0o077 != 0 || metadata.uid() != uid {
            return Err(denied(
                "endpoint parent must be private and owned by the current user",
            ));
        }
        let parent = fs::canonicalize(parent)?;
        let mut random = File::open("/dev/urandom")?;
        for _ in 0..8 {
            let mut bytes = [0u8; 38];
            random.read_exact(&mut bytes)?;
            let directory = parent.join(format!("core-cua-{}", hex(&bytes[..6])));
            match DirBuilder::new().mode(0o700).create(&directory) {
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
                Ok(()) => {}
            }
            let metadata = fs::symlink_metadata(&directory)?;
            let mut endpoint = Self {
                directory,
                identity: (metadata.dev(), metadata.ino()),
                listener: None,
                token: hex(&bytes[6..]),
            };
            let socket = endpoint.directory.join("host.sock");
            endpoint.listener = Some(UnixListener::bind(&socket)?);
            fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))?;
            let mut descriptor = OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(endpoint.descriptor_path())?;
            let socket = socket.to_str().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "socket path is not UTF-8")
            })?;
            serde_json::to_writer(
                &mut descriptor,
                &json!({"version":1,"socketPath":socket,"token":endpoint.token}),
            )?;
            descriptor.flush()?;
            return Ok(endpoint);
        }
        Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "could not allocate private endpoint directory",
        ))
    }
    pub fn descriptor_path(&self) -> PathBuf {
        self.directory.join("endpoint.json")
    }
    pub fn listener(&self) -> &UnixListener {
        self.listener.as_ref().unwrap()
    }
    pub fn authenticate(&self, stream: &mut UnixStream, timeout: Duration) -> io::Result<()> {
        let read_timeout = stream.read_timeout()?;
        let write_timeout = stream.write_timeout()?;
        let result = (|| {
            let deadline = Instant::now().checked_add(timeout).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "invalid authentication timeout",
                )
            })?;
            let mut stream = DeadlineStream { stream, deadline };
            let value = transport::receive(&mut stream, 4096)?
                .ok_or_else(|| denied("native host authentication rejected"))?;
            let token = value.get("token").and_then(|v| v.as_str()).unwrap_or("");
            if value.get("type").and_then(|v| v.as_str()) != Some("core-cua-auth")
                || value.get("version").and_then(|v| v.as_u64()) != Some(1)
                || token.len() != self.token.len()
                || !bool::from(token.as_bytes().ct_eq(self.token.as_bytes()))
            {
                return Err(denied("native host authentication rejected"));
            }
            stream.write_all(&transport::encode(
                &json!({"type":"core-cua-auth-ok","version":1}),
                4096,
            )?)?;
            Ok(())
        })();
        let restore = stream
            .set_read_timeout(read_timeout)
            .and_then(|_| stream.set_write_timeout(write_timeout));
        let result = result.and(restore);
        if result.is_err() {
            let _ = stream.shutdown(Shutdown::Both);
        }
        result
    }
}
impl Drop for OwnedEndpoint {
    fn drop(&mut self) {
        self.listener.take();
        if let Ok(metadata) = fs::symlink_metadata(&self.directory) {
            if metadata.is_dir() && (metadata.dev(), metadata.ino()) == self.identity {
                // Never recursively delete an unexpected directory or follow a replacement.
                let _ = fs::remove_file(self.directory.join("endpoint.json"));
                let _ = fs::remove_file(self.directory.join("host.sock"));
                let _ = fs::remove_dir(&self.directory);
            }
        }
    }
}
