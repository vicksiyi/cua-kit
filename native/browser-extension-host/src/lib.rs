//! Native host responsibilities evidenced in the installed Rust extension_host.
//! Core protocol compatibility reconstruction, not recovered original Rust source.
//! The socket/stdio executable and original authorization/app-server behavior remain pending.
#[cfg(unix)]
pub mod client_writer;
pub mod rpc_router;
pub mod transport;
