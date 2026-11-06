//! Schema-2 primitives reconstructed from the pinned native AppServerHostConfig
//! loader. Registry selection is implemented; filesystem discovery, environment
//! resolution and startup integration remain separate.
use serde_json::Value;
use std::{
    ffi::OsString,
    fmt, fs,
    path::{Path, PathBuf},
};

/// Native registry discovery at 0x10001b500..0x10001b7a0. Unlike launch-field
/// resolution, these are var_os values: empty, whitespace and non-Unicode paths
/// are preserved. Only absence triggers a fallback. Candidate order matters.
pub fn registry_paths(mut environment: impl FnMut(&str) -> Option<OsString>) -> Vec<PathBuf> {
    const NAME: &str = "chrome-native-hosts-v2.json";
    let mut paths = Vec::new();
    if let Some(home) = environment("HOME").or_else(|| environment("USERPROFILE")) {
        paths.push(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("OpenAI")
                .join("Codex")
                .join(NAME),
        );
    }
    let codex_home = environment("CODEX_HOME").map(PathBuf::from).or_else(|| {
        environment("HOME")
            .or_else(|| environment("USERPROFILE"))
            .map(|home| PathBuf::from(home).join(".codex"))
    });
    if let Some(home) = codex_home {
        paths.push(home.join(NAME));
    }
    paths
}

#[derive(Debug, PartialEq, Eq)]
pub enum ManifestError {
    DocumentSchema,
    EntriesShape,
    EntrySchema,
    MalformedEntry,
    RequiredPath(String),
    Protocol(ProtocolMismatch),
    NoCompatibleEntry,
    MissingRegistry,
    InvalidRegistry(String),
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DocumentSchema => {
                f.write_str("Codex Chrome native host manifest must use schemaVersion 2")
            }
            Self::EntriesShape => f.write_str("Manifest entries must be an array"),
            Self::EntrySchema => f.write_str("Manifest entry must use schemaVersion 2"),
            Self::MalformedEntry => f.write_str("Matching manifest entry is malformed"),
            Self::Protocol(_) => {
                f.write_str("No Codex app-server entry matches the required protocol version")
            }
            Self::NoCompatibleEntry => {
                f.write_str("No compatible Codex app-server entry was found")
            }
            Self::MissingRegistry => f.write_str("Codex Chrome native host v2 manifest is missing"),
            Self::InvalidRegistry(message) => f.write_str(message),
            Self::RequiredPath(field) => write!(
                f,
                "Codex app-server manifest entry is missing required path {field}"
            ),
        }
    }
}
impl std::error::Error for ManifestError {}

#[derive(Debug)]
pub struct SelectedManifestEntry {
    pub index: usize,
    pub configuration: RawManifestConfiguration,
}

#[derive(Debug)]
pub struct LoadedManifestEntry {
    pub registry_path: PathBuf,
    pub selected: SelectedManifestEntry,
}

/// The adjacent JSON is supplementary, not an alternative to a valid v2
/// registry. Native load returns registry errors before reaching this stage.
pub fn load_configuration(
    paths: &[PathBuf],
    executable: Option<&Path>,
    identity: &IdentityConstraints<'_>,
    protocols: &ProtocolRequirements,
) -> Result<LoadedManifestEntry, ManifestError> {
    let mut loaded = load_registries(paths, identity, protocols)?;
    if let Some(parent) = executable.and_then(Path::parent) {
        if let Ok(text) = fs::read_to_string(parent.join("extension-host-config.json")) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                loaded.selected.configuration.supplement(&value);
            }
        }
    }
    Ok(loaded)
}

/// Try registries in discovery order; the first file with a usable selection
/// wins, rather than comparing scores across files. Missing files are ignored.
/// Other failures are retained while later files are tried. No schema-1 fallback
/// or process/environment configuration is performed by this schema-2 stage.
pub fn load_registries(
    paths: &[PathBuf],
    identity: &IdentityConstraints<'_>,
    protocols: &ProtocolRequirements,
) -> Result<LoadedManifestEntry, ManifestError> {
    let mut path_error = None;
    let mut protocol_error = None;
    let mut invalid_error = None;
    let mut found = false;
    for path in paths {
        let text = match fs::read_to_string(path) {
            Ok(text) => {
                found = true;
                text
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                invalid_error = Some(ManifestError::InvalidRegistry(error.to_string()));
                continue;
            }
        };
        let document = match serde_json::from_str::<Value>(&text) {
            Ok(document) => document,
            Err(error) => {
                invalid_error = Some(ManifestError::InvalidRegistry(error.to_string()));
                continue;
            }
        };
        match select_entry(&document, identity, protocols) {
            Ok(selected) => {
                return Ok(LoadedManifestEntry {
                    registry_path: path.clone(),
                    selected,
                })
            }
            Err(error @ ManifestError::RequiredPath(_)) => path_error = Some(error),
            Err(ManifestError::Protocol(error)) => {
                if protocol_error.is_none() || error == ProtocolMismatch::CandidateNewer {
                    protocol_error = Some(error);
                }
            }
            Err(ManifestError::NoCompatibleEntry) => {}
            Err(error) => invalid_error = Some(error),
        }
    }
    Err(path_error
        .or_else(|| protocol_error.map(ManifestError::Protocol))
        .or(invalid_error)
        .unwrap_or(if found {
            ManifestError::NoCompatibleEntry
        } else {
            ManifestError::MissingRegistry
        }))
}

/// Select from a parsed schema-2 registry. An invalid entry schema aborts even
/// after a valid candidate was found. Identity misses are skipped. Protocol
/// failures are remembered (newer wins); missing required paths remember the
/// last failure. If no candidate succeeds, path errors precede protocol errors.
/// No process is launched and no environment is read.
pub fn select_entry(
    document: &Value,
    identity: &IdentityConstraints<'_>,
    protocols: &ProtocolRequirements,
) -> Result<SelectedManifestEntry, ManifestError> {
    let entries = entries(document)?;
    let mut best: Option<(usize, u16, RawManifestConfiguration)> = None;
    let mut path_error = None;
    let mut protocol_error = None;
    for (index, entry) in entries.iter().enumerate() {
        validate_entry_schema(entry)?;
        let Some(score) = identity_score(entry, identity) else {
            continue;
        };
        if let Err(error) = validate_protocols(entry, protocols) {
            if protocol_error.is_none() || error == ProtocolMismatch::CandidateNewer {
                protocol_error = Some(error);
            }
            continue;
        }
        if let Err(error) = validate_runtime_paths(entry) {
            path_error = Some(error);
            continue;
        }
        let configuration = extract_configuration(entry)?;
        if best.as_ref().is_none_or(|(current, current_score, _)| {
            candidate_is_preferred(entry, score, &entries[*current], *current_score)
        }) {
            best = Some((index, score, configuration));
        }
    }
    if let Some((index, _, configuration)) = best {
        return Ok(SelectedManifestEntry {
            index,
            configuration,
        });
    }
    Err(path_error
        .or_else(|| protocol_error.map(ManifestError::Protocol))
        .unwrap_or(ManifestError::NoCompatibleEntry))
}

/// Raw schema-2 extraction, before environment overrides/defaults. Resources
/// are checked for existence separately, not retained in this native record.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct RawManifestConfiguration {
    pub app_server_protocol_version: Option<u64>,
    pub native_host_protocol_version: Option<u64>,
    pub app_version: Option<String>,
    pub browser_client_path: Option<String>,
    pub browser_service_path: Option<String>,
    pub channel: Option<String>,
    pub cli_version: Option<String>,
    pub codex_cli_path: Option<String>,
    pub codex_home: Option<String>,
    pub entry_id: Option<String>,
    pub native_host_version: Option<String>,
    pub node_path: Option<String>,
    pub node_repl_path: Option<String>,
    pub proxy_host: Option<String>,
    pub proxy_port: Option<u16>,
}

impl RawManifestConfiguration {
    /// Only the seven observed launch strings and nonzero port fill gaps.
    /// The native reader does not validate schemaVersion on this sidecar.
    /// Registry metadata/protocols are never replaced by sidecar fields.
    pub fn supplement(&mut self, sidecar: &Value) {
        let text = |key| {
            sidecar
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
        };
        for (target, key) in [
            (&mut self.browser_client_path, "browserClientPath"),
            (&mut self.browser_service_path, "browserServicePath"),
            (&mut self.codex_cli_path, "codexCliPath"),
            (&mut self.codex_home, "codexHome"),
            (&mut self.node_path, "nodePath"),
            (&mut self.node_repl_path, "nodeReplPath"),
            (&mut self.proxy_host, "proxyHost"),
        ] {
            if target.is_none() {
                *target = text(key);
            }
        }
        if self.proxy_port.is_none() {
            self.proxy_port = sidecar
                .get("proxyPort")
                .and_then(Value::as_u64)
                .and_then(|p| u16::try_from(p).ok())
                .filter(|p| *p != 0);
        }
    }
}

pub fn extract_configuration(entry: &Value) -> Result<RawManifestConfiguration, ManifestError> {
    let entry = entry.as_object().ok_or(ManifestError::MalformedEntry)?;
    let paths = entry
        .get("paths")
        .and_then(Value::as_object)
        .ok_or(ManifestError::MalformedEntry)?;
    let text = |value: Option<&Value>| {
        value
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
    };
    Ok(RawManifestConfiguration {
        app_server_protocol_version: entry
            .get("appServerProtocolVersion")
            .and_then(Value::as_u64),
        native_host_protocol_version: entry
            .get("nativeHostProtocolVersion")
            .and_then(Value::as_u64),
        app_version: text(entry.get("appVersion")),
        browser_client_path: text(paths.get("browserClientPath")),
        browser_service_path: text(paths.get("browserServicePath")),
        channel: text(entry.get("channel")),
        cli_version: text(entry.get("cliVersion")),
        codex_cli_path: text(paths.get("codexCliPath")),
        codex_home: text(paths.get("codexHome")),
        entry_id: text(entry.get("entryId")),
        native_host_version: text(entry.get("nativeHostVersion")),
        node_path: text(paths.get("nodePath")),
        node_repl_path: text(paths.get("nodeReplPath")),
        proxy_host: text(entry.get("proxyHost")),
        // Unlike the environment resolver, raw manifest extraction excludes 0.
        proxy_port: entry
            .get("proxyPort")
            .and_then(Value::as_u64)
            .and_then(|port| u16::try_from(port).ok())
            .filter(|port| *port != 0),
    })
}

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

#[derive(Default)]
pub struct ProtocolRequirements {
    pub app_server: Option<u64>,
    pub native_host: Option<u64>,
}

/// Descriptive Core names for native mismatch discriminants 1 and 2. Wire
/// error-code mapping is deliberately not inferred from these discriminants.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum ProtocolMismatch {
    CandidateNewer,
    CandidateOlderOrMissing,
}

/// Both supplied requirements demand exact integer matches. A newer candidate
/// protocol takes precedence over a missing/older value in the other protocol.
pub fn validate_protocols(
    entry: &Value,
    required: &ProtocolRequirements,
) -> Result<(), ProtocolMismatch> {
    let mut mismatch = None;
    for (field, expected) in [
        ("appServerProtocolVersion", required.app_server),
        ("nativeHostProtocolVersion", required.native_host),
    ] {
        if let Some(expected) = expected {
            match entry.get(field).and_then(Value::as_u64) {
                Some(actual) if actual == expected => {}
                Some(actual) if actual > expected => {
                    mismatch = Some(ProtocolMismatch::CandidateNewer)
                }
                _ if mismatch.is_none() => {
                    mismatch = Some(ProtocolMismatch::CandidateOlderOrMissing)
                }
                _ => {}
            }
        }
    }
    mismatch.map_or(Ok(()), Err)
}

/// Observed sequential required paths after identity/protocol acceptance.
pub fn validate_runtime_paths(entry: &Value) -> Result<(), ManifestError> {
    for field in ["codexCliPath", "codexHome", "nodePath", "resourcesPath"] {
        required_manifest_path_exists(entry, field)?;
    }
    Ok(())
}

/// This is only a manifest presence hint: native code checks a u64 PID value,
/// including zero, and adds one. It does not check whether that PID is alive.
pub fn presence_bonus(entry: &Value) -> u16 {
    u16::from(
        entry
            .get("presence")
            .and_then(|presence| presence.get("pid"))
            .and_then(Value::as_u64)
            .is_some(),
    )
}

/// Ranking after a candidate has passed validation/config extraction. updatedAt
/// is compared as the original untrimmed string, not parsed as a timestamp.
/// Equal keys retain the first candidate. Callers supply the identity score;
/// this helper adds the manifest presence hint once.
pub fn candidate_is_preferred(
    candidate: &Value,
    candidate_identity_score: u16,
    current: &Value,
    current_identity_score: u16,
) -> bool {
    let candidate_score =
        u32::from(candidate_identity_score) + u32::from(presence_bonus(candidate));
    let current_score = u32::from(current_identity_score) + u32::from(presence_bonus(current));
    let updated_at = |entry: &Value| {
        entry
            .get("updatedAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned()
    };
    candidate_score > current_score
        || (candidate_score == current_score && updated_at(candidate) > updated_at(current))
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
