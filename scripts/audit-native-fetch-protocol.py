#!/usr/bin/env python3
"""Static, version-pinned native fetch evidence; never executes the vendor host."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

artifact = Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl')
raw = artifact.read_bytes()
sha = hashlib.sha256(raw).hexdigest()
assert sha == '44d08fb5c7346c53c869a9853c93090b3c10457950c2861ce8bdc4baabab5632', 'Re-audit changed artifact'
for crate in ['http-1.4.0','base64-0.22.1','url-2.5.8']:
    assert ('/' + crate + '/').encode() in raw, crate
segments = []
offset = 32
for _ in range(struct.unpack_from('<I', raw, 16)[0]):
    command, size = struct.unpack_from('<II', raw, offset)
    if command == 25:
        segments.append(struct.unpack_from('<QQQQ', raw, offset + 24))
    offset += size

def read(address, length):
    for vm, vm_size, file_offset, file_size in segments:
        if vm <= address and address + length <= vm + min(vm_size, file_size):
            offset = file_offset + address - vm
            return raw[offset:offset+length]
    raise RuntimeError('Unmapped static address')

method_error = read(0x100a49dc6,32).decode()
body_error = read(0x100a49c58,30).decode()
assert method_error == 'nodeRepl.fetch method is invalid'
assert body_error == 'nodeRepl.fetch body is invalid'
alphabet = read(0x100a49e5d,64).decode()
assert alphabet == 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
assembly = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1002712b8','--stop-address=0x100271524',str(artifact)], text=True)
for expected in ['1002712ec:', 'http::method::Method>::from_bytes',
                 '100271324:', 'base64::engine::Engine::decode',
                 '1002713b8:', 'FetchHeader> as core::clone::Clone>::clone',
                 '10027135c:', '#0xdc6', '100271430:', '#0xc58']:
    assert expected in assembly, expected
routing = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1002706f0','--stop-address=0x1002712b8',str(artifact)], text=True)
for expected in ['100270734:', 'url::ParseOptions>::parse', '100270774:',
                 '10027083c:', 'url::Url>::username', '100270848:', 'url::Url>::password',
                 '1002708b4:', 'url::Url>::host_str', '1002708c4:', 'url::Url>::path',
                 '100270a98:', '100270f10:', '100271038:', '1002710a4:',
                 '10027115c:', '1002711bc:', '100271220:']:
    assert expected in routing, expected
route_errors = {name: read(address,length).decode() for name,address,length in [
    ('url',0x100a49d9d,29),('gaasDestination',0x100a4a0a7,70),
    ('headers',0x100a4a12c,59),('method',0x100a4a167,45),('body',0x100a4a0f2,58)]}
assert route_errors == {
    'url':'nodeRepl.fetch URL is invalid',
    'gaasDestination':'nodeRepl.fetch destination is not allowed in gaas-browser runtime mode',
    'headers':'nodeRepl.fetch does not allow caller headers for this route',
    'method':'nodeRepl.fetch only allows GET for this route',
    'body':'nodeRepl.fetch does not allow caller bodies for this route'}
print(json.dumps({
    'artifact': str(artifact), 'sha256': sha,
    'function': 'node_repl::authenticated_fetch::outbound_passthrough_request',
    'range': ['0x1002712b8','0x100271524'],
    'dependencies': {'http':'1.4.0','base64':'0.22.1','url':'2.5.8'},
    'steps': ['http::Method::from_bytes at 0x1002712ec',
              'optional body decoded at 0x100271324; absent -> empty vector at 0x100271394',
              'header vector clone at 0x1002713b8',
              'move already-resolved URL and method/body/header fields into output'],
    'methodError': method_error, 'bodyError': body_error,
    'base64Alphabet': alphabet,
    'base64ConfigurationBytes': list(read(0x100a49e5a,3)),
    'routing': {
        'function': 'resolved_request', 'range': ['0x1002706f0','0x1002712b8'],
        'instructionTextSha256': hashlib.sha256(routing.encode()).hexdigest(),
        'diagnostics': route_errors,
        'reviewedBranches': {
            'modeGate': '0x100270774: nonzero mode performs restrictive gaas destination check before common routing',
            'gaasHostPathComparisons': '0x1002708b0..0x100270cc0 and 0x100271124..0x100271158: exact hosts/paths, ab /v1/ prefix, ASCII POST checks',
            'commonAuthority': '0x100270cd4..0x100270e50: HTTPS, chatgpt.com (staging only in gaas), no explicit nondefault port or userinfo',
            'postExceptions': '0x100270e54..0x100270f94: /ces/v1/rgstr and /backend-api/flora/browser/redeem-otp, case-insensitive POST',
            'getRestrictions': '0x100271038..0x1002711b0: GET then empty headers then absent/empty encoded body',
            'variant': '0x1002711bc and 0x100271220: gaas passthrough tag 1, default authenticated tag 0; caller dispatch reviewed at 0x10026c410..0x10026c5c4'
        },
        'limits': 'Branches manually reviewed from pinned instructions; audit checks addresses/literals, not an independent semantic equivalence proof. URL parsing uses evidenced url crate.'
    },
    'implementation': 'native/runtime-supervisor/src/authenticated_fetch.rs',
    'limits': 'Static reconstruction, no original execution. URL routing is reconstructed; authenticated headers, app-server integration and HTTP send remain unimplemented. No production handler is wired to this constructor. Binary symbols also evidence ReqwestHttpClient, but original reqwest version selection is not established by these instructions.'
},indent=2))
