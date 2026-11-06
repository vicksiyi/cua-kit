#!/usr/bin/env python3
"""Version-bound static native control audit. Does not launch the vendor executable."""
import hashlib
import json
import re
import subprocess
import sys
import struct
from pathlib import Path

artifact = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome/extension-host/macos/arm64/ChatGPT for Chrome')
raw = artifact.read_bytes()
sha = hashlib.sha256(raw).hexdigest()
expected = '2a5b1035b5dcbb6c9a55f2acf775dc5124d816131388332af60ec2850fd99f5f'
if sha != expected:
    raise SystemExit('Artifact changed: re-audit function addresses before using this extractor')

def disassemble(start, stop):
    return subprocess.check_output(['xcrun', 'llvm-objdump', '--disassemble', '--demangle',
        '--start-address='+hex(start), '--stop-address='+hex(stop), str(artifact)], text=True)

control = disassemble(0x100025498, 0x100026880)
assets = disassemble(0x100015fd8, 0x100017754)
sanitizer = disassemble(0x100029c24, 0x100029ea8)
open_file = disassemble(0x100036150, 0x100036858)
config_load = disassemble(0x10001b4c4, 0x10001fd38)
env_filter = disassemble(0x1000213e8, 0x100021514)
required_path = disassemble(0x1000248cc, 0x100024a0c)
remember_update = disassemble(0x100024a0c, 0x100024a94)
# Decode only straight-line method comparison operands, not arbitrary code semantics.
# x21 is the method string pointer loaded at 0x100025508. Constants are assembled
# with MOV/MOVK; string loads include overlapping tails at offsets 11 and 27.
registers = {}
compared = {}
comparison_start = None
methods = {}
for line in control.splitlines():
    match = re.match(r'([0-9a-f]+):\s+[0-9a-f]+\s+(.+)', line)
    if not match:
        continue
    address, instruction = match.groups()
    instruction = instruction.split(';')[0].strip()
    move = re.match(r'(mov|movk)\s+([xw]\d+), #0x([0-9a-f]+)(?:, lsl #(\d+))?', instruction)
    if move:
        op, reg, value, shift = move.groups()
        key = reg[1:]
        shift = int(shift or 0)
        previous = registers.get(key)
        value = int(value, 16)
        if op == 'mov':
            registers[key] = ('constant', value)
        elif previous and previous[0] == 'constant':
            registers[key] = ('constant', (previous[1] & ~(65535 << shift)) | (value << shift))
    load = re.match(r'(ldp|ldr|ldur|ldrh)\s+([xw]\d+)(?:, ([xw]\d+))?, \[x21(?:, #(0x[0-9a-f]+|\d+))?\]', instruction)
    if load:
        op, first, second, offset = load.groups()
        offset = int(offset or '0', 0)
        width = 2 if op == 'ldrh' else (8 if first[0] == 'x' else 4)
        registers[first[1:]] = ('input', offset, width)
        if second:
            registers[second[1:]] = ('input', offset + width, width)
    compare = re.match(r'(?:cmp|ccmp)\s+[xw](\d+), [xw](\d+)', instruction)
    if compare:
        left, right = (registers.get(reg) for reg in compare.groups())
        if left and right and left[0] == 'input' and right[0] == 'constant':
            offset, width = left[1:]
            if offset == 0:
                compared = {}
                comparison_start = address
            value = right[1].to_bytes(8, 'little')[:width]
            for index, byte in enumerate(value):
                existing = compared.get(offset + index)
                if existing is not None and existing != byte:
                    raise RuntimeError('Conflicting overlapping method bytes at '+address)
                compared[offset + index] = byte
    if re.match(r'b\.(?:eq|ne)\s', instruction) and compared:
        if sorted(compared) == list(range(len(compared))):
            value = bytes(compared[i] for i in range(len(compared)))
            if value.startswith(b'codexRuntime/'):
                methods.setdefault(value.decode('ascii'), {'comparisonStart': '0x'+comparison_start, 'comparisonBranch': '0x'+address})
        compared = {}

expected_methods = {'codexRuntime/'+name for name in [
    'hello', 'status', 'ensure', 'restart', 'openLocalFile',
    'tabContextAsset/create', 'tabContextAsset/appendChunk',
    'tabContextAsset/finish', 'tabContextAsset/abort', 'tabContextAsset/remove']}
if set(methods) != expected_methods:
    raise RuntimeError('Method decode mismatch: '+repr(set(methods)^expected_methods))

def evidence(text, start, stop, required):
    lines = [line.strip() for line in text.splitlines() if re.match(r'[0-9a-f]+:', line)
             and start <= int(line.split(':')[0], 16) <= stop]
    joined = '\n'.join(lines)
    for item in required:
        if item not in joined:
            raise RuntimeError('Missing expected instruction evidence: '+item)
    return lines

for symbol in ['<uuid::Uuid>::new_v4', 'base64::engine::Engine::decode',
               '<std::fs::OpenOptions>::_open', '<std::fs::File as std::io::Write>::write_all']:
    if symbol not in assets:
        raise RuntimeError('Missing dependency call: '+symbol)
for site in ['1000256bc:', '100025e00:']:
    if not any(site in line and 'remove_tab_context_asset>' in line for line in control.splitlines()):
        raise RuntimeError('Missing shared abort/remove dispatch: '+site)

# Rust compact formatting literal: 57-byte prefix followed by one argument.
missing_path_prefix = b'Codex app-server manifest entry is missing required path '
if raw[0x8d2f1:0x8d32d] != bytes([len(missing_path_prefix)]) + missing_path_prefix + b'\xc0\x00':
    raise RuntimeError('Required path diagnostic formatting literal changed')
for diagnostic in [b'Codex Chrome native host manifest must use schemaVersion 2', b'Manifest entries must be an array', b'Manifest entry must use schemaVersion 2']:
    if diagnostic not in raw:
        raise RuntimeError('Missing schema diagnostic literal')

for offset, name in [(0x9080a, 'extensionHostPath'), (0x9081b, 'nativeHostNames'), (0x9082a, 'extensionIds'), (0x90836, 'extensionBuildChannels')]:
    if raw[offset:offset+len(name)] != name.encode():
        raise RuntimeError('Identity field literal changed: '+name)

configuration_strings = [
    (0x90431, 'appVersion', 'entry', 0x10001c354),
    (0x90690, 'browserClientPath', 'paths', 0x10001c3f0),
    (0x906a1, 'browserServicePath', 'paths', 0x10001c48c),
    (0x9043b, 'channel', 'entry', 0x10001c524),
    (0x90442, 'cliVersion', 'entry', 0x10001c5bc),
    (0x906b3, 'codexCliPath', 'paths', 0x10001c658),
    (0x906bf, 'codexHome', 'paths', 0x10001c6f4),
    (0x90401, 'entryId', 'entry', 0x10001c78c),
    (0x90465, 'nativeHostVersion', 'entry', 0x10001c854),
    (0x90d88, 'nodePath', 'paths', 0x10001c8f0),
    (0x906c8, 'nodeReplPath', 'paths', 0x10001c98c),
    (0x906d4, 'proxyHost', 'entry', 0x10001ca24),
]
for offset, name, parent, call in configuration_strings:
    if raw[offset:offset+len(name)] != name.encode():
        raise RuntimeError('Configuration field literal changed: '+name)
    evidence(config_load, call, call, ['trim_matches'])

registry_literals = [(0x90dac,'HOME'),(0x901d7,'USERPROFILE'),(0x904e5,'CODEX_HOME'),(0x9091a,'Library'),(0x90921,'Application Support'),(0x9090f,'OpenAI'),(0x90915,'Codex'),(0x908f4,'chrome-native-hosts-v2.json'),(0x90069,'.codex')]
for offset, literal in registry_literals:
    if raw[offset:offset+len(literal)] != literal.encode():
        raise RuntimeError('Registry path literal changed: '+literal)

# The JSON Number literal referenced by string_result_response is PosInt(1).
if struct.unpack('<QQ', raw[0x90cf0:0x90d00]) != (0, 1):
    raise RuntimeError('String-result error code literal changed')
if raw[0x8d2ec:0x8d2f1] != b'\xc0\x01-\xc0\x00':
    raise RuntimeError('UUID/name formatting literal changed')

environment_fields = [
    (0x90491, 14, 'CODEX_CLI_PATH', 0x10001e4e8),
    (0x9049f, 18, 'CODEX_EXTENSION_ID', 0x10001e58c),
    (0x904b1, 27, 'CODEX_BROWSER_USE_NODE_PATH', 0x10001e638),
    (0x904cc, 25, 'CODEX_BROWSER_CLIENT_PATH', 0x10001e734),
    (0x904e5, 10, 'CODEX_HOME', 0x10001e83c),
    (0x904ef, 20, 'CODEX_NODE_REPL_PATH', 0x10001e948),
    (0x90503, 27, 'CODEX_APP_SERVER_PROXY_HOST', 0x10001e9a0),
    (0x9051e, 27, 'CODEX_APP_SERVER_PROXY_PORT', 0x10001ea40),
]
for offset, length, name, call in environment_fields:
    if raw[offset:offset+length].decode() != name:
        raise RuntimeError('Environment name literal mismatch: '+name)
    evidence(config_load, call, call, ['non_empty_env>'])

result = {
    'artifact': str(artifact).removeprefix('/Applications/'), 'sha256': sha,
    'methodExtraction': 'ARM64 method-byte loads and immediate CMP/CCMP operands, including overlapping tail loads; fixed artifact hash required.',
    'methods': [{'method': name, **positions} for name, positions in sorted(methods.items())],
    'assetLimits': {
        'maxActiveAssets': {'value': 16, 'basis': 'create accepts an existing count <= 15; otherwise returns too-many-active-assets error',
            'instructions': evidence(assets, 0x100016084, 0x10001608c, ['#0xf', 'b.ls'])},
        'maxBytesPerAsset': {'value': 104857600, 'basis': 'decoded chunk length plus existing size uses saturating addition; accepts <= 100 MiB',
            'instructions': evidence(assets, 0x1000174e4, 0x1000174f8, ['adds', 'csinv', '#0x6400000', 'b.ls'])},
    },
    'fileNameSanitization': {
        'implementation': 'native/browser-extension-host/src/tab_context_asset.rs',
        'component': 'Last nonempty slash/backslash component, before trimming whitespace; fallback tab-context.txt',
        'reservedCharacters': [chr(i) for i in range(64) if (0xd400042400000000 >> i) & 1] + ['|'],
        'replacement': '_',
        'maxUtf8Bytes': 218,
        'extension': 'Preserve last-dot suffix only when dot is noninitial, suffix is shorter than 218 bytes and truncated trimmed stem remains nonempty; otherwise truncate whole name at UTF-8 boundary and trim.',
        'maskInstructions': evidence(sanitizer, 0x100029cb8, 0x100029cbc, ['#0x42400000000', '#0xd400']),
        'pipeAndNonAsciiInstructions': evidence(sanitizer, 0x100029d84, 0x100029d98, ['#0x7c', '#0x80']),
        'lengthInstructions': evidence(assets, 0x100016338, 0x100016340, ['#0xdb', 'b.hs']),
        'extensionLimitInstructions': evidence(assets, 0x100016408, 0x100016424, ['#0xda', 'b.hs']),
        'limit': 'Static reconstruction; no direct invocation of the original native function. Sanitization alone is not path authorization; original create subsequently prefixes a UUID.',
    },
    'dependenciesObservedInCalls': ['uuid::Uuid::new_v4', 'base64::engine::Engine::decode', 'std::fs::OpenOptions', 'std::io::Write::write_all'],
    'dispatchObservations': {
        'abortAndRemove': 'Both branch to AppServerManager::remove_tab_context_asset (call sites 0x1000256bc and 0x100025e00).',
        'unknownMethods': 'The compare miss returns the unhandled sentinel at 0x100025e98 rather than fabricating a success response.',
        'layer': 'handle_native_host_control_message is native host control; it is separate from browser RPC forwarding.',
    },
    'assetImplementation': {
        'store': 'native/browser-extension-host/src/tab_context_asset.rs',
        'dispatcher': 'native/browser-extension-host/src/control.rs',
        'entry': 'Extension stdio input before RpcRouter::from_extension',
        'implementedMethods': ['create', 'appendChunk', 'finish', 'abort', 'remove'],
        'errorCode': {'value': 1, 'referenceInstruction': '0x1000229fc', 'literalAddress': '0x100090cf0'},
        'pathComposition': {'pattern': 'UUID-sanitizedName', 'formatLiteralOffset': '0x8d2ec'},
        'coreDifferences': ['owned per-host endpoint/assets directory instead of global temp/codex-tab-context-assets',
            'private-root and inode checks protect Core-owned cleanup', 'parameter and I/O diagnostic wording not fully matched'],
        'validation': 'Real stdio process test with restored extension peer; disk byte checks and EOF cleanup. Not dynamic original-host parity.',
    },
    'localFileOpening': {
        'implementation': 'native/browser-extension-host/src/open_local_file.rs',
        'method': 'codexRuntime/openLocalFile', 'parameter': 'path',
        'validation': ['reject embedded NUL', 'require absolute path', 'symlink_metadata must resolve a regular file',
            'reject final-component symlinks', 'reject ASCII-case-insensitive command/desktop/jar/terminal/tool extensions',
            'reject any Unix execute permission bit'],
        'executeMaskInstructions': evidence(open_file, 0x100036364, 0x100036370, ['#0x49', 'tst']),
        'spawnInstructions': evidence(open_file, 0x10003656c, 0x1000365bc, ['Command>::new', 'Command>::arg', 'Command>::spawn']),
        'openerLiteral': raw[0x912d8:0x912dc].decode(),
        'blockedExtensionLiteral': raw[0x91250:0x91271].decode(),
        'completion': 'Successful spawn responds with empty result; detached waiter reaps opener, not GUI application completion.',
        'validationScope': 'Rust validator fixtures and real stdio host with test-owned PATH opener; no actual LaunchServices/GUI acceptance.',
    },
    'launchFieldResolution': {
        'implementation': 'native/browser-extension-host/src/app_server_configuration.rs',
        'environmentCalls': [{'name': name, 'literalOffset': hex(offset), 'call': hex(call)} for offset, length, name, call in environment_fields],
        'normalization': 'non_empty_env uses env::var; invalid Unicode or absent is None; Unicode whitespace is trimmed and empty results are absent.',
        'trimInstructions': evidence(env_filter, 0x100021448, 0x100021454, ['trim_matches']),
        'precedence': 'Normalized nonempty environment values override already-selected config fields. No raw JSON parsing is implemented by this module.',
        'defaults': {'codexCliPath': 'codex', 'nodePath': 'node', 'proxyHost': '127.0.0.1', 'proxyPort': 0},
        'port': 'u16 parse accepts zero and a plus sign; invalid/overflow environment input falls back to selected config port then zero.',
        'portFallbackInstructions': evidence(config_load, 0x10001ebcc, 0x10001ebe4, ['csel', 'tst']),
        'integrationStatus': 'Resolver library only; not yet wired to runtime selection/spawn. Schema-2 registry matching and raw configuration parsing remain open.',
    },
    'manifestValidation': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs',
        'rootSchemaInstructions': evidence(config_load, 0x10001b96c, 0x10001b988, ['#0x2', 'cbnz']),
        'entriesArrayInstructions': evidence(config_load, 0x10001b99c, 0x10001b9ac, ['#0x4', 'b.ne']),
        'entrySchemaInstructions': evidence(config_load, 0x10001b9f0, 0x10001ba10, ['#0x2', 'cbnz']),
        'schema': 'JSON positive integer 2, not floating 2.0 or string 2. Array order and unknown entry fields preserved; candidate failure policy not yet implemented.',
        'pathTrimInstructions': evidence(required_path, 0x100024918, 0x100024940, ['#0x3', 'trim_matches']),
        'pathMetadataInstructions': evidence(required_path, 0x10002499c, 0x1000249a8, ['std::sys::fs::metadata', 'tbz']),
        'pathContract': 'entry.paths[field] must be a nonempty trimmed string with successful metadata; follows symlinks and accepts directories. No executable or absolute-path requirement in this helper.',
        'missingPathFormatBytes': raw[0x8d2f1:0x8d32d].hex(),
        'integrationStatus': 'Validation primitives composed by select_entry; process launch remains separate.',
    },
    'manifestIdentityMatching': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs::identity_score',
        'hostPathComparison': evidence(config_load, 0x10001bb70, 0x10001bc04, ['Path>::components', 'Iterator>::eq']),
        'canonicalizationFallback': evidence(config_load, 0x10001bdf4, 0x10001be20, ['std::fs::canonicalize', 'std::sys::fs::canonicalize']),
        'hostPathWeight': evidence(config_load, 0x10001bc1c, 0x10001bc20, ['#0x64']),
        'hostNameWeight': evidence(config_load, 0x10001bb54, 0x10001bb5c, ['#0x32']),
        'extensionIdWeight': evidence(config_load, 0x10001bcc4, 0x10001bccc, ['#0x19']),
        'buildChannelWeight': evidence(config_load, 0x10001bd60, 0x10001bd68, ['#0xa']),
        'arrayMemberChecks': {
            'nativeHostNames': evidence(config_load, 0x10001bb28, 0x10001bb50, ['#0x3', 'ccmp', 'cbnz']),
            'extensionIds': evidence(config_load, 0x10001bc94, 0x10001bcc0, ['#0x3', 'ccmp', 'cbnz']),
            'extensionBuildChannels': evidence(config_load, 0x10001bd30, 0x10001bd5c, ['#0x3', 'ccmp', 'cbnz']),
        },
        'semantics': 'Only supplied constraints are checked. All supplied constraints must match. String-array membership is exact; nonstrings ignored and duplicate matches add weight once. Paths compare components first, then both canonical paths on mismatch; no trimming.',
        'integrationStatus': 'Identity stage composed by select_entry with protocol/path checks and ranking; process startup remains separate.',
    },
    'manifestViabilityAndRanking': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs',
        'protocolReads': evidence(config_load, 0x10001bd70, 0x10001bde8, ['#0x2', 'cbz', 'cmp']),
        'newerProtocolPrecedence': evidence(config_load, 0x10001bf58, 0x10001bf88, ['b.ls', '#0x1']),
        'nativeProtocolMismatch': evidence(config_load, 0x10001c060, 0x10001c078, ['cbz', 'cmp', 'b.ne']),
        'protocolSemantics': 'Supplied requirements demand exact u64 equality. Missing/invalid/older gives native mismatch discriminant 2; either candidate protocol newer gives discriminant 1. Core names describe comparison, not unverified wire codes.',
        'requiredPathCalls': evidence(config_load, 0x10001c078, 0x10001c0e0, ['required_manifest_path_exists']),
        'resourcesPathCall': evidence(config_load, 0x10001c240, 0x10001c264, ['required_manifest_path_exists']),
        'requiredPathOrder': ['codexCliPath', 'codexHome', 'nodePath', 'resourcesPath'],
        'presenceInstructions': evidence(config_load, 0x10001c278, 0x10001c2b4, ['#0x2', 'cinc']),
        'presenceSemantics': 'One point for presence.pid representable as u64, including zero. This stage does not check OS process liveness.',
        'timestampRead': evidence(config_load, 0x10001cbe8, 0x10001cc0c, ['#0x3']),
        'rankingInstructions': evidence(config_load, 0x10001cc70, 0x10001ccac, ['b.gt', 'csel', 'b.le']),
        'rankingSemantics': 'Higher score first; equal score compares untrimmed updatedAt strings lexically, missing/nonstring becomes empty. Equal keys keep first entry. No date parser.',
        'integrationStatus': 'Native helper stages composed by select_entry with raw extraction and error retention; runtime launch integration remains open.',
    },
    'manifestConfigurationExtraction': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs::extract_configuration',
        'strings': [{'name':name,'parent':parent,'literalOffset':hex(offset),'trimCall':hex(call)} for offset,name,parent,call in configuration_strings],
        'normalization': 'Entry and paths must be objects. String fields use Unicode trim; empty/missing/nonstring becomes None. No path join or existence check in extraction.',
        'protocols': 'Optional u64 protocol values; zero allowed, float/string/negative rejected.',
        'proxyPortInstructions': evidence(config_load, 0x10001cd84, 0x10001cd98, ['#0xffff', '#0x10000', 'ccmp', 'cset']),
        'proxyPortSemantics': 'Only integer 1..65535 retained. Zero becomes absent, unlike the separate environment u16 resolver.',
        'integrationStatus': 'Raw extraction composed by select_entry; environment resolution and process startup remain separate.',
    },
    'manifestSelection': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs::select_entry',
        'schemaAbort': evidence(config_load, 0x10001d150, 0x10001d17c, ['#0x3', '#0x1', '#0x2']),
        'pathErrorRetention': evidence(config_load, 0x10001c1c4, 0x10001c224, ['#0x6', '0x10001b9dc']),
        'protocolErrorPriority': evidence(remember_update, 0x100024a0c, 0x100024a38, ['#0x1', 'ccmp', 'b.ne']),
        'winnerBeforeErrors': evidence(config_load, 0x10001d1ac, 0x10001d1c4, ['#0x2', 'b.ne', '0x10001d294']),
        'fallbackProtocolError': evidence(config_load, 0x10001d294, 0x10001d2ac, ['0x10001d2e4']),
        'semantics': 'Validate schema before identity filtering. Skip identity misses. Retain protocol mismatch with newer-candidate priority. Retain last required-path failure. Rank successfully extracted candidates. Winner takes precedence over retained nonfatal errors; otherwise last path error, then retained protocol error, then no-compatible-entry. Schema/malformed extraction failures abort immediately.',
        'integrationStatus': 'Composed in-memory schema-2 selection with real path metadata checks. Registry discovery/read, schema-1 fallback, environment precedence and runtime process integration remain open.',
    },
    'registryPathDiscovery': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs::registry_paths',
        'literals': [{'offset':hex(offset),'value':literal} for offset,literal in registry_literals],
        'homeFallback': evidence(config_load, 0x10001b500, 0x10001b53c, ['std::env::_var_os', 'b.ne']),
        'applicationSupportPath': evidence(config_load, 0x10001b540, 0x10001b5d8, ['Path>::_join']),
        'codexHomeFallback': evidence(config_load, 0x10001b684, 0x10001b740, ['std::env::_var_os', 'Path>::_join']),
        'semantics': 'First HOME (or USERPROFILE when absent)/Library/Application Support/OpenAI/Codex/registry. Then CODEX_HOME/registry, or HOME/USERPROFILE plus .codex/registry when CODEX_HOME absent. var_os preserves empty/whitespace/non-Unicode; no deduplication or file reads.',
        'integrationStatus': 'Path discovery implemented. Multi-file read/error fallback and schema-1/runtime integration remain open.',
    },
    'registryFileLoading': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs::load_registries',
        'readParse': evidence(config_load, 0x10001b8e4, 0x10001b940, ['read_to_string', 'serde_json::de::from_trait']),
        'missingFileBranch': evidence(config_load, 0x10001cd9c, 0x10001cda8, ['Error>::kind', '0x10001cfd0']),
        'retainedErrorPrecedence': evidence(config_load, 0x10001d40c, 0x10001d4d4, ['0x10001d468', '0x10001d49c', '0x10001d4d4']),
        'firstSuccessExit': evidence(config_load, 0x10001ed58, 0x10001ed68, ['0x10001d898']),
        'semantics': 'First successfully selected registry wins. Missing files ignored; other read/parse/schema errors remembered while trying later files. If none succeeds: last required-path error, then protocol mismatch with newer priority, then last read/parse/schema error, then no-compatible if a file was read or missing-registry otherwise.',
        'scope': 'Actual UTF-8 file reads and existing selector; no schema-1 fallback, environment resolution or process launch yet. Tests use owned temporary files only.',
    },
    'adjacentConfiguration': {
        'implementation': 'native/browser-extension-host/src/app_server_manifest.rs::load_configuration and RawManifestConfiguration::supplement',
        'filename': raw[0x90676:0x90690].decode(),
        'registryErrorReturnsBeforeSidecar': evidence(config_load, 0x10001d570, 0x10001d5bc, ['0x10001d5bc', '0x10001eccc']),
        'pathReadParse': evidence(config_load, 0x10001d628, 0x10001d6e4, ['current_exe', 'Path>::parent', 'Path>::_join', 'read_to_string', 'serde_json::de::from_trait']),
        'ignoredReadFailure': evidence(config_load, 0x10001d718, 0x10001d724, ['drop_glue', '0x10001e1c8']),
        'registryFieldsWin': evidence(config_load, 0x10001e2c0, 0x10001e358, ['0x10001e32c', '0x10001e348']),
        'sidecarPort': evidence(config_load, 0x10001e198, 0x10001e1a8, ['#0xffff', '#0x10000', 'cset']),
        'semantics': 'Only reached after v2 registry selection succeeds. Parent-of-current-exe sidecar supplies seven missing launch strings and nonzero u16 proxyPort. Reader ignores missing/unreadable/invalid JSON/nonobject; no schemaVersion gate. Registry values precede supplementary values. Does not rescue missing/incompatible v2 registry.',
        'integrationStatus': 'File loading and supplementation composed; final environment composition and process launch remain open.',
    },
    'composedConfigurationLoading': {
        'implementation': 'native/browser-extension-host/src/app_server_configuration.rs::load_configuration',
        'extensionIdSource': evidence(config_load, 0x10001e58c, 0x10001e5bc, ['non_empty_env', '#0x38', 'String as core::clone::Clone']),
        'extensionIdFallback': evidence(config_load, 0x10001e5f0, 0x10001e624, ['0x10001e620']),
        'semantics': 'Discovery -> first usable registry -> adjacent missing-field supplementation -> environment resolution. Invocation extension ID filters candidates and is the fallback final ID; nonempty CODEX_EXTENSION_ID changes only final launch ID. Registry failure returns before launch-environment resolution.',
        'scope': 'Composed loader with caller-supplied executable and environment accessor; no runtime manager or process spawn integration yet.',
    },
    'remainingUnknowns': ['process launch contract and runtime integration', 'complete hello/status response schemas',
        'filename sanitization edge cases', 'asset cleanup on all process/session failures', 'authorization at control entry',
        'error codes and full websocket proxy behavior'],
    'limits': 'Static analysis, not native source recovery or runtime parity. No original host, browser, app-server, file opener or network request was executed.',
}
print(json.dumps(result, indent=2))
