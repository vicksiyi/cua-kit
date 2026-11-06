#![cfg(unix)]
use core_browser_extension_host::{
    app_server_configuration::LaunchFields,
    app_server_process::{command, spawn},
};
use std::{fs, io::Write, os::unix::fs::PermissionsExt, path::Path};

#[test]
fn command_keeps_path_lookup_and_resolves_relative_paths_before_child_cwd() {
    for input in ["codex", "./bin/codex", "bin/codex", "/absolute/codex", ""] {
        let fields = LaunchFields {
            codex_cli_path: Some(input.into()),
            ..Default::default()
        }
        .resolve(|_| None);
        let command = command(&fields).unwrap();
        let path = Path::new(input);
        let expected = if path.is_absolute() || path.components().count() == 1 {
            path.to_owned()
        } else {
            std::env::current_dir().unwrap().join(path)
        };
        assert_eq!(command.get_program(), expected.as_os_str());
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            ["app-server", "--analytics-default-enabled"]
        );
        assert!(command.get_current_dir().is_none());
        assert_eq!(command.get_envs().count(), 0);
    }
}

#[test]
fn owned_child_receives_arguments_home_and_three_pipes() {
    let root = std::env::temp_dir().join(format!("core-app-server-spawn-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let executable = root.join("fake codex");
    fs::write(&executable, b"#!/bin/sh\nprintf '%s\\n' \"$1\" \"$2\" \"$CODEX_HOME\"\npwd -P\nIFS= read -r line\nprintf '%s' \"$line\"\nprintf 'stderr-pipe' >&2\n").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
    let home = root.join("nested/home");
    let fields = LaunchFields {
        codex_cli_path: Some(executable.to_string_lossy().into()),
        codex_home: Some(home.to_string_lossy().into()),
        ..Default::default()
    }
    .resolve(|_| None);
    let mut child = spawn(&fields).unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"stdin-pipe\n")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(output.stderr, b"stderr-pipe");
    let expected = format!(
        "app-server\n--analytics-default-enabled\n{}\n{}\nstdin-pipe",
        home.display(),
        fs::canonicalize(&home).unwrap().display()
    );
    assert_eq!(String::from_utf8(output.stdout).unwrap(), expected);
    // Failure to prepare home is returned before the executable can run.
    let mut invalid = fields;
    invalid.codex_home = Some(executable.to_string_lossy().into());
    assert!(spawn(&invalid).is_err());
    fs::remove_dir_all(root).unwrap();
}
