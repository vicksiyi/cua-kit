//! Local bounded lifecycle metadata. Never records requests, URLs, tokens or error text.
use chrono::{DateTime, SecondsFormat, Utc};
use std::{
    fs::{File, OpenOptions},
    io::{self, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::Path,
    sync::Mutex,
    time::SystemTime,
};
pub struct LifecycleLog(Mutex<File>);
impl LifecycleLog {
    pub fn open(path: &Path) -> io::Result<Self> {
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .append(true)
            .custom_flags(libc::O_NOFOLLOW)
            .mode(0o600)
            .open(path)?;
        let metadata = file.metadata()?;
        // SAFETY: geteuid has no arguments or memory preconditions.
        if !metadata.is_file()
            || metadata.nlink() != 1
            || metadata.mode() & 0o077 != 0
            || metadata.uid() != unsafe { libc::geteuid() }
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "lifecycle log must be private and owned",
            ));
        }
        Ok(Self(Mutex::new(file)))
    }
    pub fn record(&self, event: &str) -> io::Result<()> {
        if ![
            "starting",
            "ready",
            "input-ended",
            "input-error",
            "output-error",
            "invalid-extension-message",
            "server-error",
            "client-cleanup-error",
            "explicit-close",
            "signal-SIGINT",
            "signal-SIGTERM",
            "startup-error",
        ]
        .contains(&event)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "unknown lifecycle event",
            ));
        }
        let mut file = self
            .0
            .lock()
            .map_err(|_| io::Error::other("lifecycle log unavailable"))?;
        if file.metadata()?.len() >= 1024 * 1024 {
            file.set_len(0)?;
        }
        let time: DateTime<Utc> = SystemTime::now().into();
        let mut row = serde_json::to_vec(
            &serde_json::json!({"time":time.to_rfc3339_opts(SecondsFormat::Millis,true),"pid":std::process::id(),"event":event}),
        )?;
        row.push(b'\n');
        file.write_all(&row)
    }
}
