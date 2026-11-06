use core_browser_extension_host::tab_context_asset::{sanitize_file_name, MAX_FILE_NAME_BYTES};

#[test]
fn native_component_selection_and_reserved_character_mask() {
    assert_eq!(sanitize_file_name(r"C:\folder\report.txt"), "report.txt");
    assert_eq!(sanitize_file_name("/folder/report.txt///"), "report.txt");
    assert_eq!(sanitize_file_name("////\\"), "tab-context.txt");
    assert_eq!(sanitize_file_name("folder/ \u{2003}\t"), "tab-context.txt");
    assert_eq!(sanitize_file_name(" \u{2003}报告.txt\u{2003} "), "报告.txt");
    // Independent instruction oracle: ARM64 x23 mask, plus separate '|' compare.
    for value in 0u8..=127 {
        if value == b'/' || value == b'\\' {
            continue;
        }
        let source = format!("a{}z", char::from(value));
        let replaced =
            (value <= 63 && (0xd400_0424_0000_0000u64 >> value) & 1 == 1) || value == b'|';
        assert_eq!(
            sanitize_file_name(&source),
            if replaced { "a_z".into() } else { source }
        );
    }
}

#[test]
fn byte_limit_preserves_extension_and_never_splits_utf8() {
    let exact = "x".repeat(218);
    assert_eq!(sanitize_file_name(&exact), exact);
    assert_eq!(sanitize_file_name(&"x".repeat(219)), "x".repeat(218));
    assert_eq!(
        sanitize_file_name(&format!("{}.pdf", "x".repeat(300))),
        format!("{}.pdf", "x".repeat(214))
    );
    assert_eq!(
        sanitize_file_name(&format!("{}.txt", "界".repeat(100))),
        format!("{}.txt", "界".repeat(71))
    );
    assert_eq!(
        sanitize_file_name(&format!("{}.png", "🦀".repeat(100))),
        format!("{}.png", "🦀".repeat(53))
    );
    assert_eq!(
        sanitize_file_name(&format!("{}.txt", "a ".repeat(150))),
        format!("{}.txt", "a ".repeat(107).trim_end())
    );
    // An overlong extension and a leading-dot name fall back to a whole-name prefix.
    assert_eq!(
        sanitize_file_name(&format!("a.{}", "x".repeat(300))),
        format!("a.{}", "x".repeat(216))
    );
    assert_eq!(
        sanitize_file_name(&format!(".{}", "x".repeat(300))),
        format!(".{}", "x".repeat(217))
    );
    // A nearly full extension leaves no complete Unicode stem; use fallback.
    let source = format!("🦀.{}", "x".repeat(216));
    assert_eq!(
        sanitize_file_name(&source),
        format!("🦀.{}", "x".repeat(213))
    );
    for width in 1..300 {
        for unit in ["a", "é", "界", "🦀"] {
            let result = sanitize_file_name(&format!("folder/{}.json", unit.repeat(width)));
            assert!(result.len() <= MAX_FILE_NAME_BYTES);
            assert!(result.ends_with(".json"));
            assert!(!result.contains('/'));
        }
    }
}

use base64::{engine::general_purpose::STANDARD, Engine};
use core_browser_extension_host::tab_context_asset::{
    AssetStore, MAX_ACTIVE_ASSETS, MAX_ASSET_BYTES,
};
use std::{
    fs,
    os::unix::fs::{symlink, DirBuilderExt, PermissionsExt},
    path::PathBuf,
};
use uuid::Uuid;
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("core-assets-test-{}", Uuid::new_v4()));
        fs::DirBuilder::new().mode(0o700).create(&path).unwrap();
        Self(path)
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn real_asset_bytes_finish_remove_and_drop() {
    let root = Root::new();
    let unrelated = root.0.join("unrelated");
    fs::write(&unrelated, b"keep").unwrap();
    let mut store = AssetStore::new(&root.0).unwrap();
    let created = store.create("../report.bin").unwrap();
    let id = created["assetId"].as_str().unwrap();
    assert_eq!(Uuid::parse_str(id).unwrap().get_version_num(), 4);
    let path = PathBuf::from(created["path"].as_str().unwrap());
    assert_eq!(
        path.file_name().unwrap().to_str().unwrap(),
        format!("{id}-report.bin")
    );
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert!(store.append(id, "bad?").is_err());
    assert!(fs::read(&path).unwrap().is_empty());
    store.append(id, &STANDARD.encode([0, 255, 128])).unwrap();
    store
        .append(id, &STANDARD.encode("中文".as_bytes()))
        .unwrap();
    assert_eq!(
        fs::read(&path).unwrap(),
        [vec![0, 255, 128], "中文".as_bytes().to_vec()].concat()
    );
    assert_eq!(store.finish(id).unwrap(), created);
    assert_eq!(store.finish(id).unwrap(), created);
    assert!(store
        .append(id, "")
        .unwrap_err()
        .to_string()
        .contains("finished"));
    assert_eq!(store.remove(id).unwrap(), serde_json::json!({}));
    assert!(!path.exists());
    assert!(store.remove(id).is_ok());
    assert!(store.finish(id).is_err());
    let unfinished = store.create("unfinished").unwrap();
    let finished = store.create("finished").unwrap();
    store.finish(finished["assetId"].as_str().unwrap()).unwrap();
    drop(store);
    for entry in [unfinished, finished] {
        assert!(!PathBuf::from(entry["path"].as_str().unwrap()).exists());
    }
    assert_eq!(fs::read(unrelated).unwrap(), b"keep");
}

#[test]
fn active_asset_limit_counts_finished_entries_until_removed() {
    let root = Root::new();
    let mut store = AssetStore::new(&root.0).unwrap();
    let mut ids = Vec::new();
    for _ in 0..MAX_ACTIVE_ASSETS {
        ids.push(
            store.create("same.txt").unwrap()["assetId"]
                .as_str()
                .unwrap()
                .to_owned(),
        );
    }
    store.finish(&ids[0]).unwrap();
    assert!(store
        .create("one-too-many")
        .unwrap_err()
        .to_string()
        .contains("Too many"));
    store.remove(&ids[0]).unwrap();
    store.create("replacement.txt").unwrap();
    assert_eq!(fs::read_dir(&root.0).unwrap().count(), 16);
    store.shutdown().unwrap();
    assert_eq!(fs::read_dir(&root.0).unwrap().count(), 0);
}

#[test]
fn exact_hundred_mebibyte_boundary_does_not_write_overflow() {
    let root = Root::new();
    let mut store = AssetStore::new(&root.0).unwrap();
    let created = store.create("bounded.bin").unwrap();
    let id = created["assetId"].as_str().unwrap();
    let chunk = STANDARD.encode(vec![b'x'; 1024 * 1024]);
    for _ in 0..100 {
        store.append(id, &chunk).unwrap();
    }
    let path = created["path"].as_str().unwrap();
    assert_eq!(fs::metadata(path).unwrap().len(), MAX_ASSET_BYTES);
    assert!(store
        .append(id, "eA==")
        .unwrap_err()
        .to_string()
        .contains("too large"));
    assert_eq!(fs::metadata(path).unwrap().len(), MAX_ASSET_BYTES);
    store.append(id, "").unwrap();
}

#[test]
fn replacement_paths_and_shared_roots_are_not_used_or_deleted() {
    let root = Root::new();
    let mut store = AssetStore::new(&root.0).unwrap();
    let created = store.create("owned").unwrap();
    let id = created["assetId"].as_str().unwrap();
    let path = PathBuf::from(created["path"].as_str().unwrap());
    let moved = root.0.join("moved");
    fs::rename(&path, &moved).unwrap();
    let target = root.0.join("target");
    fs::write(&target, b"preserve").unwrap();
    symlink(&target, &path).unwrap();
    assert!(store.append(id, "eA==").is_err());
    assert!(store.remove(id).is_err());
    assert_eq!(fs::read(&target).unwrap(), b"preserve");
    assert!(fs::symlink_metadata(&path).unwrap().is_symlink());
    fs::set_permissions(&root.0, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(AssetStore::new(&root.0).is_err());
}
