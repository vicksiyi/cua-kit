#![cfg(unix)]
use core_runtime_supervisor::config_manager::{ConfigManager, ConfigSources};
use serde_json::json;
use std::future::Future;
use std::{
    collections::{HashMap, HashSet},
    os::unix::fs::{symlink, PermissionsExt},
    path::PathBuf,
};
struct Fixture {
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = PathBuf::from(format!("/tmp/core-config-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        for (file, text) in [
            ("config.toml", "[browser_use]\nallow_history_access=false\n"),
            (
                "requirements.toml",
                "[featureRequirements]\nbrowser_use_full_cdp_access=false\n",
            ),
            ("browser.toml", "count=0\n"),
        ] {
            std::fs::write(root.join(file), text).unwrap();
        }
        Self { root }
    }
    fn sources(&self) -> ConfigSources {
        ConfigSources {
            config: self.root.join("config.toml"),
            requirements: self.root.join("requirements.toml"),
            working_directories: HashSet::from([self.root.clone()]),
            toml_files: HashMap::from([
                ("browser/config.toml".into(), self.root.join("browser.toml")),
                ("config.toml".into(), self.root.join("config.toml")),
            ]),
        }
    }
    fn manager(&self) -> ConfigManager {
        ConfigManager::new(
            self.sources(),
            HashSet::from(["browser/config.toml".into()]),
        )
        .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
#[tokio::test]
async fn reads_real_configuration_and_commits_only_mapped_preferences() {
    let fixture = Fixture::new();
    let manager = fixture.manager();
    let read=manager.request(&json!({"type":"config_action","action":"read_config","cwd":fixture.root,"include_layers":false})).await.unwrap();
    assert_eq!(
        read["value"]["config"]["browser_use"]["allow_history_access"],
        false
    );
    let protected = std::fs::read(fixture.root.join("config.toml")).unwrap();
    for count in 1..4 {
        manager.request(&json!({"type":"config_action","action":"write_toml","path":"browser/config.toml","value":{"count":count,"names":["你好","world"]}})).await.unwrap();
        let parsed: toml::Value =
            toml::from_str(&std::fs::read_to_string(fixture.root.join("browser.toml")).unwrap())
                .unwrap();
        assert_eq!(parsed["count"].as_integer(), Some(count));
    }
    assert_eq!(
        std::fs::read(fixture.root.join("config.toml")).unwrap(),
        protected
    );
    assert_eq!(
        std::fs::metadata(fixture.root.join("browser.toml"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
    for message in [
        json!({"type":"config_action","action":"write_toml","path":"config.toml","value":{}}),
        json!({"type":"config_action","action":"read_toml","path":"../outside"}),
        json!({"type":"config_action","action":"read_config","cwd":"/unapproved","include_layers":false}),
    ] {
        assert!(manager.request(&message).await.is_err());
    }
}
#[tokio::test]
async fn rejects_links_invalid_values_and_private_source_leaks() {
    let fixture = Fixture::new();
    let manager = fixture.manager();
    for text in [
        "password = [ secret_source_marker",
        "value=nan",
        "value=1979-05-27T07:32:00Z",
    ] {
        std::fs::write(fixture.root.join("browser.toml"), text).unwrap();
        let error = manager
            .request(
                &json!({"type":"config_action","action":"read_toml","path":"browser/config.toml"}),
            )
            .await
            .unwrap_err();
        assert!(!error.contains("secret_source_marker"));
        assert!(manager.request(&json!({"type":"config_action","action":"write_toml","path":"browser/config.toml","value":{"ok":true}})).await.is_err());
    }
    std::fs::remove_file(fixture.root.join("browser.toml")).unwrap();
    symlink(
        fixture.root.join("config.toml"),
        fixture.root.join("browser.toml"),
    )
    .unwrap();
    assert!(ConfigManager::new(
        fixture.sources(),
        HashSet::from(["browser/config.toml".into()])
    )
    .is_err());
    assert!(manager.request(&json!({"type":"config_action","action":"write_toml","path":"browser/config.toml","value":{}})).await.is_err());
    std::fs::remove_file(fixture.root.join("browser.toml")).unwrap();
    std::fs::hard_link(
        fixture.root.join("config.toml"),
        fixture.root.join("browser.toml"),
    )
    .unwrap();
    assert!(ConfigManager::new(
        fixture.sources(),
        HashSet::from(["browser/config.toml".into()])
    )
    .is_err());
}
#[tokio::test]
async fn cancelled_write_before_commit_removes_temporary_file() {
    let fixture = Fixture::new();
    let manager = fixture.manager();
    let original = std::fs::read(fixture.root.join("browser.toml")).unwrap();
    let message = json!({"type":"config_action","action":"write_toml","path":"browser/config.toml","value":{"new":true}});
    let mut pending = Box::pin(manager.request(&message));
    // First poll reaches the explicit precommit yield; dropping there must not rename.
    std::future::poll_fn(|cx| {
        assert!(pending.as_mut().poll(cx).is_pending());
        std::task::Poll::Ready(())
    })
    .await;
    drop(pending);
    assert_eq!(
        std::fs::read(fixture.root.join("browser.toml")).unwrap(),
        original
    );
    assert!(std::fs::read_dir(&fixture.root).unwrap().all(|entry| !entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".core-config-")));
}
