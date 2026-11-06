//! Runtime-mode parsing observed in the pinned native host.
use std::ffi::OsStr;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeReplRuntimeMode {
    Default,
    GaasBrowser,
}
impl NodeReplRuntimeMode {
    pub fn from_process_env() -> Result<Self, String> {
        Self::from_env_value(std::env::var_os("NODE_REPL_RUNTIME_MODE").as_deref())
    }
    pub fn from_env_value(value: Option<&OsStr>) -> Result<Self, String> {
        match value {
            None => Ok(Self::Default),
            Some(value) if value.is_empty() => Ok(Self::Default),
            Some(value) if value == "gaas-browser" => Ok(Self::GaasBrowser),
            Some(value) => Err(format!(
                "unsupported NODE_REPL_RUNTIME_MODE value: {}",
                value.to_string_lossy()
            )),
        }
    }
}
