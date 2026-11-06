//! macOS native file opening reconstructed from the pinned extension_host binary.
//! Validation precedes spawn; `open` receives one literal argument, never a shell.
use std::{
    fs, io,
    os::unix::fs::PermissionsExt,
    path::Path,
    process::{Command, Stdio},
};

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

pub fn validate(path: &str) -> io::Result<()> {
    if path.as_bytes().contains(&0) {
        return Err(invalid("Invalid local file path"));
    }
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err(invalid("Local file path must be absolute"));
    }
    let metadata = fs::symlink_metadata(path).map_err(|_| invalid("Local file does not exist"))?;
    if metadata.file_type().is_symlink() {
        return Err(invalid("Opening symbolic links is not supported"));
    }
    if !metadata.is_file() {
        return Err(invalid("Local file does not exist"));
    }
    let executable_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            ["command", "desktop", "jar", "terminal", "tool"]
                .iter()
                .any(|blocked| extension.eq_ignore_ascii_case(blocked))
        });
    if executable_extension || metadata.permissions().mode() & 0o111 != 0 {
        return Err(invalid("Opening executable files is not supported"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn open(path: &str) -> io::Result<()> {
    validate(path)?;
    let mut child = Command::new("open")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    // Match original asynchronous launch semantics: successful spawn is success;
    // a detached waiter reaps the opener, without awaiting the target GUI app.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
#[cfg(not(target_os = "macos"))]
pub fn open(_path: &str) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Local file opening is implemented for macOS only",
    ))
}
