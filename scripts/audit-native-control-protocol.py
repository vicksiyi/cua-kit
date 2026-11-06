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

proxy_drop = disassemble(0x1000153c0, 0x10001547c)
manager_ensure = disassemble(0x100017754, 0x10001a87c)
proxy_listener = disassemble(0x100021514, 0x1000217e4)
connection_worker = disassemble(0x10002cb70, 0x10002cd24)
proxy_upgrade = disassemble(0x100027664, 0x1000288fc)
plain_response = disassemble(0x100021a94, 0x100021df0)
http_input = disassemble(0x100022d80, 0x100023f8c)
query_param = disassemble(0x1000217e4, 0x100021970)
prefixed_reader = disassemble(0x10002b0a8, 0x10002b1e4)
websocket_input = disassemble(0x100024a94, 0x100025498)
process_stop = disassemble(0x100020d54, 0x100021064)
proxy_state = disassemble(0x10001b268, 0x10001b4c4)
stdout_thread = disassemble(0x10002c94c, 0x10002ca1c)
detach_writer = disassemble(0x100021970, 0x100021a94)
websocket_write = disassemble(0x100024584, 0x100024810)
websocket_close = disassemble(0x1000224b4, 0x100022634)
stdout_forward = disassemble(0x100026bf8, 0x100027664)
stderr_worker = disassemble(0x10002ca1c, 0x10002cb70)
child_stop = disassemble(0x100021f8c, 0x100022254)
child_wait = disassemble(0x100022254, 0x1000224b4)
error_kind = disassemble(0x10001fd38, 0x10001fec0)
process_start = disassemble(0x10001ffec, 0x100020d54)
manager_status = disassemble(0x10001a87c, 0x10001abec)
proxy_session = disassemble(0x10001fec0, 0x10001ffec)
control = disassemble(0x100025498, 0x100026880)
assets = disassemble(0x100015fd8, 0x100017754)
sanitizer = disassemble(0x100029c24, 0x100029ea8)
open_file = disassemble(0x100036150, 0x100036858)
config_load = disassemble(0x10001b4c4, 0x10001fd38)
env_filter = disassemble(0x1000213e8, 0x100021514)
required_path = disassemble(0x1000248cc, 0x100024a0c)
remember_update = disassemble(0x100024a0c, 0x100024a94)
runtime_error = disassemble(0x100023f8c, 0x100024444)
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

# Translate Mach-O VM addresses, including the pointer table in __DATA_CONST.
segments = []
command_offset = 32
for _ in range(struct.unpack_from('<I', raw, 16)[0]):
    command, size = struct.unpack_from('<II', raw, command_offset)
    if command == 25:
        vm, vm_size, file_offset, file_size = struct.unpack_from('<QQQQ', raw, command_offset + 24)
        segments.append((vm, vm_size, file_offset, file_size))
    command_offset += size

def vm_offset(address):
    for vm, size, offset, file_size in segments:
        if vm <= address < vm + min(size, file_size):
            return offset + address - vm
    raise RuntimeError('No file-backed VM address: '+hex(address))

runtime_error_types = []
for index in range(7):
    pointer = struct.unpack_from('<Q', raw, vm_offset(0x1000b0d88) + index * 8)[0]
    length = struct.unpack_from('<Q', raw, vm_offset(0x100090ca8) + index * 8)[0]
    runtime_error_types.append(raw[vm_offset(pointer):vm_offset(pointer)+length].decode())
if runtime_error_types != ['app_server_runtime_error','chrome_extension_update_required','codex_app_update_required','manifest_invalid','manifest_missing','no_matching_codex_install','required_path_missing']:
    raise RuntimeError('Native runtime error table changed')

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
    'runtimeErrorResponse': {
        'implementation': 'native/browser-extension-host/src/app_server_error.rs',
        'typesInDiscriminantOrder': runtime_error_types,
        'tableLoad': evidence(runtime_error, 0x1000242c4, 0x1000242dc, ['#0x18', '#0xd88', '#0xca8', 'lsl #3']),
        'numericCode': evidence(runtime_error, 0x10002414c, 0x10002415c, ['#0xcf0']),
        'contract': 'JSON-RPC 2.0, original ID, error.code=1, original error message, error.data.type from native enum table. Newer candidate protocol maps to chrome_extension_update_required; older/missing to codex_app_update_required.',
        'integrationStatus': 'Manifest error conversion and response serializer implemented. Runtime hello/status/ensure/restart dispatcher not yet wired.',
    },
    'managerStatus': {
        'implementation': 'native/browser-extension-host/src/app_server_status.rs',
        'connectedPhase': raw[0x90488:0x90490].decode() + 'd',
        'sessionKey': raw[0x90d30:0x90d40].decode(),
        'proxyPresenceBranch': evidence(manager_status, 0x10001a898, 0x10001a8a0, ['cmn', '0x10001a9b0']),
        'idleLiteral': evidence(manager_status, 0x10001aa04, 0x10001aa10, ['#0x6469', '#0x656c']),
        'connectedLiteral': evidence(manager_status, 0x10001a8fc, 0x10001a914, ['#0x64', '#0x488']),
        'sessionRead': evidence(manager_status, 0x10001a96c, 0x10001a998, ['#0xd30', 'runtime_session_id']),
        'sessionLockAndClone': evidence(proxy_session, 0x10001feec, 0x10001ff1c, ['Mutex>::lock', 'String as core::clone::Clone']),
        'dispatcher': evidence(control, 0x100026028, 0x10002602c, ['AppServerManager>::status']),
        'semantics': 'No proxy: {phase:idle}; existing proxy: {phase:connected,runtimeSessionId:<cloned string>}. No configuration load, process spawn or PID health probe occurs in status. Empty strings remain strings.',
        'integrationStatus': 'Status projection only. Not registered as a live control method until real proxy lifecycle exists; never fabricate a connected state from configuration.',
    },
    'processCommand': {
        'implementation': 'native/browser-extension-host/src/app_server_process.rs',
        'arguments': [raw[0x90891:0x9089b].decode(), raw[0x9089b:0x908b6].decode()],
        'homeEnvironment': raw[0x904e5:0x904ef].decode(),
        'executableResolution': evidence(process_start, 0x100020278, 0x1000202f8, ['Path>::is_absolute', 'Path>::components', 'Iterator>::next', 'current_dir', 'Path>::_join']),
        'argumentsAndPipes': evidence(process_start, 0x1000203a4, 0x1000203f0, ['#0x891', '#0x89b', 'Command>::arg', 'Command>::stdin', 'Command>::stdout', 'Command>::stderr']),
        'homeResolution': evidence(process_start, 0x100020460, 0x1000204e4, ['current_dir', 'Path>::_join', '#0x1ff', 'DirBuilder>::_create']),
        'cwdEnvSpawn': evidence(process_start, 0x100020594, 0x1000205e4, ['Command>::cwd', '#0x4e5', 'CommandEnv>::set', 'Command>::spawn']),
        'semantics': 'Bare one-component program retains PATH search; other relative program paths resolve against host cwd. Arguments app-server and --analytics-default-enabled. All three stdio streams piped. Optional codexHome resolves relative to host cwd, create_dir_all, child cwd and CODEX_HOME. Other environment inherited.',
        'integrationStatus': 'Command construction and raw child spawn tested against an owned fake executable. Process reuse, launch-error decoration, stderr drain, proxy/read threads, stop and manager/dispatcher integration remain incomplete.',
    },
    'childStopAndWait': {
        'implementation': 'native/browser-extension-host/src/app_server_process.rs::{stop_child,wait_child}',
        'poisonMessage': raw[0x9013c:0x9015b].decode(),
        'absentChild': evidence(child_stop, 0x100021fa4, 0x100021fa8, ['cbz', '0x100022080']),
        'tryWait': evidence(child_stop, 0x1000220bc, 0x1000220e8, ['Child>::try_wait', '0x100022104']),
        'killAndWait': evidence(child_stop, 0x100022104, 0x100022140, ['Child>::kill', 'Error>::kind', '#0x14', 'Child>::wait']),
        'errno22KindBranch': hex(0x10001fd88 + raw[0x8ffa8 + 22 - 1] * 4),
        'invalidInputDiscriminant': evidence(error_kind, 0x10001fe70, 0x10001fe78, ['#0x14']),
        'wait': evidence(child_wait, 0x100022378, 0x100022390, ['Child>::wait']),
        'semantics': 'Option<Arc<Mutex<Child>>> stop: absent succeeds; poisoned lock is an I/O Other error; try_wait error propagates; already exited succeeds; live child kill then wait. Kill InvalidInput (Darwin EINVAL=22 maps to native kind 0x14) is ignored; other kill errors propagate. Wait helper discards exit status and holds child mutex through wait.',
        'integrationStatus': 'Owned-process tests cover live stop/reap, repeated stop, absent child, nonzero exit and poison error. No production manager wiring or full thread shutdown yet.',
    },
    'stderrWorker': {
        'implementation': 'native/browser-extension-host/src/app_server_process.rs::{consume_stderr,drain_child_stderr}',
        'bufferAndLines': evidence(stderr_worker, 0x10002ca34, 0x10002ca7c, ['#0x2000', 'BufReader<std::process::ChildStderr>', 'Iterator>::next']),
        'errorOrEof': evidence(stderr_worker, 0x10002ca7c, 0x10002ca90, ['0x10002cad4', '0x10002cadc']),
        'filterAndPrint': evidence(stderr_worker, 0x10002ca90, 0x10002cabc, ['trim_matches', 'is_whitespace', 'stdio::_eprint']),
        'detachedThread': evidence(process_start, 0x100020738, 0x100020768, ['drain_child_stderr', 'JoinHandle']),
        'formatLiteralHex': raw[0x8d6b4:0x8d6db].hex(),
        'semantics': '8192-byte BufReader, lines iteration; read/UTF-8 errors terminate silently. Whitespace-only lines skipped, original untrimmed String printed with extension-host: app-server stderr: prefix and newline. Worker detached after creation.',
        'integrationStatus': 'Worker and stream consumer implemented, tested with >1 MiB through a real owned child pipe. Lifecycle owner must take stderr and invoke worker; raw spawn still exposes all three pipes.',
    },
    'stdoutReplay': {
        'implementation': 'native/browser-extension-host/src/app_server_output.rs',
        'crlfOnly': evidence(stdout_forward, 0x100026d14, 0x100026d30, ['#0xd', '#0xa', '0x100026cb4']),
        'initializeIdComparisons': evidence(stdout_forward, 0x100026d84, 0x100026df4, ['#0x1e', '#0x5f5f', '#0x6973', '#0x5f6c', '#0x6169']),
        'methodAndResultPresence': evidence(stdout_forward, 0x100026df4, 0x100026e0c, ['#0x883', '0x100026f4c']),
        'resultLookup': evidence(stdout_forward, 0x100026f4c, 0x100026f70, ['#0x88b', '0x100026e20']),
        'requestTypeAndIdPresence': evidence(stdout_forward, 0x100026e90, 0x100026ed0, ['#0x883', '#0x3', '0x100026c78']),
        'generationAndLimit': evidence(stdout_forward, 0x100026f14, 0x100026f30, ['#0x108', '#0x7f', '0x100027024']),
        'rawInitializeCache': evidence(stdout_forward, 0x100026fac, 0x10002700c, ['#0x108', '#0x38', '#0x48']),
        'contract': 'Strip trailing CR/LF only. Cache raw initialize result with exact reserved ID, absent method and present result. When unattached buffer first 128 method-string messages with an ID field, including null IDs. Generation mismatch does not mutate replay state. Raw text is retained.',
        'integrationStatus': 'Replay helpers tested, not a complete stdout worker. Writer selection, websocket writes, error detach and EOF state cleanup remain to be connected.',
    },
    'websocketWriter': {
        'implementation': 'native/browser-extension-host/src/app_server_websocket.rs',
        'poisonMessage': raw[0x9015b:0x9017a].decode(),
        'frameHeader': evidence(websocket_write, 0x100024690, 0x1000246e4, ['#0x80', '#0x7e', '#0x10, lsl #12', '#0x7f', 'rev']),
        'headerThenPayload': evidence(websocket_write, 0x1000246e4, 0x100024720, ['Write>::write_all', '0x100024710']),
        'closeFrame': evidence(websocket_close, 0x1000224cc, 0x1000224f0, ['#0x8', '#0x0', 'write_shared_websocket_frame', 'drop_glue']),
        'shutdownBoth': evidence(websocket_close, 0x100022554, 0x100022560, ['#0x2', 'shutdown']),
        'semantics': 'Mutex covers header and payload write_all. FIN OR opcode; no masking; lengths <126, <65536, otherwise u64 big endian. No helper-level opcode/control-frame validation. Close attempts empty opcode-8 frame then reacquires lock and shuts down both directions, ignoring errors.',
        'integrationStatus': 'Actual TCP frame boundaries and 400 concurrent frames tested. Handshake, frame reader, authorization and complete stdout worker remain separate work.',
    },
    'composedOutputDelivery': {
        'implementation': 'native/browser-extension-host/src/app_server_output.rs::{OutputState,deliver_line,detach_writer}',
        'writerSelection': evidence(stdout_forward, 0x1000270d8, 0x10002711c, ['#0x108', '#0x100', 'Mutex>::unlock']),
        'writeFailureDetach': evidence(stdout_forward, 0x100027124, 0x100027154, ['#0x1', 'write_shared_websocket_frame', 'detach_client_writer']),
        'identityNotSocketAddress': evidence(detach_writer, 0x1000219bc, 0x1000219f0, ['#0x100', 'cmp', '0x1000219f0', 'str']),
        'semantics': 'Cache initialize, then select same-generation writer under state lock; write outside lock. Failed write detaches only pointer-identical Arc and does not requeue that frame. Without selected writer, apply request replay rules. Mutex poison does not recover state.',
        'integrationStatus': 'Per-line composition tested with real TCP and write shutdown. Reader loop, lifecycle EOF cleanup, attach replay and manager integration remain incomplete.',
    },
    'stdoutReadLoop': {
        'implementation': 'native/browser-extension-host/src/app_server_output.rs::forward_lines',
        'buffer': evidence(stdout_forward, 0x100026c24, 0x100026c44, ['#0x2000']),
        'clearReadErrorAndEof': evidence(stdout_forward, 0x100026c84, 0x100026ca0, ['str', 'read_line', '0x100027258', '0x100027284']),
        'forwardBeforeWait': evidence(stdout_thread, 0x10002c974, 0x10002c990, ['forward_app_server_to_attached_client', 'wait_app_server_child']),
        'contract': 'Reuse a cleared String and 8192-byte BufReader; forward each successful nonzero read, including final unterminated line. Read/UTF-8 failure exits. Native thread waits for child only after forwarding and its cleanup return.',
        'integrationStatus': 'Real owned child stdout -> Rust line delivery -> TCP websocket frame tested. Reader returns errors to owner; native diagnostic logging and lifecycle EOF cleanup still pending.',
    },
    'stdoutCleanup': {
        'implementation': 'native/browser-extension-host/src/app_server_output.rs::{finish_output,forward_and_finish}',
        'generationGuard': evidence(stdout_forward, 0x1000272c0, 0x1000272cc, ['#0x108', '0x100027448']),
        'childAndInput': evidence(stdout_forward, 0x1000272d4, 0x100027314, ['#0xf8', 'Mutex<std::process::Child>', '#0x110']),
        'queueAndInitialize': evidence(stdout_forward, 0x100027314, 0x100027378, ['#0x30', '#0x38', '#0x50']),
        'runtimeAndWriter': evidence(stdout_forward, 0x100027378, 0x1000273b8, ['ProxyRuntimeState', '#0x100', 'Mutex>::unlock', 'close_websocket_writer']),
        'semantics': 'EOF and read failure converge on same-generation cleanup: child reference, stdin, pending requests, initialize response, runtime state, then take writer and close outside mutex. Generation unchanged.',
        'integrationStatus': 'Represented child/stdin/replay/writer cleanup composed with reader and tested on actual pipe/socket. ProxyRuntimeState representation and clearing remain open; this is not yet all native state fields.',
    },
    'proxyRuntimeState': {
        'implementation': 'native/browser-extension-host/src/app_server_runtime_state.rs',
        'fieldCloneOffsets': evidence(proxy_state, 0x10001b290, 0x10001b340, ['#0xc0', '#0xd8', '#0x48', '#0xf0', '#0x90', '#0x120', 'String as core::clone::Clone']),
        'darwinLiteral': evidence(proxy_state, 0x10001b358, 0x10001b36c, ['#0x6e69', '#0x6164', '#0x7772']),
        'configLayout': evidence(config_load, 0x10001ec30, 0x10001ecc4, ['#0x40', '#0x90', '#0xc0', '#0xd0', '#0xf0', '#0x120']),
        'mapping': {'0x48':'codexCliPath','0x90':'nodePath','0xc0':'browserClientPath','0xd8':'browserServicePath','0xf0':'codexHome','0x120':'nodeReplPath'},
        'semantics': 'Clones six configuration strings preserving optional absence, adds platform darwin. Browser service comes from selected/supplemented configuration; other paths use effective environment-resolved launch values. Does not include extension ID or proxy host/port.',
        'integrationStatus': 'Stored in output state and cleared by same-generation EOF cleanup. Process reuse comparison and lifecycle startup still pending.',
    },
    'processReuseAndStop': {
        'implementation': 'native/browser-extension-host/src/app_server_output.rs::{OutputState::can_reuse,stop_process}',
        'stdinAndRuntimePresence': evidence(process_start, 0x1000200ec, 0x100020104, ['#0x110', '#0x50', '0x100020148']),
        'optionalClient': evidence(process_start, 0x100020104, 0x100020148, ['#0x48', '#0x58', 'cmp']),
        'optionalService': evidence(process_start, 0x100020424, 0x10002045c, ['#0x60', '#0x70']),
        'cliAndHome': evidence(process_start, 0x100020538, 0x100020590, ['#0x10', '#0x78', '#0x88']),
        'nodeReplPlatform': evidence(process_start, 0x100020970, 0x100020a20, ['#0x28', '#0x90', '#0xa0', '#0x40', '0x100020234']),
        'stopStateClear': evidence(process_stop, 0x100020e58, 0x100020ef8, ['#0xf8', '#0x30', 'ProxyRuntimeState', '#0x110', '#0x108']),
        'stopUnlockCloseReap': evidence(process_stop, 0x100020f08, 0x100020f4c, ['Mutex>::unlock', 'close_websocket_writer', 'stop_app_server_child']),
        'semantics': 'Reuse requires stdin and all seven ProxyRuntimeState fields equal as strings/options, without child/writer presence or process health probe. Explicit stop clears resources and increments wrapping generation under lock, then closes writer and stops/reaps child outside state lock.',
        'integrationStatus': 'Reuse predicate and composed stop implemented/tested. ensure_started replacement/spawn/worker composition and manager control wiring remain open.',
    },
    'composedEnsureStarted': {
        'implementation': 'native/browser-extension-host/src/app_server_process.rs::ensure_started',
        'replacementBeforeSpawn': evidence(process_start, 0x1000201cc, 0x100020254, ['#0x110', 'close_websocket_writer', 'stop_app_server_child', '0x100020278', 'Mutex>::unlock']),
        'publishGeneration': evidence(process_start, 0x1000207d8, 0x100020828, ['#0x108', '#0x1', 'ProxyRuntimeState as core::clone::Clone']),
        'publishInputThenUnlock': evidence(process_start, 0x10002089c, 0x1000208d8, ['#0x110', '#0x108', 'Mutex>::unlock']),
        'spawnDetachedOutputWorker': evidence(process_start, 0x100020904, 0x100020938, ['spawn_unchecked', 'JoinHandle']),
        'semantics': 'Reuse exact state or clear old state under lock, close writer, stop child and spawn replacement while still locked. Increment generation only after successful spawn/pipe extraction, store child/runtime/stdin, unlock then detach forwarding worker. Worker cleans up before wait.',
        'integrationStatus': 'Composed lifecycle tested with real owned CLI reuse, configuration-triggered replacement, stop/reap and failed launch. Native spawn error decoration and complete control manager/handshake integration remain open.',
    },
    'spawnErrorDecoration': {
        'implementation': 'native/browser-extension-host/src/app_server_process.rs::spawn',
        'nativeFormattingBytes': raw[0x8d20b:0x8d236].hex(),
        'preserveKindAndFormat': evidence(process_start, 0x1000205f0, 0x10002063c, ['Error>::kind', '#0xd10', '#0x20b', 'format_inner', 'Error>::new']),
        'contract': 'Only Command::spawn error is wrapped as Failed to start Codex app-server with <original configured CLI>: <original error>, preserving ErrorKind but replacing OS payload with String. Path/home preparation errors propagate unwrapped.',
    },
    'clientFrameDecoder': {
        'implementation': 'native/browser-extension-host/src/app_server_websocket.rs::read_client_frame',
        'headerAndLengths': evidence(websocket_input, 0x100024ae8, 0x100024b84, ['default_read_exact', '#0xf', '#0x7f', '#0x7e', '#0x4000000', 'b.hi']),
        'maskAndPayload': evidence(websocket_input, 0x100024b84, 0x100024c0c, ['tbz', '#0x7', '#0x4', '__rust_alloc_zeroed', 'default_read_exact', 'eor']),
        'unmaskedError': raw[0x9000e:0x90033].decode(),
        'oversizeError': raw[0x90033:0x90062].decode(),
        'contract': 'Single frame: low nibble opcode, big-endian extended lengths, >64MiB rejected before mask and allocation, mandatory client mask, XOR modulo four. No FIN/RSV, UTF-8, canonical length or control-size validation in this decoder. Read errors propagate; outer input loop EOF handling remains separate.',
        'integrationStatus': 'Decoder tested for fragmented/coalesced reads, length boundaries, noncanonical encoding, arbitrary payload bytes, oversize/mask precedence and truncation. Opcode dispatch, stdin forwarding, prefixed handshake reader and full session composition remain open.',
    },
    'websocketInputForwarding': {
        'implementation': 'native/browser-extension-host/src/app_server_input.rs',
        'dispatch': evidence(websocket_input, 0x100024c0c, 0x100024ca8, ['#0x3', '#0x9', '#0xa', '#0x8', 'write_shared_websocket_frame']),
        'ensureAndWrite': evidence(websocket_input, 0x100024d9c, 0x100024e40, ['ensure_started', 'Mutex>::lock', 'ChildStdin as std::io::Write>::write_all', '#0x1', 'Mutex>::unlock']),
        'initializeMethodAndReplay': evidence(websocket_input, 0x100024e44, 0x100024f50, ['#0xa', '#0x6e69', '#0x7469', 'Vec<u8> as core::clone::Clone', 'write_shared_websocket_frame']),
        'closeEchoBestEffort': evidence(websocket_input, 0x100025058, 0x100025094, ['#0x8', 'write_shared_websocket_frame', 'drop_glue']),
        'writeFailureDropsStdin': evidence(websocket_input, 0x100025094, 0x1000250b8, ['#0x110', '#-0x1']),
        'contract': 'Opcodes 0/1/2 forward raw payload plus newline under state lock after ensure_started, except exact special initialize ID and initialize method replay cached response outside lock. Ping echoes pong, pong ignored, close echoes best effort and succeeds. Frame-read UnexpectedEof succeeds. Write errors clear stdin and propagate. No generation guard or JSON rejection added.',
        'integrationStatus': 'Tested with owned child stdin, raw binary/malformed JSON, appended newline, broken pipe, cached initialization, control frames and EOF. Handshake reader, manager and production control integration remain open.',
    },
    'httpInputAndPrefix': {
        'implementation': 'native/browser-extension-host/src/app_server_http.rs',
        'chunkAndLimit': evidence(http_input, 0x100022dd4, 0x100022e30, ['#0x1000', '#0x10, lsl #12', 'TcpStream as std::io::Read', 'b.hi']),
        'delimiterBeforeLimit': evidence(http_input, 0x100022e54, 0x100022e8c, ['#0x4', '0x100022e04', '0x100022fc0']),
        'prefixThenSocket': evidence(prefixed_reader, 0x10002b0dc, 0x10002b15c, ['#0x10', '#0x18', '#0x20', 'csel', 'TcpStream as std::io::Read']),
        'eofMessage': raw[0x906e6:0x90715].decode(),
        'limitMessage': raw[0x90715:0x90730].decode(),
        'contract': '4096-byte reads, first CRLFCRLF delimiter before >65536 check. Preserve remaining bytes, consume prefix before TCP reads without joining both in one Read call. HTTP read errors propagate; read_exact handles partial prefix/socket reads.',
        'integrationStatus': 'Header byte collection and prefixed TCP reader tested with split delimiters, native boundary order and a frame split across handshake overread and a real socket. HTTP parsing/authentication/upgrade and full connection handler remain open.',
    },
    'httpRequestParser': {
        'implementation': 'native/browser-extension-host/src/app_server_http.rs::read_request/request_query_param',
        'lossyUtf8': evidence(http_input, 0x100022fc0, 0x100022fd8, ['from_utf8_lossy']),
        'requestTokens': evidence(http_input, 0x100022f54, 0x100022f88, ['SplitInternal', 'IsWhitespace']),
        'secondToken': evidence(http_input, 0x1000230dc, 0x1000230f0, ['IsWhitespace', '0x100023194']),
        'headerColonAndTrim': evidence(http_input, 0x1000232dc, 0x100023360, ['#0x3a', 'CharSearcher', 'trim_matches']),
        'asciiLowercaseAndValue': evidence(http_input, 0x1000234c0, 0x100023504, ['#0x41', '#0x1a', 'orr', 'trim_matches']),
        'lastDuplicateWins': evidence(http_input, 0x100023550, 0x100023594, ['HashMap', 'insert', '__rust_dealloc']),
        'querySeparators': evidence(query_param, 0x100021820, 0x100021874, ['#0x3f', '#0x26', '#0x3d']),
        'queryKeyComparison': evidence(query_param, 0x1000218e4, 0x100021950, ['CharSearcher', 'cmp', '0x10002187c']),
        'contract': 'Lossy UTF8 before CRLF split; first two Unicode-whitespace tokens required, no HTTP version validation. Ignore header lines without colon, split first colon, trim both sides, lowercase ASCII name and retain last duplicate. Query returns first exact key with equals, no URL decoding or fragment treatment.',
        'integrationStatus': 'Parser composed with header collector and tested. Token checking, request routing, upgrade and connection manager remain open.',
    },
    'httpUpgradeGate': {
        'implementation': 'native/browser-extension-host/src/app_server_http.rs::validate_upgrade',
        'tokenFirst': evidence(http_input, 0x1000235fc, 0x100023644, ['request_query_param', 'cmp', '0x1000236a0', 'write_plain_response']),
        'optionalOrigin': evidence(http_input, 0x1000236a0, 0x1000236c8, ['cbz', '0x1000237a4', '#0x934']),
        'receivedOriginTrailingSlash': evidence(http_input, 0x100023780, 0x1000237a4, ['#0x2f', 'trim_end_matches', '0x10002362c']),
        'exactGet': evidence(http_input, 0x1000237a4, 0x1000237c8, ['#0x3', '#0x4547', '#0x54']),
        'connectionTokens': evidence(http_input, 0x100023930, 0x1000239e0, ['#0x2c', 'trim_matches', '#0x7', '#0x75']),
        'upgradeValue': evidence(http_input, 0x100023b80, 0x100023bac, ['#0x9', '#0x41', '#0x1a', '#0x77']),
        'keyPresence': evidence(http_input, 0x100023ca0, 0x100023cb8, ['#0x7aa', '#0x11', 'contains_key']),
        'contract': 'Token query comparison first; optional expected origin requires origin header, trims only received trailing slashes and compares exact. Then GET, comma-separated connection upgrade token (trim/case-insensitive), exact case-insensitive websocket Upgrade value and presence of sec-websocket-key. Auth failures 403; shape failures 404. No path/version or key base64 checks at this gate.',
        'integrationStatus': 'Validation against parsed requests tested; upstream expected-origin construction, rejection writes, upgrade response and production handler remain open.',
    },
    'httpRejectionResponse': {
        'implementation': 'native/browser-extension-host/src/app_server_http.rs::write_rejection/read_validated_request',
        'formatBytes': raw[0x8d3d2:0x8d401].hex(),
        'contentType': raw[0x907d3:0x907f8].decode(),
        'statusFormatting': evidence(plain_response, 0x100021b60, 0x100021b98, ['#0xd', '#0x3d2', 'core::fmt::write']),
        'bodyLength': evidence(plain_response, 0x100021bcc, 0x100021c04, ['#0x9', '#0x3e1', 'core::fmt::write']),
        'blankLineThenBody': evidence(plain_response, 0x100021d54, 0x100021d84, ['#0x730', '#0x2', '#0x9', 'write_all']),
        'contract': 'HTTP/1.1 status CRLF, Content-Length CRLF, Content-Type: text/plain; charset=utf-8 CRLF, blank line, body. Both native rejection statuses have 13-byte status strings and 9-byte bodies. Write errors propagate; no explicit flush or shutdown.',
        'integrationStatus': 'Read/parse/auth/shape checks now compose into a TCP rejection path. Exact bytes and short-write/error propagation tested. Successful 101 upgrade, connection attachment, manager and production listener remain open.',
    },
    'websocketUpgradeResponse': {
        'implementation': 'native/browser-extension-host/src/app_server_http.rs::websocket_accept/write_upgrade',
        'ensureBeforeResponse': evidence(proxy_upgrade, 0x100027a80, 0x100027aa0, ['ensure_started']),
        'sha1Dependency': evidence(proxy_upgrade, 0x100027b88, 0x100027ba0, ['sha1::compress::compress']),
        'guid': raw[0x90775:0x90799].decode(),
        'base64Digest': evidence(proxy_upgrade, 0x100027d50, 0x100027d6c, ['#0x14', 'base64::engine::Engine::encode']),
        'responseLines': [raw[a:b].decode() for a,b in [(0x90b8a,0x90baa),(0x90baa,0x90bbc),(0x90bbc,0x90bcf)]],
        'joinAndWrite': evidence(proxy_upgrade, 0x100027ddc, 0x100027e20, ['#0x730', '#0x5', '#0x2', 'join_generic_copy', 'write_all']),
        'contract': 'Hash raw key bytes followed by GUID using SHA-1, standard base64 encode 20-byte digest; join status/Upgrade/Connection/Accept/CRLF lines with CRLF, write_all once. Process ensure precedes handshake; attach follows write success.',
        'dependencyNote': 'Original sha1 crate and base64 symbols observed. Reconstruction pins sha1 0.10.6; original sha1 crate version has not been established.',
        'integrationStatus': 'Response and independent accept vectors tested. Session manager/process selection and attach ordering still need composition before successful production handshake.',
    },
    'attachedSession': {
        'implementation': 'native/browser-extension-host/src/app_server_session.rs',
        'swapAndTakePending': evidence(proxy_upgrade, 0x100027fb4, 0x100028004, ['#0xf0', '#0x10', '#0x20', 'Mutex>::unlock']),
        'closeOldAfterUnlock': evidence(proxy_upgrade, 0x100028018, 0x100028048, ['close_websocket_writer']),
        'replayRequests': evidence(proxy_upgrade, 0x10002807c, 0x1000280e8, ['#0x1', 'write_shared_websocket_frame', 'IntoIter', '0x100027f9c']),
        'inputThenDetach': evidence(proxy_upgrade, 0x100028150, 0x100028180, ['forward_websocket_to_app_server', 'detach_client_writer']),
        'contract': 'After ensure/101/try_clone: replace writer and take pending queue under lock, close old outside lock, replay queued requests. Replay failure drops remainder without detaching stored writer. After successful replay run prefixed input and detach by writer identity on return; retain persistent child.',
        'integrationStatus': 'Single-process session composed and tested with authenticated real loopback HTTP plus coalesced first frame, owned CLI echo and close/detach preserving child. Process-map selection, manager control and production listener integration remain open.',
    },
    'persistentProcessMap': {
        'implementation': 'native/browser-extension-host/src/app_server_process_map.rs',
        'parameter': raw[0x90d98:0x90da0].decode(),
        'fallback': raw[0x9017a:0x90181].decode(),
        'emptyOrAbsent': evidence(proxy_upgrade, 0x1000277b4, 0x1000277e0, ['request_query_param', '#0x0', '#0x7', 'csel']),
        'entryUnderLock': evidence(proxy_upgrade, 0x100027938, 0x10002795c, ['rustc_entry']),
        'cloneUnlockEnsure': evidence(proxy_upgrade, 0x100027a4c, 0x100027a98, ['ldadd', 'Mutex>::unlock', 'ensure_started']),
        'contract': 'First raw clientId query value unless empty/absent then default. Exact case-sensitive map key. Create default shared process state or clone existing under map lock; unlock before ensure/handshake. No disconnect eviction.',
        'integrationStatus': 'Map selection and authenticated connection handler composed; concurrent same-key identity and real TCP/owned CLI echo tested. Proxy listener and manager/control lifecycle remain open.',
    },
    'connectionRuntimeSnapshot': {
        'implementation': 'native/browser-extension-host/src/app_server_process_map.rs::handle_shared_connection and runtime-specific session/input/process entry points',
        'snapshotAfterValidation': evidence(http_input, 0x100023cb0, 0x100023cf0, ['contains_key', 'Mutex', 'expect', 'ProxyRuntimeState as core::clone::Clone', 'drop_glue']),
        'poisonMessage': raw[0x905d5:0x905fa].decode(),
        'contract': 'After request validation, clone shared ProxyRuntimeState under mutex then unlock before map selection/ensure. Native expect panics on poison. A session keeps this snapshot for initial ensure and subsequent input, rather than retaining registry configuration or rereading global state per frame.',
        'integrationStatus': 'Runtime-specific process/input/session entry points implemented; old config entry points project once as adapters. Authenticated real TCP session test uses shared snapshot handler. Listener, manager updates and complete production integration remain open.',
    },
    'proxyListenerDispatch': {
        'implementation': 'native/browser-extension-host/src/app_server_listener.rs',
        'acceptErrorContinue': evidence(proxy_listener, 0x100021558, 0x100021588, ['drop_glue', 'Incoming', '0x100021558']),
        'detachEachWorker': evidence(proxy_listener, 0x1000215e4, 0x100021620, ['spawn_unchecked', 'JoinHandle', '0x100021560']),
        'originSnapshot': evidence(connection_worker, 0x10002cbcc, 0x10002cc38, ['String as core::clone::Clone', 'Mutex>::unlock', 'handle_proxy_connection']),
        'errorDiagnostic': evidence(connection_worker, 0x10002cc38, 0x10002cc6c, ['#0x6ee', '_eprint', 'drop_glue']),
        'originPoisonMessage': raw[0x91020:0x9104e].decode(),
        'contract': 'Blocking Incoming loop ignores accept errors and starts detached thread per accepted stream. Worker snapshots shared optional origin before handler reads request, while handler snapshots shared runtime after validation; connection errors log to stderr.',
        'integrationStatus': 'Dispatcher tested with injected accept failure and two real TCP connections, proving an idle first connection does not delay a forbidden second request or create process entries. Binding/token construction and manager lifecycle wiring remain open.',
    },
    'proxyPreparation': {
        'implementation': 'native/browser-extension-host/src/app_server_proxy.rs',
        'bindAndRetry': evidence(manager_ensure, 0x100017b50, 0x100017c04, ['TcpListener>::bind', 'cbz', '_eprint', 'strh\twzr']),
        'readActualPort': evidence(manager_ensure, 0x100017f64, 0x100017ff8, ['local_addr', 'proxy_runtime_state']),
        'twoUuidToken': evidence(manager_ensure, 0x1000180f0, 0x100018134, ['Uuid>::new_v4', '#0x72c', '#0x400', 'format_inner']),
        'originFormat': evidence(manager_ensure, 0x100018134, 0x100018174, ['#0x108', '#0x238', 'format_inner']),
        'contract': 'Bind configured host/port; any error with nonzero port logs and retries same host at zero. Read actual local port. Token is concatenation of two simple UUIDv4 strings. Optional extension ID formats chrome-extension://<id>. Initialize shared runtime and empty process map.',
        'integrationStatus': 'Preparation and bind failures tested using owned occupied loopback port and nonlocal numeric address. Thread/manager ownership, session ID, returned endpoint and shutdown remain open.',
    },
    'proxyStartOwnership': {
        'implementation': 'native/browser-extension-host/src/app_server_proxy.rs::PreparedProxy::start',
        'newSessionId': evidence(manager_ensure, 0x100018300, 0x100018344, ['Uuid>::new_v4', 'Uuid as core::fmt::Display']),
        'spawnDetach': evidence(manager_ensure, 0x100018424, 0x100018464, ['spawn_unchecked', 'JoinHandle']),
        'dropFieldsOnly': evidence(proxy_drop, 0x1000153cc, 0x100015478, ['Option<alloc::string::String>', 'HashMap', 'Mutex<alloc::string::String>', 'ProxyRuntimeState', '__rust_dealloc']),
        'contract': 'Create separate hyphenated UUIDv4 runtime session ID in shared String mutex, move listener into detached thread with cloned token/origin/runtime/process map, retain proxy handle. Proxy field Drop does not stop or join listener.',
        'integrationStatus': 'Live listener serves real TCP rejections before and after handle drop inside isolated test executable. Manager shutdown/reuse/update semantics and production control wiring remain open.',
    },
    'remainingUnknowns': ['process launch contract and runtime integration', 'complete hello response schema and status lifecycle integration',
        'filename sanitization edge cases', 'asset cleanup on all process/session failures', 'authorization at control entry',
        'error codes and full websocket proxy behavior'],
    'limits': 'Static analysis, not native source recovery or runtime parity. No original host, browser, app-server, file opener or network request was executed.',
}
print(json.dumps(result, indent=2))
