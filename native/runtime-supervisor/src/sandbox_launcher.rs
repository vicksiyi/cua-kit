//! Independent Seatbelt policy/launch construction owned by the Rust supervisor.
//! The post-Node-init bridge remains a deployment dependency, not recovered source.
use crate::process_port::ProcessSpec;
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    time::Duration,
};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SandboxedWorkerOptions {
    pub node: PathBuf,
    pub bootstrap: PathBuf,
    pub addon: PathBuf,
    pub entry: PathBuf,
    pub args: Vec<String>,
    pub directory: PathBuf,
    pub read_directories: Vec<PathBuf>,
    #[serde(default)]
    pub worker_environment: BTreeMap<String, String>,
}
fn canonical(path: &Path, directory: bool) -> Result<PathBuf, String> {
    let text = path.to_str().ok_or("Sandbox paths must be UTF-8")?;
    if !path.is_absolute() || text.chars().any(char::is_control) {
        return Err("Sandbox paths must be absolute without control characters".into());
    }
    let result = path
        .canonicalize()
        .map_err(|_| "Sandbox path unavailable")?;
    let text = result
        .to_str()
        .ok_or("Resolved sandbox path must be UTF-8")?;
    if text.chars().any(char::is_control) {
        return Err("Resolved sandbox path contains control characters".into());
    }
    let metadata = result
        .metadata()
        .map_err(|_| "Sandbox metadata unavailable")?;
    if if directory {
        !metadata.is_dir() || result.parent().is_none()
    } else {
        !metadata.is_file()
    } {
        return Err("Invalid sandbox path type or filesystem root grant".into());
    }
    Ok(result)
}
fn rule(kind: &str, path: &Path) -> String {
    format!(
        "({kind} {})",
        serde_json::to_string(path.to_str().unwrap()).unwrap()
    )
}
pub fn worker_spec(options: SandboxedWorkerOptions) -> Result<ProcessSpec, String> {
    if !cfg!(target_os = "macos") {
        return Err("macOS sandbox launcher unavailable".into());
    }
    let node = canonical(&options.node, false)?;
    let bootstrap = canonical(&options.bootstrap, false)?;
    let addon = canonical(&options.addon, false)?;
    let entry = canonical(&options.entry, false)?;
    let directory = canonical(&options.directory, true)?;
    let reads = options
        .read_directories
        .iter()
        .map(|p| canonical(p, true))
        .collect::<Result<BTreeSet<_>, _>>()?;
    if !reads.iter().any(|p| entry.starts_with(p)) {
        return Err("Worker entry must be in an explicit read directory".into());
    }
    if reads
        .iter()
        .any(|p| p.starts_with(&directory) || directory.starts_with(p))
        || [&node, &bootstrap, &addon, &entry]
            .iter()
            .any(|p| p.starts_with(&directory))
    {
        return Err("Writable worker directory overlaps trusted code".into());
    }
    let mut env = BTreeMap::from([
        ("HOME".into(), directory.to_str().unwrap().into()),
        ("TMPDIR".into(), directory.to_str().unwrap().into()),
    ]);
    for (key, value) in options.worker_environment {
        if !matches!(
            key.as_str(),
            "NODE_REPL_TRUSTED_RPC_ENABLED"
                | "NODE_REPL_NODE_MODULE_DIRS"
                | "NODE_REPL_UNTRUSTED_ENV_ALLOWLIST"
                | "CUA_REPL_ENABLED_SURFACES"
                | "CUA_REPL_BROWSER_ENV"
                | "CORE_CUA_ENDPOINT_FILES"
                | "BROWSER_USE_BACKEND_PATHS"
                | "BROWSER_USE_AVAILABLE_BACKENDS"
                | "BROWSER_USE_DISABLE_AMBIENT_NETWORK"
                | "NODE_REPL_TRUSTED_SERVICES"
                | "NODE_REPL_TRUSTED_CODE_PATHS"
                | "SKY_CUA_SERVICE_NATIVE_PIPE_PATH"
                | "SKY_ENABLE_AUDIO"
                | "SKY_AUDIO_MODEL_ALLOWLIST"
        ) || value.contains('\0')
        {
            return Err("Unsupported worker environment key or value".into());
        }
        env.insert(key, value);
    }
    let mut ancestors = BTreeSet::new();
    for path in reads.iter().chain(std::iter::once(&directory)) {
        for ancestor in path.ancestors().skip(1) {
            ancestors.insert(ancestor.to_path_buf());
        }
    }
    let profile=format!("(version 1)(deny default)(allow file-read* {})(allow file-read* file-write* {})(allow file-read-metadata {})(allow sysctl-read)(allow signal (target self))",reads.iter().map(|p|rule("subpath",p)).collect::<Vec<_>>().join(" "),rule("subpath",&directory),ancestors.iter().map(|p|rule("literal",p)).collect::<Vec<_>>().join(" "));
    if profile.len() > 1024 * 1024 {
        return Err("Sandbox profile exceeds 1 MiB".into());
    }
    env.insert("CORE_CUA_SANDBOX_PROFILE".into(), profile);
    env.insert(
        "CORE_CUA_SANDBOX_ADDON".into(),
        addon.to_str().unwrap().into(),
    );
    if options.args.iter().any(|arg| arg.contains('\0')) {
        return Err("Invalid worker argument".into());
    }
    let mut args = vec![
        "--experimental-vm-modules".into(),
        bootstrap.to_str().unwrap().into(),
        entry.to_str().unwrap().into(),
    ];
    args.extend(options.args);
    Ok(ProcessSpec {
        command: node,
        args,
        cwd: directory,
        env,
        max_frame_bytes: 8 * 1024 * 1024,
        max_queued_bytes: 16 * 1024 * 1024,
        terminate_grace: Duration::from_millis(100),
    })
}
