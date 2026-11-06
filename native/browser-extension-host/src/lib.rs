//! Native host responsibilities evidenced in the installed Rust extension_host.
//! Core protocol compatibility reconstruction, not recovered original Rust source.
//! A Core socket/stdio executable is implemented; production consumer migration and
//! original authorization/app-server behavior remain pending.
#[cfg(unix)]
pub mod client_writer;
#[cfg(unix)]
pub mod endpoint;
#[cfg(unix)]
pub mod lifecycle_log;
pub mod rpc_router;
#[cfg(unix)]
pub mod runtime;
pub mod transport;
