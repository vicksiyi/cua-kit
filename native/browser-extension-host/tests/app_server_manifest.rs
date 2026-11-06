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
