//! Command construction from AppServerProcess::ensure_started, 0x100020278..0x1000205e0.
//! Process reuse, proxy threads and shutdown are separate lifecycle work.
use crate::app_server_configuration::ResolvedLaunchFields;
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};

/// Bare executable names retain PATH lookup. Relative paths with other than
/// one component resolve against the host cwd before the child's cwd changes.
fn executable_path(path: &Path) -> io::Result<PathBuf> {
    if path.is_absolute() || path.components().count() == 1 {
        Ok(path.to_owned())
    } else {
        Ok(env::current_dir()?.join(path))
    }
}

pub fn command(fields: &ResolvedLaunchFields) -> io::Result<Command> {
    let mut command = Command::new(executable_path(Path::new(&fields.codex_cli_path))?);
    command.args(["app-server", "--analytics-default-enabled"]);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(home) = &fields.codex_home {
        let home = Path::new(home);
        let home = if home.is_absolute() {
            home.to_owned()
        } else {
            env::current_dir()?.join(home)
        };
        fs::create_dir_all(&home)?;
        command.current_dir(&home).env("CODEX_HOME", &home);
    }
    Ok(command)
}

/// Starts only the configured app-server, with all three pipes returned to the
/// owner. The caller must drain output, implement proxy setup and reap the child.
/// It does not establish a connected runtime or replace ensure_started.
pub fn spawn(fields: &ResolvedLaunchFields) -> io::Result<Child> {
    command(fields)?.spawn()
}

pub type SharedChild = std::sync::Arc<std::sync::Mutex<Child>>;

/// Native stop_app_server_child: absent/already-exited children succeed; a live
/// child is killed then reaped. Only InvalidInput from kill is ignored.
pub fn stop_child(child: Option<SharedChild>) -> io::Result<()> {
    let Some(child) = child else {
        return Ok(());
    };
    let mut child = child
        .lock()
        .map_err(|_| io::Error::other("app-server child mutex poisoned"))?;
    if child.try_wait()?.is_some() {
        return Ok(());
    }
    if let Err(error) = child.kill() {
        if error.kind() != io::ErrorKind::InvalidInput {
            return Err(error);
        }
    }
    child.wait().map(|_| ())
}

/// Native wait_app_server_child holds the child mutex through wait and discards
/// the exit status. Callers must preserve the original lifecycle ordering.
pub fn wait_child(child: SharedChild) -> io::Result<()> {
    child
        .lock()
        .map_err(|_| io::Error::other("app-server child mutex poisoned"))?
        .wait()
        .map(|_| ())
}

/// Original stderr worker uses BufReader::lines, stops on read/UTF-8 error,
/// skips whitespace-only lines and prints the original (untrimmed) line.
/// The callback keeps deterministic tests separate from process stderr.
pub fn consume_stderr(reader: impl io::Read, mut emit: impl FnMut(&str)) {
    use io::BufRead;
    for line in io::BufReader::with_capacity(8192, reader).lines() {
        let Ok(line) = line else { break };
        if !line.trim().is_empty() {
            emit(&line);
        }
    }
}

/// The native worker's JoinHandle is dropped immediately (detached). This
/// consumes the supplied pipe; callers must not retain a second stderr reader.
pub fn drain_child_stderr(stderr: std::process::ChildStderr) {
    drop(std::thread::spawn(move || {
        consume_stderr(stderr, |line| {
            eprintln!("extension-host: app-server stderr: {line}");
        });
    }));
}
