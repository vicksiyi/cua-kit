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
