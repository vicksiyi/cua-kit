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
