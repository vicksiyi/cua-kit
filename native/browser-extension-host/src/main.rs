//! Core Native Messaging entry. Stdout contains framed browser RPC only.
#[cfg(unix)]
mod unix {
    use serde_json::Value;
    use std::{
        fs,
        io::{self, Read},
        os::unix::fs::DirBuilderExt,
        path::PathBuf,
        sync::atomic::{AtomicBool, Ordering},
    };
    static STOP: AtomicBool = AtomicBool::new(false);
    extern "C" fn stop(_: libc::c_int) {
        STOP.store(true, Ordering::Relaxed);
    }
    pub fn run() -> io::Result<()> {
        // SAFETY: handler only stores to a lock-free atomic; no allocation or locks.
        unsafe {
            libc::signal(libc::SIGTERM, stop as *const () as libc::sighandler_t);
            libc::signal(libc::SIGINT, stop as *const () as libc::sighandler_t);
        }
        let args: Vec<_> = std::env::args().skip(1).collect();
        if args.len() != 3 || args[0] != "--config" {
            return Err(io::Error::other(
                "Expected --config <file> <chrome-extension origin>",
            ));
        }
        let mut bytes = Vec::new();
        fs::File::open(&args[1])?
            .take(16385)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 16384 {
            return Err(io::Error::other("Native host configuration exceeds limit"));
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| io::Error::other("Invalid native host configuration"))?;
        let ids = value["extensionIds"]
            .as_array()
            .filter(|ids| !ids.is_empty())
            .ok_or_else(|| io::Error::other("Invalid extension configuration"))?;
        if value["version"].as_u64() != Some(1)
            || ids.iter().any(|id| {
                !id.as_str().is_some_and(|id| {
                    id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b))
                })
            })
        {
            return Err(io::Error::other("Invalid extension configuration"));
        }
        if !ids
            .iter()
            .any(|id| args[2] == format!("chrome-extension://{}/", id.as_str().unwrap()))
        {
            return Err(io::Error::other(
                "Extension origin is not registered for Core native host",
            ));
        }
        let parent = PathBuf::from(
            value["endpointParentDirectory"]
                .as_str()
                .ok_or_else(|| io::Error::other("Explicit endpoint parent required"))?,
        );
        if !parent.is_absolute() {
            return Err(io::Error::other("Endpoint parent must be absolute"));
        }
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&parent)?;
        core_browser_extension_host::runtime::run(
            &parent,
            libc::STDIN_FILENO,
            libc::STDOUT_FILENO,
            &STOP,
        )
    }
}
fn main() {
    #[cfg(unix)]
    if unix::run().is_err() {
        eprintln!(
            "Core native host failed; inspect configuration, connection and endpoint permissions"
        );
        std::process::exit(1);
    }
    #[cfg(not(unix))]
    {
        eprintln!("Core native host currently requires Unix");
        std::process::exit(1);
    }
}
