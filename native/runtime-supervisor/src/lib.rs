//! Independently reconstructed native responsibilities, not recovered Rust source.
//! JS workers remain reconstructed TypeScript. See reconstruction/native-language-evidence.json.
#[cfg(unix)]
pub mod native_pipe;

#[cfg(unix)]
pub mod process_port;

#[cfg(unix)]
pub mod repl_manager;

pub mod host;

#[cfg(unix)]
pub mod config_manager;

#[cfg(unix)]
pub mod deployment_host;
pub mod media;

#[cfg(unix)]
pub mod mcp_server;
