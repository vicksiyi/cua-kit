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
for expected in ['1005e6ac8:', '#0x68', '1005e78e8:', '#0x3ef',
                 '1005e7930:', 'TrustAnchor', '1005e7934:', '#0x3f0',
                 '1005e7940:', 'rustls_native_certs::load_native_certs']:
    assert expected in client_build, expected
client_default = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1005e64cc','--stop-address=0x1005e6838',str(artifact)], text=True)
for expected in ['1005e6784:', '#0x1010101', '1005e6788:', '#0x384', '1005e678c:', '#0x388']:
    assert expected in client_default, expected
redirect_dispatch = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1005ecde8','--stop-address=0x1005ecf20',str(artifact)], text=True)
for expected in ['1005ecdf0:', '1005ece44', '1005ecdf4:', '#0x1',
                 '1005ecdf8:', '1005ececc', '1005eced4:']:
    assert expected in redirect_dispatch, expected
dispatch = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10026bf48','--stop-address=0x10026ca94',str(artifact)], text=True)
for expected in ['10026c048:', 'resolved_request', '10026c410:', '10026c49c:',
                 '10026c5b8:', '10026c6cc:', '10026c74c:', '#0x191',
                 '10026c7ac:', '10026c0f8:', '10026c1d0:', '10026c218:']:
    assert expected in dispatch, expected
vtable = struct.unpack('<QQQQQ',read(0x100cfb970,40))
assert vtable[3:] == (0x10022bb10,0x10022bb84)
claim_helper = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10022b524','--stop-address=0x10022b77c',str(artifact)], text=True)
for expected in ['10022b570:', '10022b57c:', 'SplitInternal<char>>::next',
                 '10022b59c:', 'base64::engine::Engine::decode',
                 '10022b5c0:', 'serde_json::de::from_trait', '10022b620:',
                 '10022b634:', '10022b640:', '10022b71c:']:
    assert expected in claim_helper, expected
claim_namespace = read(0x100a48a0a,27).decode()
assert claim_namespace == 'https://api.openai.com/auth'
claim_engine = list(read(0x100a4888e,3))
assert claim_engine == [0,0,2]
assert read(0x100a48891,64).decode() == 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
access_token_fetcher = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10022837c','--stop-address=0x100229bd0',str(artifact)], text=True)
fetch_auth_provider = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1002272ac','--stop-address=0x10022753c',str(artifact)], text=True)
provider_methods = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10022bb10','--stop-address=0x10022bbfc',str(artifact)], text=True)
auth_status_literals = {key:read(address,length).decode() for key,address,length in [
    ('method',0x100a4866f,13), ('includeToken',0x100a489d1,12),
    ('refreshToken',0x100a489dd,12), ('tokenField',0x100a4867c,9),
    ('methodField',0x100a48685,10), ('missingToken',0x100a48538,31),
    ('missingMethod',0x100a4868f,32), ('unsupportedPrefix',0x100b342c2,31),
    ('accountClaim',0x100a489f8,18), ('userClaim',0x100a489e9,15)]}
assert auth_status_literals == {
    'method':'getAuthStatus','includeToken':'includeToken','refreshToken':'refreshToken',
    'tokenField':'authToken','methodField':'authMethod',
    'missingToken':'Codex auth token is unavailable','missingMethod':'Codex auth method is unavailable',
    'unsupportedPrefix':'unsupported Codex auth method: ',
    'accountClaim':'chatgpt_account_id','userClaim':'chatgpt_user_id'}
for expected in ['10022844c:', '#0x101', '100228584:', '100228654:',
                 '100229298:', '1002292a4:', '1002292b0:', '10022937c:',
                 '100229394:', '#0x7', '1002293a4:', '#0x6863',
                 '1002293a8:', '#0x7461', '1002293b0:', '#0x6774',
                 '1002293b4:', '#0x7470', '1002293bc:']:
    assert expected in access_token_fetcher, expected
for expected in ['1002272ec:', '100227308:', '100227380:', '10022738c:', '1002273a8:', '1002273c4:', '1002273f4:', '1002273f8:', '100227404:', 'chatgpt_auth_claim_from_token', 'diagnostics::set_sentry_user']:
    assert expected in fetch_auth_provider, expected
for expected in ['10022bb24:', 'strh\twzr', '10022bb98:', '#0x100', '10022bb9c:']:
    assert expected in provider_methods, expected
app_server_spawn = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1002bada8','--stop-address=0x1002bb388',str(artifact)], text=True)
stdio_variants = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1008bcd58','--stop-address=0x1008bce90',str(artifact)], text=True)
child_build = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x100867cf0','--stop-address=0x100867e20',str(artifact)], text=True)
spawn_literals = {key:read(address,length).decode() for key,address,length in [
    ('subcommand',0x100a4d851,10),('modeError',0x100a4d85b,60),
    ('cliEnv',0x100a4d8fd,14),('listenFlag',0x100a4db98,8),('listenValue',0x100a4dba0,8),
    ('stdinError',0x100a4cfe6,37),('stdoutError',0x100a4cfc0,38),
    ('spawnErrorPrefix',0x100b359c9,34),('nullDevice',0x100b531dc,9)]}
assert spawn_literals == {
    'subcommand':'app-server','modeError':'Codex app-server is unavailable in gaas-browser runtime mode',
    'cliEnv':'CODEX_CLI_PATH','listenFlag':'--listen','listenValue':'stdio://',
    'stdinError':'codex app-server stdin is unavailable','stdoutError':'codex app-server stdout is unavailable',
    'spawnErrorPrefix':'failed to start codex app-server: ', 'nullDevice':'/dev/null'}
for expected in ['1002badc8:', 'NodeReplRuntimeMode>::from_process_env', '1002bae00:',
    '1002bae60:', 'std::env::_var', '1002bae70:', '1002bae8c:', '#0x78', '#0x6f63', '#0x6564',
    '1002baf74:', '1002baf88:', '1002baf9c:', '1002bafa4:', '1002bafb0:',
    '1002bafc0:', '1002bafc8:', '1002bb1f0:', '#0x2000']:
    assert expected in app_server_spawn, expected
for expected in ['1008bcd74:', '1008bcdc8:', '1008bcdd0:', 'std::sys::pipe::unix::pipe',
    '1008bcdf4:', '1008bce14:', '1008bce20:', 'File>::open_c']:
    assert expected in stdio_variants, expected
for expected in ['100867d74:', '#0xc8', '100867dcc:', '#0x88']:
    assert expected in child_build, expected
rpc_send = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x10022753c','--stop-address=0x100228224',str(artifact)], text=True)
rpc_error = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x1002bd4d0','--stop-address=0x1002bd5b0',str(artifact)], text=True)
def format_prefix(address):
    return read(address+1,read(address,1)[0]).decode()
rpc_errors = {key:format_prefix(address) for key,address in [
    ('serialize',0x100b31e56),('write',0x100b31f68),('newline',0x100b31e87),
    ('timeout',0x100b31eb4),('read',0x100b31ee4),('eof',0x100b31f11),
    ('json',0x100b31f3d),('rejected',0x100b35a64)]}
assert rpc_errors == {
    'serialize':'failed to serialize codex app-server request: ',
    'write':'failed to write codex app-server request: ',
    'newline':'failed to flush codex app-server request: ',
    'timeout':'timed out waiting for ', 'read':'failed to read codex app-server response: ',
    'eof':'codex app-server exited before returning ', 'json':'codex app-server returned invalid JSON: ',
    'rejected':'codex app-server rejected '}
assert read(0x100a48507,1)==b'\n'
for expected in ['10022759c:', '1002275a0:', '1002275a4:', '1002275b8:', '<usize>::_fmt',
    '100227838:', '100227840:', '100227958:', '10022799c:', '100227a48:',
    '100227e24:', '#0x1e', '100227ea4:', 'Lines<', '100227ef0:',
    '100227f04:', '100227f54:', '100227f78:', '100227f98:',
    '1002280d8:', '1002280e4:', '100228108:', '100228148:']:
    assert expected in rpc_send, expected
for expected in ['1002bd504:', '1002bd510:', '1002bd530:', '1002bd5a0:']:
    assert expected in rpc_error, expected
initialize_literals = {key:read(address,length).decode() for key,address,length in [
    ('capabilities',0x100a485c0,12),('experimentalApi',0x100a485cc,15),
    ('optOut',0x100a485db,25),('clientInfo',0x100a485f4,10),
    ('name',0x100a485fe,17),('title',0x100a4860f,17),('method',0x100a48624,10)]}
assert initialize_literals == {'capabilities':'capabilities','experimentalApi':'experimentalApi',
    'optOut':'optOutNotificationMethods','clientInfo':'clientInfo','name':'codex-browser-use',
    'title':'Codex Browser Use','method':'initialize'}
for expected in ['100228894:', '10022896c:', '#0x101', '100228b94:', '100228ba0:',
    '100228d44:', '100228e40:', '100228f2c:', '100228f30:', '100228f38:', '100228f3c:',
    '100228f64:', '#0x30', '100228f6c:', '#0x2e30', '100228f70:', '#0x2e31',
    '100229154:', '1002291cc:', '1002291d4:', '10022947c:',
    '1002294d8:', '100229508:', '0x1002289d4', '100228a14:']:
    assert expected in access_token_fetcher, expected
runtime_parser = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--demangle',
    '--start-address=0x100292658','--stop-address=0x1002927e8',str(artifact)], text=True)
assert read(0x100a4b36b,22)==b'NODE_REPL_RUNTIME_MODE'
assert read(0x100b35597,25)==b'\x0cunsupported \xc0\x08 value: \xc0\x00'
for expected in ['100292680:', 'std::env::_var_os', '100292694:', '100292698:',
    '1002926c8:', '1002926d8:', 'from_utf8_lossy', '100292744:', '100292754:', '10029278c:']:
    assert expected in runtime_parser, expected
for expected in ['1002286d4:', '1002286f8:', '100228798:', 'Semaphore>::acquire',
    '100228864:', '10022886c:', '100228a14:', '100228a44:', '100228a48:',
    '100228a60:', '100228a68:', '100228a90:', 'Semaphore>::release',
    '1002294d8:', '100229508:', '100229298:']:
    assert expected in access_token_fetcher, expected
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
        'tlsRootsEvidence': {
            'defaultFlags': '0x1005e6784..0x1005e678c set flags at builder 0x387 and 0x388 to true',
            'builderCopy': '0x1005e6ac8 copies config to sp+0x68; root flags become sp+0x3ef/0x3f0',
            'rootStores': '0x1005e78e8..0x1005e7940 conditionally extend WebPKI trust anchors and load native certificates',
            'implementation': 'reqwest rustls-tls-webpki-roots and rustls-tls-native-roots features enabled; no disabled certificate or hostname checks'
        },
        'upstreamReferences': [
            'https://raw.githubusercontent.com/seanmonstar/reqwest/v0.12.28/src/async_impl/client.rs',
            'https://raw.githubusercontent.com/seanmonstar/reqwest/v0.12.28/src/redirect.rs'
        ],
        'limits': 'Version is tied to the called build function, not merely a binary string hit. Redirect no-follow behavior confirmed by dispatch branch. Duration is consumed by request sleep; full timeout lifecycle and Rustls WebPKI/native-root branches are evidenced; exact transitive dependency versions, provider parity and decompression features remain under review. Client construction exists but no production handler is wired.'
    },
    'orchestration': {
        'range': ['0x10026bf48','0x10026ca94'],
        'instructionTextSha256': hashlib.sha256(dispatch.encode()).hexdigest(),
        'authVtable': {'address':'0x100cfb970', 'currentAuth':'0x10022bb10', 'refetchAuth':'0x10022bb84'},
        'reviewedBranches': [
            'resolved_request precedes any provider or HTTP call; passthrough dispatch at 0x10026c49c bypasses auth',
            '0x10026c5b8 calls current_auth; initial auth errors propagate via 0x10026c278 -> 0x10026c504',
            '0x10026c6cc first authenticated send; only status 401 at 0x10026c74c triggers refetch_auth at 0x10026c7ac',
            'refetch error at 0x10026c0f8 -> 0x10026c4ac drops original response and returns error',
            'second send at 0x10026c1d0 returns via 0x10026c1f0..0x10026c224 without another status retry'
        ],
        'limits': 'Provider/HTTP trait interfaces are independent Rust reconstruction. Test providers use synthetic credentials. CodexAppServerAuthProvider policy now connects through AccessTokenFetcher and a diagnostics observer; concrete App Server transport, diagnostics backend, request context and deployment wiring remain incomplete.'
    },
    'authClaimHelper': {
        'range': ['0x10022b524','0x10022b77c'],
        'instructionTextSha256': hashlib.sha256(claim_helper.encode()).hexdigest(),
        'namespace': claim_namespace,
        'engineConfigBytes': claim_engine,
        'engine': 'base64 0.22.1 URL_SAFE_NO_PAD: padding prohibited, nonzero trailing bits prohibited',
        'reviewedBehavior': [
            'two SplitInternal<char>::next calls select second dot-delimited segment; no header/signature/expiry verification or exact segment count check',
            'decode payload then parse serde_json Value; either error yields None',
            'index auth namespace then requested key; return only string values, preserving empty strings'
        ],
        'implementation': 'native/runtime-supervisor/src/codex_app_server_auth.rs',
        'limits': 'Only metadata extraction, never JWT verification. Static instruction review and synthetic tests; native provider cache, App Server requests and production wiring remain incomplete.'
    },
    'authStatusContract': {
        'fetcherRange': ['0x10022837c','0x100229bd0'],
        'fetcherInstructionTextSha256': hashlib.sha256(access_token_fetcher.encode()).hexdigest(),
        'providerRange': ['0x1002272ac','0x10022753c'],
        'providerInstructionTextSha256': hashlib.sha256(fetch_auth_provider.encode()).hexdigest(),
        'literals': auth_status_literals,
        'reviewedBehavior': [
            'request getAuthStatus with includeToken=true and refreshToken equal to fetcher argument',
            'current_auth initializes refresh flag false; refetch_auth initializes true',
            'result authToken must be a nonempty string, checked before authMethod; token whitespace is not trimmed',
            'authMethod must be a string exactly equal to chatgpt (seven-byte comparison); other strings produce unsupported error',
            'provider invokes AccessTokenFetcher once with refresh flag; fetch errors bypass claim extraction and diagnostics',
            'provider extracts chatgpt_account_id followed by chatgpt_user_id; diagnostics receives optional user ID before returning credentials',
            'successful token without user claim passes None to diagnostics; provider has no credential cache branch in the reviewed function'
        ],
        'limits': 'Request parameters, result validation, CodexAuth projection and provider refresh delegation implemented. AuthUserObserver is an explicit reconstruction seam for the original Sentry update; backend not implemented and no telemetry emitted. App Server fetcher transport/initialization, error logging and deployment wiring remain incomplete. Any caching below AccessTokenFetcher is not established by this provider review.'
    },
    'appServerSpawn': {
        'range':['0x1002bada8','0x1002bb388'],
        'instructionTextSha256':hashlib.sha256(app_server_spawn.encode()).hexdigest(),
        'literals':spawn_literals,
        'reviewedBehavior':[
            'parse runtime mode before environment lookup; reject gaas-browser before process creation',
            'std::env::var CODEX_CLI_PATH; VarError fallback codex, preserve present empty value',
            'three args app-server --listen stdio://; stdin/stdout Stdio discriminant 2 maps to pipe, stderr discriminant 1 opens /dev/null',
            'command flag at sp+0x208 (command+0xc8) set true; Tokio build_child copies to child kill-on-drop flag at offset 0x88',
            'take stdin then stdout; wrap stdout with 8192-byte BufReader'
        ],
        'implementation':'native/runtime-supervisor/src/codex_app_server.rs',
        'limits':'Owned process fixtures only. Runtime mode parser is supplied by caller. Request IDs, response matching and per-line timeout now implemented in send_request. Initialization implemented; client connection reuse and next-call recreation implemented; deployment integration pending. Vendor CLI was not executed.'
    },
    'appServerRequestProtocol': {
        'range':['0x10022753c','0x100228224'],
        'instructionTextSha256':hashlib.sha256(rpc_send.encode()).hexdigest(),
        'errorHelperRange':['0x1002bd4d0','0x1002bd5b0'],
        'errorPrefixes':rpc_errors,
        'reviewedBehavior':[
            'increment usize request counter before serialization; stringify decimal ID; request contains id/method and params only when Some (including Some Null)',
            'serialize JSON then write_all payload then separate newline write; newline branch is called flush in error text but no poll_flush invocation',
            'timeout 30 seconds wraps each Lines::next_line; ignored empty/nonmatching lines return to constructing a fresh timeout',
            'malformed JSON including whitespace-only line returns error; only string ID equal to requested ID matches',
            'matching error field presence (including null) takes precedence over result; message string including empty is preserved; fallback rejected-method error',
            'missing result returns JSON null; read/EOF/timeout failures have distinct errors'
        ],
        'implementation':'native/runtime-supervisor/src/codex_app_server.rs',
        'limits':'Owned subprocess tests, not original-runtime differential execution. Initialization implemented; reviewed path has no initialized notification. Client connection reuse and concrete token fetcher implemented; production auth integration remains pending. Per-line timeout is not an overall deadline; write cancellation/resumption parity is not proven.'
    },
    'appServerInitialization': {
        'source':'inlined spawn_initialized in AccessTokenFetcher async body',
        'instructionTextSha256':hashlib.sha256(access_token_fetcher.encode()).hexdigest(),
        'literals':initialize_literals,
        'params':{'capabilities':{'experimentalApi':True,'optOutNotificationMethods':[]},
                  'clientInfo':{'name':'codex-browser-use','title':'Codex Browser Use','version':'0.1.0'}},
        'reviewedBehavior':[
            'spawn at 0x100228894; assemble capabilities and clientInfo, invoke send_request initialize at 0x100229154',
            'version 0.1.0 assembled by immediate stores at 0x100228f64..0x100228f74',
            'initialize error branches to connection drop at 0x1002291d4; successful result discarded at 0x10022947c',
            'successful connection stored at 0x1002294d8; branch 0x100229508 -> 0x1002289d4 -> ordinary request send 0x100228a14; no initialized notification on this path'
        ],
        'implementation':'native/runtime-supervisor/src/codex_app_server.rs',
        'limits':'Pinned-build path only. Client shared-connection lifecycle implemented; no claim that all App Server clients/protocol versions omit initialized. Owned fixture tests, not live vendor auth.'
    },
    'appServerClientLifecycle': {
        'source':'inlined CodexAppServerClient::send_request in AccessTokenFetcher async body',
        'instructionTextSha256':hashlib.sha256(access_token_fetcher.encode()).hexdigest(),
        'reviewedBehavior':[
            'runtime mode parse/rejection precedes acquiring shared connection mutex',
            'mutex held across spawn_initialized and send_request; reuse existing Some connection',
            'send_request Err drops connection and writes None at 0x100228a60..0x100228a68, releases guard and returns error without retry',
            'successful RPC result releases guard before authToken/authMethod validation; parser rejection does not invalidate connection',
            'initialize success stores new connection then continues ordinary request; initialization errors leave no cached connection'
        ],
        'runtimeMode':{
            'range':['0x100292658','0x1002927e8'],
            'instructionTextSha256':hashlib.sha256(runtime_parser.encode()).hexdigest(),
            'behavior':'NODE_REPL_RUNTIME_MODE var_os: absent/empty default, exact gaas-browser special mode; all other values error using lossy display (including literal default)'
        },
        'implementation':['native/runtime-supervisor/src/codex_app_server.rs','native/runtime-supervisor/src/runtime_mode.rs','native/runtime-supervisor/src/codex_app_server_auth.rs'],
        'limits':'Owned fixtures and static reconstruction. Native diagnostics, process-env integration with deployment, service wiring, cancellation during outstanding RPC and full live auth acceptance remain incomplete.'
    },
    'implementation': 'native/runtime-supervisor/src/authenticated_fetch.rs',
    'limits': 'Static reconstruction, no original execution. URL routing and authenticated header shaping are reconstructed; app-server integration remains unimplemented; client construction and HTTP/TLS send have owned fixture coverage. No production handler is wired to this constructor. The client initialization call and panic source location establish reqwest 0.12.28; configuration and deployment integration remain incomplete.'
},indent=2))
