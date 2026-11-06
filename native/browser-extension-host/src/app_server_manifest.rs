//! Schema-2 primitives reconstructed from the pinned native AppServerHostConfig
//! loader. Candidate matching/ranking and startup integration remain separate.
use serde_json::Value;
use std::{fmt, fs, path::Path};

#[derive(Debug, PartialEq, Eq)]
pub enum ManifestError {
    DocumentSchema,
    EntriesShape,
    EntrySchema,
    RequiredPath(String),
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DocumentSchema => {
                f.write_str("Codex Chrome native host manifest must use schemaVersion 2")
            }
            Self::EntriesShape => f.write_str("Manifest entries must be an array"),
            Self::EntrySchema => f.write_str("Manifest entry must use schemaVersion 2"),
            Self::RequiredPath(field) => write!(
                f,
                "Codex app-server manifest entry is missing required path {field}"
            ),
        }
    }
}
impl std::error::Error for ManifestError {}

/// Borrow entries without reordering, discarding unknown fields or selecting a
/// candidate. Empty arrays are valid shape; selection may subsequently fail.
pub fn entries(document: &Value) -> Result<&[Value], ManifestError> {
    if document.get("schemaVersion").and_then(Value::as_u64) != Some(2) {
        return Err(ManifestError::DocumentSchema);
    }
    document
        .get("entries")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or(ManifestError::EntriesShape)
}

/// The selector decides whether a rejected entry is skipped or reported; this
/// primitive deliberately does not impose an unproven whole-registry policy.
pub fn validate_entry_schema(entry: &Value) -> Result<(), ManifestError> {
    if entry.get("schemaVersion").and_then(Value::as_u64) == Some(2) {
        Ok(())
    } else {
        Err(ManifestError::EntrySchema)
    }
}

/// Inputs already obtained by the native loader. Their discovery/precedence is
/// not inferred here. An absent input disables only its own matching condition.
#[derive(Default)]
pub struct IdentityConstraints<'a> {
    pub extension_host_path: Option<&'a Path>,
    pub native_host_name: Option<&'a str>,
    pub extension_id: Option<&'a str>,
    pub extension_build_channel: Option<&'a str>,
}

fn matching_path(left: &Path, right: &Path) -> bool {
    // Path equality compares components, not filesystem existence. The native
    // loader only attempts canonicalization after this comparison fails.
    left == right
        || match (fs::canonicalize(left), fs::canonicalize(right)) {
            (Ok(left), Ok(right)) => left == right,
            _ => false,
        }
}

/// Identity filtering and specificity score from 0x10001ba14..0x10001bd70.
/// This is not final selection: schema/protocol/path viability and presence /
/// updatedAt ranking must still be applied by the loader. None means mismatch.
pub fn identity_score(entry: &Value, constraints: &IdentityConstraints<'_>) -> Option<u16> {
    let mut score = 0;
    if let Some(expected) = constraints.extension_host_path {
        let actual = entry.get("paths")?.get("extensionHostPath")?.as_str()?;
        if !matching_path(Path::new(actual), expected) {
            return None;
        }
        score += 100;
    }
    for (field, expected, weight) in [
        ("nativeHostNames", constraints.native_host_name, 50),
        ("extensionIds", constraints.extension_id, 25),
        (
            "extensionBuildChannels",
            constraints.extension_build_channel,
            10,
        ),
    ] {
        if let Some(expected) = expected {
            if !entry
                .get(field)?
                .as_array()?
                .iter()
                .any(|value| value.as_str() == Some(expected))
            {
                return None;
            }
            score += weight;
        }
    }
    Some(score)
}

/// Mirrors required_manifest_path_exists at 0x1000248cc: trim, then metadata.
/// This is existence validation, not file/executable/absolute-path validation.
/// Metadata follows symlinks. No filesystem changes or process launch occurs.
pub fn required_manifest_path_exists(entry: &Value, field: &str) -> Result<(), ManifestError> {
    let path = entry
        .get("paths")
        .and_then(|paths| paths.get(field))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty());
    if path.is_some_and(|path| fs::metadata(path).is_ok()) {
        Ok(())
    } else {
        Err(ManifestError::RequiredPath(field.to_owned()))
    }
}
