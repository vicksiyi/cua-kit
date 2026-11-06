#!/usr/bin/env python3
"""Read build/symbol provenance. Never run the original host or dump arbitrary strings."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
artifact = 'ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome/extension-host/macos/arm64/ChatGPT for Chrome'
binary = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/Applications') / artifact
raw = binary.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
result = subprocess.run(['nm', '--demangle', str(binary)], check=True, capture_output=True, text=True)
symbols = sorted({name for line in result.stdout.splitlines()
                  if (name := re.sub(r'^\S+\s+\S+\s+', '', line)).startswith(('extension_host::', '<extension_host::'))
                  and '{closure' not in name})
required = ['extension_host::main', 'extension_host::rpc_router::RpcRouter',
            'extension_host::transport::unix::UnixSocketServer', 'extension_host::client_writer::ClientWriterRegistry']
for name in required:
    if not any(name in symbol for symbol in symbols):
        raise RuntimeError('Expected host symbol missing; review artifact before updating classification: '+name)
prior_auth = json.loads((root/'reconstruction/native-host-auth-evidence.json').read_text())
roles = {
 'main.ts': ['extension_host::main'],
 'server.ts': ['extension_host::transport::unix::UnixSocketServer', 'extension_host::transport::stdio::StdioTransport', 'extension_host::client_writer::ClientWriterRegistry'],
 'router.ts': ['extension_host::rpc_router::RpcRouter'],
}
print(json.dumps({
 'artifact': artifact, 'sha256': digest,
 'languageEvidence': {
  'rustCompilerRevisions': sorted({x.decode() for x in re.findall(rb'rustc/[a-f0-9]{40}',raw)}),
  'sourcePathLiterals': sorted({x.decode() for x in re.findall(rb'(?<![A-Za-z0-9_/])src/[a-z_]+(?:/[a-z_]+)*\.rs',raw)}),
  'demangledHostSymbols': symbols,
 },
 'dependencyPathLiterals': sorted({x.decode() for x in re.findall(rb'/registry/src/[^/\x00 ]+/([a-zA-Z0-9_.+-]+)/',raw)}),
 'migrationCandidates': [
  {'path':'packages/native-host/src/'+name,'sha256':hashlib.sha256((root/'packages/native-host/src'/name).read_bytes()).hexdigest(),
   'targetLanguage':'Rust','evidencedRoles':evidence,'status':'core-native-defaults-migrated-legacy-reference-retained',
   'limit':'Role-level native ownership, not recovered algorithm or proof that current TS matches the native implementation.'}
  for name,evidence in roles.items()
 ],
 'additionalNativeScope':['per-client writer queues and eviction','peer code-identity authorization','app-server process/manifest/version management','WebSocket app-server proxy','tab context asset chunk lifecycle','local file dispatch'],
 'consumersRequiringMigration':['packages/native-host/src/index.ts (public legacy exports)','direct native-host test consumers'],
 'migratedConsumers':[{'path':'packages/cdp-host/src/host.ts','binding':'packages/native-host/src/native_process.ts','implementation':'native/browser-extension-host','status':'Core Rust host selected and owned/attached browser fixtures verified; not original host parity'}],
 'installedNativeEntry':{'installer':'packages/native-host/src/install_cli.ts','executable':'native/browser-extension-host','status':'New installs and verified owned-registration upgrades launch Rust; legacy explicit APIs/tests remain'},
 'priorAuthorizationEvidence':{'path':'reconstruction/native-host-auth-evidence.json','sha256':prior_auth['binarySha256'],'matchesCurrentArtifact':prior_auth['binarySha256']==digest,'interpretation':'Historical address/allowlist evidence is version-bound; do not apply offsets or assert the same allowlist for this artifact when hashes differ.'},
 'interpretation':'Rust compiler/source paths and demangled host symbols establish native language and responsibility names. Function bodies, exact queue limits, authorization rules and complete dependencies are not recovered. Core capability-token authentication is independently designed, not original peer code-signature authorization. Original JS clients/discovery scripts remain TS. No original host was executed.',
},indent=2))
