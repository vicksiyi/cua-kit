use core_browser_extension_host::{
    app_server_error::{RuntimeError, RuntimeErrorKind::*},
    app_server_manifest::{ManifestError, ProtocolMismatch},
};
use serde_json::json;

#[test]
fn native_runtime_wire_errors_preserve_id_message_and_type() {
    for (kind, name) in [
        (Runtime, "app_server_runtime_error"),
        (
            ChromeExtensionUpdateRequired,
            "chrome_extension_update_required",
        ),
        (CodexAppUpdateRequired, "codex_app_update_required"),
        (ManifestInvalid, "manifest_invalid"),
        (ManifestMissing, "manifest_missing"),
        (NoMatchingCodexInstall, "no_matching_codex_install"),
        (RequiredPathMissing, "required_path_missing"),
    ] {
        let error = RuntimeError {
            kind,
            message: "fixture: \"错误\"\nline".into(),
        };
        for id in [
            json!(null),
            json!(0),
            json!(u64::MAX),
            json!("request-1"),
            json!({"opaque":1}),
        ] {
            let response = error.response(&id);
            assert_eq!(
                response,
                json!({"jsonrpc":"2.0","id":id,"error":{"code":1,"message":"fixture: \"错误\"\nline","data":{"type":name}}})
            );
            let wire = serde_json::to_vec(&response).unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&wire).unwrap(),
                response
            );
        }
    }
}

#[test]
fn manifest_errors_map_to_native_update_and_configuration_categories() {
    for (source, expected) in [
        (
            ManifestError::Protocol(ProtocolMismatch::CandidateNewer),
            ChromeExtensionUpdateRequired,
        ),
        (
            ManifestError::Protocol(ProtocolMismatch::CandidateOlderOrMissing),
            CodexAppUpdateRequired,
        ),
        (ManifestError::DocumentSchema, ManifestInvalid),
        (ManifestError::EntriesShape, ManifestInvalid),
        (ManifestError::EntrySchema, ManifestInvalid),
        (ManifestError::MalformedEntry, ManifestInvalid),
        (
            ManifestError::InvalidRegistry("fixture error".into()),
            ManifestInvalid,
        ),
        (ManifestError::MissingRegistry, ManifestMissing),
        (ManifestError::NoCompatibleEntry, NoMatchingCodexInstall),
        (
            ManifestError::RequiredPath("nodePath".into()),
            RequiredPathMissing,
        ),
    ] {
        let message = source.to_string();
        let error = RuntimeError::from(source);
        assert_eq!(error.kind, expected);
        assert_eq!(error.message, message);
    }
}
