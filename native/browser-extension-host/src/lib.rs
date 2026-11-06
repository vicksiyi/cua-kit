//! Native host responsibilities evidenced in the installed Rust extension_host.
//! Core protocol compatibility reconstruction, not recovered original Rust source.
//! A Core socket/stdio executable is implemented; production consumer migration and
//! original authorization/app-server behavior remain pending.
pub mod app_server_configuration;
pub mod app_server_error;
pub mod app_server_manifest;
pub mod app_server_status;
#[cfg(unix)]
pub mod client_writer;
#[cfg(unix)]
pub mod control;
#[cfg(unix)]
pub mod endpoint;
#[cfg(unix)]
pub mod lifecycle_log;
#[cfg(unix)]
pub mod open_local_file;
pub mod rpc_router;
#[cfg(unix)]
pub mod runtime;
pub mod tab_context_asset;
pub mod transport;
