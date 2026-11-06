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

#[test]
fn stop_reaps_only_the_owned_child_and_is_repeatable() {
    use core_browser_extension_host::app_server_process::{stop_child, wait_child};
    use std::{
        process::{Command, Stdio},
        sync::{Arc, Mutex},
    };
    stop_child(None).unwrap();
    // cat stays blocked on its retained pipe without starting any descendants.
    let child = Command::new("/bin/cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let child = Arc::new(Mutex::new(child));
    assert!(child.lock().unwrap().try_wait().unwrap().is_none());
    stop_child(Some(child.clone())).unwrap();
    assert!(child.lock().unwrap().try_wait().unwrap().is_some());
    stop_child(Some(child.clone())).unwrap();
    wait_child(child).unwrap();

    let exited = Arc::new(Mutex::new(Command::new("/usr/bin/false").spawn().unwrap()));
    wait_child(exited.clone()).unwrap(); // nonzero exit is not an I/O error
    assert!(!exited
        .lock()
        .unwrap()
        .try_wait()
        .unwrap()
        .unwrap()
        .success());
    stop_child(Some(exited)).unwrap();
}

#[test]
fn poisoned_child_lock_returns_the_native_error_without_panicking() {
    use core_browser_extension_host::app_server_process::{stop_child, wait_child};
    use std::{
        process::Command,
        sync::{Arc, Mutex},
    };
    let child = Arc::new(Mutex::new(Command::new("/usr/bin/true").spawn().unwrap()));
    wait_child(child.clone()).unwrap(); // reap before poisoning to avoid a leak
    let _ = std::panic::catch_unwind({
        let child = child.clone();
        move || {
            let _guard = child.lock().unwrap();
            panic!("test-only poison");
        }
    });
    for result in [stop_child(Some(child.clone())), wait_child(child)] {
        let error = result.unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::Other);
        assert_eq!(error.to_string(), "app-server child mutex poisoned");
    }
}

#[test]
fn stderr_lines_preserve_content_skip_blank_and_stop_on_invalid_utf8() {
    use core_browser_extension_host::app_server_process::consume_stderr;
    let mut lines = Vec::new();
    let long = "x".repeat(32_000);
    let input = format!("\n \t\r\n\u{2003}\n  message \t\r\n{long}\nlast");
    consume_stderr(input.as_bytes(), |line| lines.push(line.to_owned()));
    assert_eq!(lines, ["  message \t", &long, "last"]);
    lines.clear();
    consume_stderr(&b"first\n\xff\nafter-invalid\n"[..], |line| {
        lines.push(line.to_owned())
    });
    assert_eq!(lines, ["first"]);
}

#[test]
fn stderr_consumer_drains_more_than_pipe_capacity() {
    use core_browser_extension_host::app_server_process::consume_stderr;
    use std::{
        process::{Command, Stdio},
        thread,
    };
    // A dedicated cat forwards owned test input to stderr; no extra process.
    let mut child = Command::new("/bin/sh")
        .args(["-c", "exec /bin/cat >&2"])
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let stderr = child.stderr.take().unwrap();
    let drain = thread::spawn(move || {
        let mut count = 0;
        consume_stderr(stderr, |line| {
            assert_eq!(line.len(), 1024);
            count += 1;
        });
        count
    });
    let mut stdin = child.stdin.take().unwrap();
    let line = format!("{}\n", "x".repeat(1024));
    for _ in 0..1024 {
        stdin.write_all(line.as_bytes()).unwrap();
    }
    drop(stdin);
    assert!(child.wait().unwrap().success());
    assert_eq!(drain.join().unwrap(), 1024);
}

#[test]
fn ensure_reuses_replaces_and_stops_real_owned_processes() {
    use core_browser_extension_host::{
        app_server_configuration::LoadedLaunchConfiguration,
        app_server_manifest::{
            LoadedManifestEntry, RawManifestConfiguration, SelectedManifestEntry,
        },
        app_server_output::{stop_process, OutputState},
        app_server_process::ensure_started,
    };
    use std::sync::{Arc, Mutex};
    let root = std::env::temp_dir().join(format!("core-ensure-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let executable = root.join("fake-cli");
    fs::write(&executable, b"#!/bin/sh\nexec /bin/cat\n").unwrap();
    fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
    let mut config = LoadedLaunchConfiguration {
        launch: LaunchFields {
            codex_cli_path: Some(executable.to_string_lossy().into()),
            ..Default::default()
        }
        .resolve(|_| None),
        selection: LoadedManifestEntry {
            registry_path: "unused".into(),
            selected: SelectedManifestEntry {
                index: 0,
                configuration: RawManifestConfiguration::default(),
            },
        },
    };
    let state = Arc::new(Mutex::new(OutputState::default()));
    ensure_started(&state, &config).unwrap();
    let old_child = state.lock().unwrap().child.clone().unwrap();
    let first_pid = old_child.lock().unwrap().id();
    ensure_started(&state, &config).unwrap();
    assert_eq!(state.lock().unwrap().generation, 1);
    assert_eq!(
        state
            .lock()
            .unwrap()
            .child
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .id(),
        first_pid
    );
    config.launch.node_path = "changed-node".into();
    ensure_started(&state, &config).unwrap();
    {
        let state = state.lock().unwrap();
        assert_eq!(state.generation, 2);
        assert_ne!(
            state.child.as_ref().unwrap().lock().unwrap().id(),
            first_pid
        );
        assert_eq!(
            state.runtime_state.as_ref().unwrap().node_path,
            "changed-node"
        );
    }
    assert!(old_child.lock().unwrap().try_wait().unwrap().is_some());
    let last_child = state.lock().unwrap().child.clone().unwrap();
    stop_process(&state).unwrap();
    assert!(last_child.lock().unwrap().try_wait().unwrap().is_some());
    // A launch failure clears old state but does not increment the generation.
    config.launch.codex_cli_path = root.join("missing").to_string_lossy().into();
    assert!(ensure_started(&state, &config).is_err());
    {
        let state = state.lock().unwrap();
        assert_eq!(state.generation, 3);
        assert!(state.child.is_none() && state.stdin.is_none() && state.runtime_state.is_none());
    }
    fs::remove_dir_all(root).unwrap();
}
