//! Native codex_runtime_error_response contract, reconstructed from the pinned
//! binary's discriminant-indexed type table at 0x1000b0d88 / 0x100090ca8.
use crate::app_server_manifest::{ManifestError, ProtocolMismatch};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeErrorKind {
    Runtime,
    ChromeExtensionUpdateRequired,
    CodexAppUpdateRequired,
    ManifestInvalid,
    ManifestMissing,
    NoMatchingCodexInstall,
    RequiredPathMissing,
}

impl RuntimeErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Runtime => "app_server_runtime_error",
            Self::ChromeExtensionUpdateRequired => "chrome_extension_update_required",
            Self::CodexAppUpdateRequired => "codex_app_update_required",
            Self::ManifestInvalid => "manifest_invalid",
            Self::ManifestMissing => "manifest_missing",
            Self::NoMatchingCodexInstall => "no_matching_codex_install",
            Self::RequiredPathMissing => "required_path_missing",
        }
    }
}

pub struct RuntimeError {
    pub kind: RuntimeErrorKind,
    pub message: String,
}

impl From<ManifestError> for RuntimeError {
    fn from(error: ManifestError) -> Self {
        let kind = match &error {
            ManifestError::Protocol(ProtocolMismatch::CandidateNewer) => {
                RuntimeErrorKind::ChromeExtensionUpdateRequired
            }
            ManifestError::Protocol(ProtocolMismatch::CandidateOlderOrMissing) => {
                RuntimeErrorKind::CodexAppUpdateRequired
            }
            ManifestError::DocumentSchema
            | ManifestError::EntriesShape
            | ManifestError::EntrySchema
            | ManifestError::MalformedEntry
            | ManifestError::InvalidRegistry(_) => RuntimeErrorKind::ManifestInvalid,
            ManifestError::MissingRegistry => RuntimeErrorKind::ManifestMissing,
            ManifestError::NoCompatibleEntry => RuntimeErrorKind::NoMatchingCodexInstall,
            ManifestError::RequiredPath(_) => RuntimeErrorKind::RequiredPathMissing,
        };
        Self {
            kind,
            message: error.to_string(),
        }
    }
}

impl RuntimeError {
    /// Keep the caller-provided JSON ID unchanged. All seven categories use
    /// positive numeric code 1; the category belongs in error.data.type.
    pub fn response(&self, id: &Value) -> Value {
        json!({"jsonrpc":"2.0","id":id,"error":{"code":1,"message":self.message,"data":{"type":self.kind.as_str()}}})
    }
}
