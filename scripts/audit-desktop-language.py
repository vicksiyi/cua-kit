#!/usr/bin/env python3
"""Static native desktop provenance only: no launch, IPC, entitlements or credentials."""
import hashlib
import json
import plistlib
import re
import subprocess
from pathlib import Path
app=Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app')
info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
name=info['CFBundleExecutable']
binary=app/'Contents/MacOS'/name
raw=binary.read_bytes()
paths=sorted(set(p.decode() for p in re.findall(rb'[A-Za-z][A-Za-z0-9_+-]*/[A-Za-z][A-Za-z0-9_+.-]*\.swift',raw)))
selected=[p for p in paths if p.startswith(('ComputerUse/','Codex_Computer_Use/','AccessibilitySupport/'))]
links=subprocess.run(['/usr/bin/otool','-L',str(binary)],capture_output=True,text=True,check=True).stdout
libraries=[line.strip().split(' (',1)[0] for line in links.splitlines()[1:]]
print(json.dumps({'artifact':'@oai/sky/Codex Computer Use.app/Contents/MacOS/'+name,'sha256':hashlib.sha256(raw).hexdigest(),'bundleIdentifier':info['CFBundleIdentifier'],'languageEvidence':{'swiftSourcePathLiterals':selected,'swiftRuntimeLibraries':[p for p in libraries if '/libswift' in p]},'nativeFrameworks':[p for p in libraries if any('/'+n+'.framework/' in p for n in ['AppKit','ApplicationServices','ScreenCaptureKit','CoreGraphics','Foundation'])],'interpretation':'Swift source paths include the ComputerUse IPC server and app service, establishing Swift implementation in the native desktop boundary. This does not establish every function language or recover native function bodies. JS client and policy wrappers remain JS-derived TypeScript. Existing Swift helper is independently authored, not source-equivalent.'},indent=2))
