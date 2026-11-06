//! Explicit independently owned Swift service; lifecycle belongs to the native supervisor.
use crate::process_port::{ProcessSpec, ProcessWorker};
use serde::Deserialize;

use std::{
    collections::BTreeMap,
    os::unix::fs::{DirBuilderExt, MetadataExt},
    path::PathBuf,
    time::Duration,
};
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeServiceOptions {
    pub helper: PathBuf,
    pub directory: PathBuf,
    /// Explicit standalone native policy; absent bundle IDs are denied.
    #[serde(default, deserialize_with = "deserialize_app_policy")]
    pub app_policy: Option<BTreeMap<String, AppPolicyRule>>,
    #[serde(default)]
    pub policy_source: PolicySource,
    pub codex_cli_path: Option<String>,
}
// Preserve the existing rejection of explicit null/non-map rules, while
// distinguishing an omitted field from a deliberately configured empty map.
fn deserialize_app_policy<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<BTreeMap<String, AppPolicyRule>>, D::Error> {
    BTreeMap::deserialize(deserializer).map(Some)
}
/// Host deployment selection, not a recovered vendor setting.
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicySource {
    #[default]
    Standalone,
    AppServer,
}
impl NativeServiceOptions {
    fn service_environment(&self) -> Result<BTreeMap<String, String>, String> {
        let mut env = BTreeMap::from([
            ("PATH".into(), "/usr/bin:/bin".into()),
            ("LANG".into(), "en_US.UTF-8".into()),
        ]);
        match self.policy_source {
            PolicySource::Standalone => {
                if self.codex_cli_path.is_some() {
                    return Err("codex_cli_path requires app-server policy_source".into());
                }
                let empty = BTreeMap::new();
                let rules = self.app_policy.as_ref().unwrap_or(&empty);
                let policy = serde_json::to_string(rules).map_err(|e| e.to_string())?;
                if policy.len() > 65_536 || rules.keys().any(|key| key.is_empty()) {
                    return Err("Invalid or oversized native app policy".into());
                }
                env.insert("CORE_CUA_APP_POLICY".into(), policy);
            }
            PolicySource::AppServer => {
                if self.app_policy.is_some() {
                    return Err("app-server policy_source conflicts with app_policy".into());
                }
                env.insert("CORE_CUA_POLICY_SOURCE".into(), "app-server".into());
                if let Some(path) = &self.codex_cli_path {
                    env.insert("CODEX_CLI_PATH".into(), path.clone());
                }
            }
        }
        Ok(env)
    }
}
#[derive(Clone, Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AppPolicyRule {
    pub decision: AppDecision,
    pub risk: AppRisk,
    pub allow_persistent_approval: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warning_subtitle: Option<String>,
}
#[derive(Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppDecision {
    Allowed,
    Denied,
    Forbidden,
}
#[derive(Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppRisk {
    High,
    Low,
}
pub struct NativeService {
    process: ProcessWorker,
    root: PathBuf,
    pub socket_path: PathBuf,
}
impl NativeService {
    pub async fn spawn(options: &NativeServiceOptions) -> Result<Self, String> {
        // Validate source conflicts before filesystem mutation or process launch.
        let env = options.service_environment()?;
        if !options.helper.is_absolute() || !options.directory.is_absolute() {
            return Err("Native service paths must be absolute".into());
        }
        let helper = options
            .helper
            .canonicalize()
            .map_err(|_| "Native service executable unavailable")?;
        let directory = options
            .directory
            .canonicalize()
            .map_err(|_| "Native service directory unavailable")?;
        let meta = directory
            .metadata()
            .map_err(|_| "Native service directory unavailable")?;
        if !helper.is_file()
            || !meta.is_dir()
            || meta.uid() != unsafe { libc::getuid() }
            || meta.mode() & 0o077 != 0
        {
            return Err(
                "Native service requires a private owned directory and executable file".into(),
            );
        }
        let root = directory.join(format!("sky-{}", uuid::Uuid::new_v4().simple()));
        let socket_path = root.join("ipc.sock");
        if socket_path.as_os_str().as_encoded_bytes().len() >= 104 {
            return Err("Native service Unix socket path is too long".into());
        }
        let socket_argument = socket_path
            .to_str()
            .ok_or("Native socket path must be UTF-8")?
            .to_owned();
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&root)
            .map_err(|e| e.to_string())?;
        let spec = ProcessSpec {
            command: helper,
            args: vec!["--sky-socket".into(), socket_argument],
            cwd: root.clone(),
            env,
            max_frame_bytes: 4096,
            max_queued_bytes: 8192,
            terminate_grace: Duration::from_secs(2),
        };
        match ProcessWorker::start(spec).await {
            Ok(process) => Ok(Self {
                process,
                root,
                socket_path,
            }),
            Err(error) => {
                let _ = std::fs::remove_dir_all(&root);
                Err(error)
            }
        }
    }
    pub async fn wait_ready(&mut self) -> Result<(), String> {
        let message = tokio::time::timeout(Duration::from_secs(5), self.process.next_message())
            .await
            .map_err(|_| "Native service readiness timed out")??;
        let expected = self
            .socket_path
            .canonicalize()
            .map_err(|_| "Native socket unavailable")?;
        let valid = message.as_ref().is_some_and(|value| {
            value.get("type").and_then(|v| v.as_str()) == Some("sky_service_ready")
                && value
                    .get("socketPath")
                    .and_then(|v| v.as_str())
                    .and_then(|path| std::fs::canonicalize(path).ok())
                    .as_ref()
                    == Some(&expected)
        });
        if !valid {
            return Err("Native service did not report the configured socket ready".into());
        }
        Ok(())
    }
    pub async fn close(&mut self) -> Result<(), String> {
        let retired = self.process.close().await;
        let removed = std::fs::remove_dir_all(&self.root)
            .or_else(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    Ok(())
                } else {
                    Err(error)
                }
            })
            .map_err(|e| e.to_string());
        retired.and(removed)
    }
}
impl Drop for NativeService {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn options(extra: Value) -> NativeServiceOptions {
        let mut value = json!({"helper":"/fixture/helper", "directory":"/fixture/private"});
        value
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn standalone_defaults_and_explicit_rules_remain_unchanged() {
        let default = options(json!({})).service_environment().unwrap();
        assert_eq!(default["CORE_CUA_APP_POLICY"], "{}");
        assert!(!default.contains_key("CORE_CUA_POLICY_SOURCE"));
        let rules = json!({"test.fixture":{"decision":"denied","risk":"high","allowPersistentApproval":false}});
        let env = options(json!({"app_policy": rules}))
            .service_environment()
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&env["CORE_CUA_APP_POLICY"]).unwrap(),
            rules
        );
        assert!(options(json!({"app_policy":{"":{"decision":"allowed","risk":"low","allowPersistentApproval":false}}})).service_environment().is_err());
    }

    #[test]
    fn app_server_uses_explicit_source_without_injecting_standalone_rules() {
        let env = options(json!({"policy_source":"app-server", "codex_cli_path":"/fixture/cli"}))
            .service_environment()
            .unwrap();
        assert_eq!(
            env,
            BTreeMap::from([
                ("PATH".into(), "/usr/bin:/bin".into()),
                ("LANG".into(), "en_US.UTF-8".into()),
                ("CORE_CUA_POLICY_SOURCE".into(), "app-server".into()),
                ("CODEX_CLI_PATH".into(), "/fixture/cli".into()),
            ])
        );
        assert!(!options(json!({"policy_source":"app-server"}))
            .service_environment()
            .unwrap()
            .contains_key("CODEX_CLI_PATH"));
    }

    #[tokio::test]
    async fn owned_helper_receives_selected_policy_through_process_boundary() {
        use std::os::unix::fs::PermissionsExt;
        let node = std::env::var("CUA_TEST_NODE")
            .expect("Set CUA_TEST_NODE to an absolute Node executable");
        assert!(PathBuf::from(&node).is_absolute());
        let directory =
            PathBuf::from("/tmp").join(format!("cua-policy-{}", uuid::Uuid::new_v4().simple()));
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&directory)
            .unwrap();
        let helper = directory.join("peer.mjs");
        std::fs::write(&helper, format!("#!{node}\n") + r#"
import fs from 'node:fs';
import net from 'node:net';
fs.writeFileSync('environment.json', JSON.stringify(process.env));
const socketPath = process.argv[3];
net.createServer().listen(socketPath, () => console.log(JSON.stringify({type:'sky_service_ready', socketPath})));
"#).unwrap();
        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o700)).unwrap();
        for source in [
            json!({}),
            json!({"policy_source":"app-server","codex_cli_path":"/fixture/owned-cli"}),
        ] {
            let mut config = options(source);
            config.helper = helper.clone();
            config.directory = directory.clone();
            let expected = config.service_environment().unwrap();
            let mut service = NativeService::spawn(&config).await.unwrap();
            service.wait_ready().await.unwrap();
            let mut actual: BTreeMap<String, String> = serde_json::from_slice(
                &std::fs::read(service.root.join("environment.json")).unwrap(),
            )
            .unwrap();
            // CoreFoundation may initialize this process-local key on macOS.
            actual.remove("__CF_USER_TEXT_ENCODING");
            assert_eq!(actual, expected);
            let root = service.root.clone();
            service.close().await.unwrap();
            assert!(!root.exists());
        }
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn conflicting_sources_fail_before_resolving_or_launching_helper() {
        for extra in [
            json!({"policy_source":"app-server","app_policy":{}}),
            json!({"codex_cli_path":"/fixture/cli"}),
        ] {
            let config = options(extra);
            let error = NativeService::spawn(&config)
                .await
                .err()
                .expect("conflict must fail");
            assert!(error.contains("policy_source"), "{error}");
        }
        for extra in [
            json!({"policy_source":"unknown"}),
            json!({"app_policy":null}),
            json!({"app_policy":[]}),
        ] {
            let mut config = json!({"helper":"/fixture/helper","directory":"/fixture/private"});
            config
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            assert!(serde_json::from_value::<NativeServiceOptions>(config).is_err());
        }
    }
}
