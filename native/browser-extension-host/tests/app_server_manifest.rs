use core_browser_extension_host::app_server_manifest::{
    entries, required_manifest_path_exists, validate_entry_schema, ManifestError,
};
use serde_json::{json, Value};
use std::fs;

#[test]
fn schema_shape_is_strict_without_selecting_or_reordering_entries() {
    for version in [
        json!(null),
        json!(true),
        json!("2"),
        json!(1),
        json!(-2),
        json!(2.0),
    ] {
        assert_eq!(
            entries(&json!({"schemaVersion":version,"entries":[]})),
            Err(ManifestError::DocumentSchema)
        );
        assert_eq!(
            validate_entry_schema(&json!({"schemaVersion":version})),
            Err(ManifestError::EntrySchema)
        );
    }
    for value in [
        Value::Null,
        json!([]),
        json!({}),
        json!({"schemaVersion":2}),
        json!({"schemaVersion":2,"entries":{}}),
    ] {
        assert!(entries(&value).is_err());
    }
    assert!(entries(&json!({"schemaVersion":2,"entries":[]}))
        .unwrap()
        .is_empty());
    let doc = json!({"schemaVersion":2,"unknown":42,"entries":[{"schemaVersion":2,"extra":"first"},{"schemaVersion":1}]});
    let borrowed = entries(&doc).unwrap();
    assert!(std::ptr::eq(&borrowed[0], &doc["entries"][0]));
    assert_eq!(borrowed[0]["extra"], "first");
    assert!(validate_entry_schema(&borrowed[0]).is_ok());
    assert_eq!(
        validate_entry_schema(&borrowed[1]),
        Err(ManifestError::EntrySchema)
    );
}

#[test]
fn required_paths_use_trimmed_metadata_and_common_missing_error() {
    let root = std::env::temp_dir().join(format!("core-manifest-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let file = root.join("non-executable.txt");
    fs::write(&file, b"fixture").unwrap();
    for path in [&root, &file] {
        let entry = json!({"paths":{"nodePath":format!("\u{2003}{}\t",path.display())}});
        assert_eq!(required_manifest_path_exists(&entry, "nodePath"), Ok(()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::{fs::symlink, fs::PermissionsExt};
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
        let link = root.join("link");
        symlink(&file, &link).unwrap();
        let entry = json!({"paths":{"nodePath":link}});
        assert_eq!(required_manifest_path_exists(&entry, "nodePath"), Ok(()));
        fs::remove_file(&file).unwrap();
        assert_eq!(
            required_manifest_path_exists(&entry, "nodePath"),
            Err(ManifestError::RequiredPath("nodePath".into()))
        );
    }
    for entry in [
        json!(null),
        json!({}),
        json!({"paths":[]}),
        json!({"paths":{"nodePath":false}}),
        json!({"paths":{"nodePath":" \t\u{2003}"}}),
        json!({"paths":{"nodePath":root.join("absent")}}),
        json!({"paths":{"nodePath":"invalid\u{0000}path"}}),
    ] {
        let error = required_manifest_path_exists(&entry, "nodePath").unwrap_err();
        assert_eq!(error, ManifestError::RequiredPath("nodePath".into()));
        assert_eq!(
            error.to_string(),
            "Codex app-server manifest entry is missing required path nodePath"
        );
    }
}

#[test]
fn identity_constraints_are_exact_and_add_observed_weights() {
    use core_browser_extension_host::app_server_manifest::{identity_score, IdentityConstraints};
    use std::path::Path;
    let entry = json!({"paths":{"extensionHostPath":"/not-required-to-exist/host"},"nativeHostNames":[false,"host"],"extensionIds":[42,"id"],"extensionBuildChannels":[null,"stable"]});
    for mask in 0..16 {
        let constraints = IdentityConstraints {
            extension_host_path: (mask & 1 != 0)
                .then_some(Path::new("/not-required-to-exist/./host")),
            native_host_name: (mask & 2 != 0).then_some("host"),
            extension_id: (mask & 4 != 0).then_some("id"),
            extension_build_channel: (mask & 8 != 0).then_some("stable"),
        };
        let expected = [100, 50, 25, 10]
            .iter()
            .enumerate()
            .filter(|(bit, _)| mask & (1 << bit) != 0)
            .map(|(_, weight)| weight)
            .sum();
        assert_eq!(identity_score(&entry, &constraints), Some(expected));
    }
    assert_eq!(
        identity_score(&Value::Null, &IdentityConstraints::default()),
        Some(0)
    );
    let constraints = IdentityConstraints {
        extension_id: Some("id"),
        ..Default::default()
    };
    for field in [
        json!(null),
        json!("id"),
        json!([]),
        json!(["ID"]),
        json!([" id "]),
        json!([1, true]),
    ] {
        assert_eq!(
            identity_score(&json!({"extensionIds":field}), &constraints),
            None
        );
    }
    assert_eq!(
        identity_score(&json!({"extensionIds":["id","id"]}), &constraints),
        Some(25)
    );
    assert_eq!(
        identity_score(
            &json!({"extensionIds":[""]}),
            &IdentityConstraints {
                extension_id: Some(""),
                ..Default::default()
            }
        ),
        Some(25)
    );
}

#[cfg(unix)]
#[test]
fn identity_path_falls_back_to_canonicalization_without_trimming() {
    use core_browser_extension_host::app_server_manifest::{identity_score, IdentityConstraints};
    use std::os::unix::fs::symlink;
    let root =
        std::env::temp_dir().join(format!("core-manifest-identity-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let actual = root.join("host");
    let alias = root.join("alias");
    fs::write(&actual, b"fixture").unwrap();
    symlink(&actual, &alias).unwrap();
    let constraints = IdentityConstraints {
        extension_host_path: Some(&actual),
        ..Default::default()
    };
    assert_eq!(
        identity_score(&json!({"paths":{"extensionHostPath":alias}}), &constraints),
        Some(100)
    );
    assert_eq!(
        identity_score(
            &json!({"paths":{"extensionHostPath":format!(" {} ",actual.display())}}),
            &constraints
        ),
        None
    );
    for entry in [
        json!({}),
        json!({"paths":{"extensionHostPath":false}}),
        json!({"paths":{"extensionHostPath":root.join("missing")}}),
    ] {
        assert_eq!(identity_score(&entry, &constraints), None);
    }
    fs::remove_file(&actual).unwrap();
    assert_eq!(
        identity_score(&json!({"paths":{"extensionHostPath":alias}}), &constraints),
        None
    );
    assert_eq!(
        identity_score(&json!({"paths":{"extensionHostPath":actual}}), &constraints),
        Some(100)
    );
}

#[test]
fn protocols_require_exact_integers_and_newer_mismatch_takes_priority() {
    use core_browser_extension_host::app_server_manifest::{
        validate_protocols, ProtocolMismatch::*, ProtocolRequirements,
    };
    let required = ProtocolRequirements {
        app_server: Some(2),
        native_host: Some(2),
    };
    let values = [
        json!(null),
        json!(true),
        json!("2"),
        json!(2.0),
        json!(-1),
        json!(0),
        json!(1),
        json!(2),
        json!(3),
        json!(u64::MAX),
    ];
    for app in &values {
        for host in &values {
            let expected =
                if app.as_u64().is_some_and(|v| v > 2) || host.as_u64().is_some_and(|v| v > 2) {
                    Err(CandidateNewer)
                } else if app.as_u64() == Some(2) && host.as_u64() == Some(2) {
                    Ok(())
                } else {
                    Err(CandidateOlderOrMissing)
                };
            assert_eq!(
                validate_protocols(
                    &json!({"appServerProtocolVersion":app,"nativeHostProtocolVersion":host}),
                    &required
                ),
                expected
            );
        }
    }
    assert_eq!(
        validate_protocols(&Value::Null, &ProtocolRequirements::default()),
        Ok(())
    );
    assert_eq!(
        validate_protocols(
            &json!({"nativeHostProtocolVersion":0}),
            &ProtocolRequirements {
                app_server: None,
                native_host: Some(0)
            }
        ),
        Ok(())
    );
    assert_eq!(
        validate_protocols(
            &json!({"appServerProtocolVersion":u64::MAX}),
            &ProtocolRequirements {
                app_server: Some(u64::MAX),
                native_host: None
            }
        ),
        Ok(())
    );
}

#[test]
fn ranking_uses_pid_shape_then_lexical_timestamp_and_keeps_first_tie() {
    use core_browser_extension_host::app_server_manifest::{
        candidate_is_preferred, presence_bonus,
    };
    for value in [json!(0), json!(123), json!(u64::MAX)] {
        assert_eq!(presence_bonus(&json!({"presence":{"pid":value}})), 1);
    }
    for value in [
        json!(null),
        json!("123"),
        json!(-1),
        json!(123.0),
        json!(true),
    ] {
        assert_eq!(presence_bonus(&json!({"presence":{"pid":value}})), 0);
    }
    let first = json!({"updatedAt":"9"});
    let second = json!({"updatedAt":"10"});
    assert!(!candidate_is_preferred(&second, 100, &first, 100));
    assert!(candidate_is_preferred(&second, 101, &first, 100));
    assert!(!candidate_is_preferred(&first, 100, &first, 100));
    assert!(candidate_is_preferred(
        &json!({"presence":{"pid":0}}),
        100,
        &first,
        100
    ));
    assert!(!candidate_is_preferred(
        &json!({"updatedAt":999}),
        100,
        &Value::Null,
        100
    ));
    assert!(candidate_is_preferred(
        &json!({"updatedAt":" "}),
        100,
        &Value::Null,
        100
    ));
}

#[test]
fn runtime_paths_validate_all_four_fields_in_native_order() {
    use core_browser_extension_host::app_server_manifest::validate_runtime_paths;
    let root = std::env::temp_dir().join(format!("core-manifest-paths-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let mut entry = json!({"paths":{}});
    for field in ["codexCliPath", "codexHome", "nodePath", "resourcesPath"] {
        assert_eq!(
            validate_runtime_paths(&entry),
            Err(ManifestError::RequiredPath(field.into()))
        );
        entry["paths"][field] = json!(root);
    }
    assert_eq!(validate_runtime_paths(&entry), Ok(()));
}

#[test]
fn raw_configuration_reads_correct_levels_and_trims_optional_strings() {
    use core_browser_extension_host::app_server_manifest::extract_configuration;
    let mut entry = json!({"paths":{}});
    let top = [
        "appVersion",
        "channel",
        "cliVersion",
        "entryId",
        "nativeHostVersion",
        "proxyHost",
    ];
    let nested = [
        "browserClientPath",
        "browserServicePath",
        "codexCliPath",
        "codexHome",
        "nodePath",
        "nodeReplPath",
    ];
    for key in top {
        entry[key] = json!(format!(" \u{2003}{key}\t"));
        entry["paths"][key] = json!("wrong-level");
    }
    for key in nested {
        entry["paths"][key] = json!(format!("\t{key} \u{2003}"));
        entry[key] = json!("wrong-level");
    }
    entry["appServerProtocolVersion"] = json!(0);
    entry["nativeHostProtocolVersion"] = json!(u64::MAX);
    let config = extract_configuration(&entry).unwrap();
    assert_eq!(
        [
            config.app_version,
            config.channel,
            config.cli_version,
            config.entry_id,
            config.native_host_version,
            config.proxy_host
        ],
        top.map(|s| Some(s.into()))
    );
    assert_eq!(
        [
            config.browser_client_path,
            config.browser_service_path,
            config.codex_cli_path,
            config.codex_home,
            config.node_path,
            config.node_repl_path
        ],
        nested.map(|s| Some(s.into()))
    );
    assert_eq!(config.app_server_protocol_version, Some(0));
    assert_eq!(config.native_host_protocol_version, Some(u64::MAX));
    for value in [
        Value::Null,
        json!(true),
        json!(1),
        json!([]),
        json!({}),
        json!(""),
        json!(" \u{2003}\t"),
    ] {
        for key in top {
            entry[key] = value.clone();
        }
        for key in nested {
            entry["paths"][key] = value.clone();
        }
        entry["appServerProtocolVersion"] = json!(2.0);
        entry["nativeHostProtocolVersion"] = json!("2");
        assert_eq!(extract_configuration(&entry).unwrap(), Default::default());
    }
    for invalid in [
        Value::Null,
        json!([]),
        json!({}),
        json!({"paths":null}),
        json!({"paths":[]}),
    ] {
        assert_eq!(
            extract_configuration(&invalid),
            Err(ManifestError::MalformedEntry)
        );
    }
}

#[test]
fn manifest_ports_are_nonzero_u16_without_coercion() {
    use core_browser_extension_host::app_server_manifest::extract_configuration;
    for port in 0..=65536u64 {
        let expected = if (1..=65535).contains(&port) {
            Some(port as u16)
        } else {
            None
        };
        assert_eq!(
            extract_configuration(&json!({"paths":{},"proxyPort":port}))
                .unwrap()
                .proxy_port,
            expected
        );
    }
    for value in [
        json!(-1),
        json!(1.0),
        json!("123"),
        json!(true),
        json!(u64::MAX),
    ] {
        assert_eq!(
            extract_configuration(&json!({"paths":{},"proxyPort":value}))
                .unwrap()
                .proxy_port,
            None
        );
    }
}

#[test]
fn registry_selection_composes_filters_ranking_and_error_retention() {
    use core_browser_extension_host::app_server_manifest::{
        select_entry, IdentityConstraints, ProtocolMismatch::*, ProtocolRequirements,
    };
    let root = std::env::temp_dir().join(format!("core-registry-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let good = json!({"schemaVersion":2,"extensionIds":["id"],"appServerProtocolVersion":2,"paths":{"codexCliPath":root,"codexHome":root,"nodePath":root,"resourcesPath":root},"entryId":" first ","updatedAt":"1"});
    let identity = IdentityConstraints {
        extension_id: Some("id"),
        ..Default::default()
    };
    let protocols = ProtocolRequirements {
        app_server: Some(2),
        native_host: None,
    };
    let run = |values: Vec<Value>| {
        select_entry(
            &json!({"schemaVersion":2,"entries":values}),
            &identity,
            &protocols,
        )
    };
    let mut wrong_id = good.clone();
    wrong_id["extensionIds"] = json!(["other"]);
    wrong_id["updatedAt"] = json!("z");
    let mut newer = good.clone();
    newer["appServerProtocolVersion"] = json!(3);
    let mut older = good.clone();
    older["appServerProtocolVersion"] = json!(1);
    let mut missing_cli = good.clone();
    missing_cli["paths"]["codexCliPath"] = Value::Null;
    let mut missing_node = good.clone();
    missing_node["paths"]["nodePath"] = Value::Null;
    let mut later = good.clone();
    later["updatedAt"] = json!("2");
    later["entryId"] = json!(" later ");
    let selected = run(vec![
        wrong_id.clone(),
        newer.clone(),
        missing_cli.clone(),
        good.clone(),
        later.clone(),
        later.clone(),
    ])
    .unwrap();
    assert_eq!(selected.index, 4);
    assert_eq!(selected.configuration.entry_id.as_deref(), Some("later"));
    let mut present = good.clone();
    present["presence"] = json!({"pid":0});
    assert_eq!(run(vec![later.clone(), present]).unwrap().index, 1);
    assert_eq!(
        run(vec![newer.clone(), older.clone()]).unwrap_err(),
        ManifestError::Protocol(CandidateNewer)
    );
    assert_eq!(
        run(vec![older.clone(), newer.clone()]).unwrap_err(),
        ManifestError::Protocol(CandidateNewer)
    );
    assert_eq!(
        run(vec![older]).unwrap_err(),
        ManifestError::Protocol(CandidateOlderOrMissing)
    );
    assert_eq!(
        run(vec![
            missing_cli.clone(),
            newer.clone(),
            missing_node.clone()
        ])
        .unwrap_err(),
        ManifestError::RequiredPath("nodePath".into())
    );
    assert_eq!(
        run(vec![missing_node, newer.clone(), missing_cli]).unwrap_err(),
        ManifestError::RequiredPath("codexCliPath".into())
    );
    assert_eq!(
        run(vec![wrong_id]).unwrap_err(),
        ManifestError::NoCompatibleEntry
    );
    assert_eq!(run(vec![]).unwrap_err(), ManifestError::NoCompatibleEntry);
    // A viable candidate wins over retained nonfatal errors in either order.
    assert_eq!(run(vec![good.clone(), newer.clone()]).unwrap().index, 0);
    assert_eq!(run(vec![newer, good.clone()]).unwrap().index, 1);
    // Schema failures are fatal before identity filtering, even after a winner.
    let invalid = json!({"schemaVersion":1,"extensionIds":["other"]});
    assert_eq!(
        run(vec![good.clone(), invalid.clone()]).unwrap_err(),
        ManifestError::EntrySchema
    );
    assert_eq!(
        run(vec![invalid, good]).unwrap_err(),
        ManifestError::EntrySchema
    );
}

#[test]
fn registry_discovery_preserves_native_os_paths_and_candidate_order() {
    use core_browser_extension_host::app_server_manifest::registry_paths;
    use std::{collections::BTreeMap, ffi::OsString, path::PathBuf};
    let options = [None, Some(""), Some(" /home "), Some("/home")];
    for home in options {
        for profile in options {
            for codex in options {
                let env: BTreeMap<_, OsString> = [
                    ("HOME", home),
                    ("USERPROFILE", profile),
                    ("CODEX_HOME", codex),
                ]
                .into_iter()
                .filter_map(|(k, v)| v.map(|v| (k, v.into())))
                .collect();
                let mut calls = Vec::new();
                let result = registry_paths(|key| {
                    calls.push(key.to_owned());
                    env.get(key).cloned()
                });
                let mut expected = Vec::new();
                if let Some(home) = home.or(profile) {
                    expected.push(PathBuf::from(home).join(
                        "Library/Application Support/OpenAI/Codex/chrome-native-hosts-v2.json",
                    ));
                }
                if let Some(home) = codex
                    .map(PathBuf::from)
                    .or_else(|| home.or(profile).map(|v| PathBuf::from(v).join(".codex")))
                {
                    expected.push(home.join("chrome-native-hosts-v2.json"));
                }
                assert_eq!(result, expected);
                assert_eq!(calls[0], "HOME");
                assert!(calls
                    .iter()
                    .all(|k| ["HOME", "USERPROFILE", "CODEX_HOME"].contains(&k.as_str())));
            }
        }
    }
    // Original pushes both entries even when they refer to the same path.
    let same = registry_paths(|key| match key {
        "HOME" => Some("/fixture".into()),
        "CODEX_HOME" => Some("/fixture/Library/Application Support/OpenAI/Codex".into()),
        _ => None,
    });
    assert_eq!(same.len(), 2);
    assert_eq!(same[0], same[1]);
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        let home = OsString::from_vec(vec![b'/', 0xff]);
        let paths = registry_paths(|key| (key == "HOME").then(|| home.clone()));
        assert_eq!(
            paths[0],
            PathBuf::from(home.clone())
                .join("Library/Application Support/OpenAI/Codex/chrome-native-hosts-v2.json")
        );
        assert_eq!(
            paths[1],
            PathBuf::from(home).join(".codex/chrome-native-hosts-v2.json")
        );
    }
}

#[test]
fn registry_files_use_first_success_and_preserve_failure_precedence() {
    use core_browser_extension_host::app_server_manifest::{
        load_registries, IdentityConstraints, ProtocolMismatch::*, ProtocolRequirements,
    };
    let root = std::env::temp_dir().join(format!("core-registry-files-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    let _cleanup = Cleanup(root.clone());
    let first = root.join("first.json");
    let second = root.join("second.json");
    let identity = IdentityConstraints::default();
    let protocols = ProtocolRequirements {
        app_server: Some(2),
        native_host: None,
    };
    let run = || load_registries(&[first.clone(), second.clone()], &identity, &protocols);
    let good = json!({"schemaVersion":2,"appServerProtocolVersion":2,"paths":{"codexCliPath":root,"codexHome":root,"nodePath":root,"resourcesPath":root}});
    let write = |path: &std::path::Path, entry: Value| {
        fs::write(
            path,
            json!({"schemaVersion":2,"entries":[entry]}).to_string(),
        )
        .unwrap()
    };
    assert_eq!(run().unwrap_err(), ManifestError::MissingRegistry);
    fs::write(&first, b"{").unwrap();
    write(&second, good.clone());
    assert_eq!(run().unwrap().registry_path, second);
    fs::write(&first, [0xff]).unwrap();
    assert_eq!(run().unwrap().registry_path, second);
    write(&first, json!({"schemaVersion":1}));
    assert_eq!(run().unwrap().registry_path, second);
    write(&first, good.clone());
    let mut higher = good.clone();
    higher["presence"] = json!({"pid":0});
    write(&second, higher);
    assert_eq!(run().unwrap().registry_path, first);
    fs::remove_file(&second).unwrap();
    fs::create_dir(&second).unwrap();
    assert_eq!(run().unwrap().registry_path, first);
    fs::remove_dir(&second).unwrap();
    let mut newer = good.clone();
    newer["appServerProtocolVersion"] = json!(3);
    let mut older = good.clone();
    older["appServerProtocolVersion"] = json!(1);
    write(&first, newer.clone());
    write(&second, older.clone());
    assert_eq!(run().unwrap_err(), ManifestError::Protocol(CandidateNewer));
    write(&first, older);
    write(&second, newer);
    assert_eq!(run().unwrap_err(), ManifestError::Protocol(CandidateNewer));
    let mut missing = good.clone();
    missing["paths"]["nodePath"] = Value::Null;
    write(&second, missing);
    assert_eq!(
        run().unwrap_err(),
        ManifestError::RequiredPath("nodePath".into())
    );
    fs::write(&first, b"{").unwrap();
    assert_eq!(
        run().unwrap_err(),
        ManifestError::RequiredPath("nodePath".into())
    );
    write(&second, json!({"schemaVersion":1}));
    assert_eq!(run().unwrap_err(), ManifestError::EntrySchema);
    fs::write(&second, b"[").unwrap();
    assert_eq!(
        run().unwrap_err(),
        ManifestError::InvalidRegistry(serde_json::from_str::<Value>("[").unwrap_err().to_string())
    );
    fs::remove_file(&first).unwrap();
    fs::write(&second, json!({"schemaVersion":2,"entries":[]}).to_string()).unwrap();
    assert_eq!(run().unwrap_err(), ManifestError::NoCompatibleEntry);
}
