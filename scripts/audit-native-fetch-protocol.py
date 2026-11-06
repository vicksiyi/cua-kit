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
auth = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x100271524','--stop-address=0x10027192c',str(artifact)], text=True)
predicate = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10023a7e0','--stop-address=0x10023aa2c',str(artifact)], text=True)
for expected in ['100271554:', '>::retain', '100271590:', '1002715a4:',
                 '1002716c8:', '1002716d0:', '1002716d4:', '100271750:']:
    assert expected in auth, expected
for expected in ['10023a934:', '#0x41', '10023a938:', '#0x1a',
                 '10023a950:', '10023a958:', '10023a960:', '10023a9fc:', 'cset']:
    assert expected in predicate, expected
header_literals = {name: read(address,length).decode() for name,address,length in [
    ('authorization',0x100a4a022,13), ('originator',0x100a4a194,10),
    ('originatorValue',0x100a4a19e,17), ('account',0x100a4a1af,18),
    ('bearerPrefix',0x100b34f93,7)]}
assert header_literals == {'authorization':'authorization', 'originator':'originator',
    'originatorValue':'codex_browser_use', 'account':'ChatGPT-Account-ID', 'bearerPrefix':'Bearer '}
send = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10026cca4','--stop-address=0x10026dae0',str(artifact)], text=True)
for expected in ['10026cd60:', 'Client>::request', '10026ce28:', 'RequestBuilder>::header',
                 '10026cee4:', 'RequestBuilder>::send', '10026cfa0:', 'Response>::content_length',
                 '10026cfac:', '10026d4ec:', '#0xa00, lsl #12', '10026d69c:', 'StatusCode>::canonical_reason',
                 '10026d730:', 'base64::engine::Engine::encode']:
    assert expected in send, expected
send_literals = {key: read(address,length).decode() for key,address,length in [
    ('tooLarge',0x100a49e36,36),('requestFailed',0x100a49c87,29),
    ('readFailed',0x100a49ca4,35),('header',0x100a49dba,12)]}
assert send_literals == {'tooLarge':'nodeRepl.fetch response is too large',
    'requestFailed':'nodeRepl.fetch request failed','readFailed':'nodeRepl.fetch response read failed',
    'header':'content-type'}
client_init = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10026e900','--stop-address=0x10026ebdc',str(artifact)], text=True)
client_build = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1005e6a9c','--stop-address=0x1005e9a2c',str(artifact)], text=True)
for expected in ['10026e994:', '0x1005eb690', '10026e9ac:', '0x1005e9acc',
                 '10026e9b0:', '#0x1e', '10026e9c0:', '0x1005e6a9c']:
    assert expected in client_init, expected
for expected in ['1005e8cc8:', '0x100d24000', '1005e8ccc:', '#0x7f8', '1005e8cdc:']:
    assert expected in client_build, expected
path_pointer, path_length, source_line, source_column = struct.unpack('<QQII',read(0x100d247f8,24))
reqwest_source = read(path_pointer,path_length).decode()
assert reqwest_source.endswith('/reqwest-0.12.28/src/async_impl/client.rs')
assert (source_line, source_column) == (434,25)
client_init_error = read(0x100a49d68,47).decode()
redirect_dispatch = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1005ecde8','--stop-address=0x1005ecf20',str(artifact)], text=True)
for expected in ['1005ecdf0:', '1005ece44', '1005ecdf4:', '#0x1',
                 '1005ecdf8:', '1005ececc', '1005eced4:']:
    assert expected in redirect_dispatch, expected
print(json.dumps({
    'artifact': str(artifact), 'sha256': sha,
    'function': 'node_repl::authenticated_fetch::outbound_passthrough_request',
    'range': ['0x1002712b8','0x100271524'],
    'dependencies': {'http':'1.4.0','base64':'0.22.1','url':'2.5.8','reqwest':'0.12.28'},
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
    'authenticatedHeaders': {
        'range': ['0x100271524','0x10027192c'],
        'predicateRange': ['0x10023a7e0','0x10023aa2c'],
        'instructionTextSha256': hashlib.sha256(auth.encode()).hexdigest(),
        'predicateInstructionTextSha256': hashlib.sha256(predicate.encode()).hexdigest(),
        'literals': header_literals,
        'reviewedBehavior': [
            'retain predicate lowercases ASCII A-Z in a temporary name copy; exact authorization, originator, chatgpt-account-id matches are removed',
            '0x100271590: auth struct first String formatted by String Display at 0x100275f6c, using Bearer prefix',
            'append authorization then originator; preserve other headers and non-header request fields',
            '0x1002716c8..0x100271750: optional account String at auth offset 0x18; None omitted, Some including empty moved to final header'
        ],
        'limits': 'Static instruction review only. FetchCredentials models consumed fields, not the complete original auth DTO. No credential provider or original runtime differential execution.'
    },
    'responseProjection': {
        'function': 'ReqwestHttpClient::send async body',
        'range': ['0x10026cca4','0x10026dae0'],
        'instructionTextSha256': hashlib.sha256(send.encode()).hexdigest(),
        'literals': send_literals,
        'reviewedBehavior': [
            '0x10026cfac and 0x10026d4ec: declared content length and collected body length reject strictly greater than 0xa00000',
            '0x10026d064..0x10026d268 and 0x10026d774: get first content-type, permit HTAB/printable ASCII, expose only that header, retain empty value',
            '0x10026d694..0x10026d770: canonical status reason or empty string and standard-base64 body, without status error conversion'
        ],
        'limits': 'Response shaping and explicit-client reqwest sending implemented. Called version established in clientInitialization; client configuration and full TLS/decompression behavior remain under review.'
    },
    'clientInitialization': {
        'range': ['0x10026e900','0x10026ebdc'],
        'instructionTextSha256': hashlib.sha256(client_init.encode()).hexdigest(),
        'reqwestVersion': '0.12.28',
        'versionEvidence': {
            'call': '0x10026e9c0 -> ClientBuilder::build at 0x1005e6a9c',
            'panicLocationReference': '0x1005e8cc8..0x1005e8cdc -> 0x100d247f8',
            'source': reqwest_source, 'line': source_line, 'column': source_column
        },
        'observations': [
            'runtime mode is parsed before constructing CodexAppServerAuthProvider',
            'ClientBuilder::default followed by explicit no-follow redirect policy: discriminant 0 invokes custom, 1 checks limit, 2 returns Stop at 0x1005ececc',
            'writes 30 seconds and zero nanoseconds at builder offsets 0x310/0x318 before build; copied to ClientRef 0x1c8/0x1d0 and consumed by request sleep at 0x1005eaea0'
        ],
        'buildError': client_init_error,
        'upstreamReferences': [
            'https://raw.githubusercontent.com/seanmonstar/reqwest/v0.12.28/src/async_impl/client.rs',
            'https://raw.githubusercontent.com/seanmonstar/reqwest/v0.12.28/src/redirect.rs'
        ],
        'limits': 'Version is tied to the called build function, not merely a binary string hit. Redirect no-follow behavior confirmed by dispatch branch. Duration is consumed by request sleep; full timeout lifecycle and TLS/decompression compiled features remain under review. No default production client has been wired.'
    },
    'implementation': 'native/runtime-supervisor/src/authenticated_fetch.rs',
    'limits': 'Static reconstruction, no original execution. URL routing and authenticated header shaping are reconstructed; app-server integration and production client construction remain unimplemented; explicit-client HTTP send has local fixture coverage. No production handler is wired to this constructor. The client initialization call and panic source location establish reqwest 0.12.28; configuration and deployment integration remain incomplete.'
},indent=2))
