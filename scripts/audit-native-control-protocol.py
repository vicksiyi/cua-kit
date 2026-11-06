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
    'remainingUnknowns': ['full manifest selection and process launch contract', 'complete hello/status response schemas',
        'filename sanitization edge cases', 'asset cleanup on all process/session failures', 'authorization at control entry',
        'error codes and full websocket proxy behavior'],
    'limits': 'Static analysis, not native source recovery or runtime parity. No original host, browser, app-server, file opener or network request was executed.',
}
print(json.dumps(result, indent=2))
