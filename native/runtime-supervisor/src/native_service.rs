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
    #[serde(default)]
    pub app_policy: BTreeMap<String, AppPolicyRule>,
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
        let policy = serde_json::to_string(&options.app_policy).map_err(|e| e.to_string())?;
        if policy.len() > 65_536 || options.app_policy.keys().any(|key| key.is_empty()) {
            return Err("Invalid or oversized native app policy".into());
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
            env: BTreeMap::from([
                ("PATH".into(), "/usr/bin:/bin".into()),
                ("LANG".into(), "en_US.UTF-8".into()),
                ("CORE_CUA_APP_POLICY".into(), policy),
            ]),
            max_frame_bytes: 4096,
            max_queued_bytes: 8192,
            terminate_grace: Duration::from_millis(100),
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
