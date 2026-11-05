//! Integration harness: caller supplies explicit worker launch policies.
//! Supports Rust-owned Seatbelt specs; not the production demo default.
use core_runtime_supervisor::{
    config_manager::{ConfigManager, ConfigSources},
    deployment_host::deployment_host,
    mcp_server::SupervisorMcp,
    native_service::NativeServiceOptions,
    process_port::ProcessSpec,
    repl_manager::ReplManager,
    sandbox_launcher::{worker_spec, SandboxedWorkerOptions},
};
use rmcp::ServiceExt;
use serde::Deserialize;
use std::{
    collections::{BTreeMap, HashSet},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Worker {
    command: PathBuf,
    args: Vec<String>,
    cwd: PathBuf,
    env: BTreeMap<String, String>,
}
impl Worker {
    fn process(self) -> ProcessSpec {
        ProcessSpec {
            command: self.command,
            args: self.args,
            cwd: self.cwd,
            env: self.env,
            max_frame_bytes: 8 * 1024 * 1024,
            max_queued_bytes: 16 * 1024 * 1024,
            terminate_grace: Duration::from_millis(100),
        }
    }
}
#[derive(Deserialize)]
#[serde(untagged)]
enum Launch {
    Sandboxed(SandboxLaunch),
    Explicit(Worker),
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SandboxLaunch {
    sandbox: SandboxedWorkerOptions,
}
impl Launch {
    fn process(self) -> Result<ProcessSpec, String> {
        match self {
            Self::Sandboxed(spec) => worker_spec(spec.sandbox),
            Self::Explicit(spec) => Ok(spec.process()),
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Options {
    kernel: Launch,
    trusted: Launch,
    services: HashSet<String>,
    config: ConfigSources,
    #[serde(default)]
    pipe_paths: Vec<PathBuf>,
    #[serde(default)]
    writable_paths: HashSet<String>,
    #[serde(default)]
    module_directories: Vec<PathBuf>,
    #[serde(default)]
    native_service: Option<NativeServiceOptions>,
    #[serde(default)]
    tool_overrides: Option<core_runtime_supervisor::tool_overrides::ToolOverrides>,
    #[serde(default)]
    completion_summary: Option<core_runtime_supervisor::completion_summary::CompletionSummary>,
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let result = runtime.block_on(run());
    // rmcp's stdio uses a blocking stdin reader. All service/worker cleanup is
    // awaited in run(); do not wait for the peer to close stdin again on SIGTERM.
    runtime.shutdown_background();
    result
}
async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args()
        .nth(1)
        .ok_or("Supply an explicit integration worker-spec file")?;
    let options: Options = serde_json::from_slice(&std::fs::read(path)?)?;
    let config = Arc::new(ConfigManager::new(options.config, options.writable_paths)?);
    let session = ReplManager::new(
        options.kernel.process()?,
        options.trusted.process()?,
        options.services,
    )
    .with_native_service(options.native_service)
    .with_pipe_paths(options.pipe_paths)?
    .with_module_directories(options.module_directories)?;
    let mut server = SupervisorMcp::new(session, deployment_host(config));
    if let Some(overrides) = options.tool_overrides { server = server.with_tool_overrides(overrides)?; }
    if let Some(config) = options.completion_summary { server = server.with_completion_summary(config)?; }
    let running = server.clone().serve(rmcp::transport::stdio()).await?;
    let cancellation = running.cancellation_token();
    let shutdown = server.clone();
    let mut termination =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let signals = tokio::spawn(async move {
        tokio::select! {_=termination.recv()=>{},_=tokio::signal::ctrl_c()=>{}}
        let _ = shutdown.close().await;
        cancellation.cancel();
    });
    let result = running.waiting().await;
    signals.abort();
    server.close().await?;
    result?;
    Ok(())
}
