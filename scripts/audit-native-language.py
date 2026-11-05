#!/usr/bin/env python3
"""Extract build provenance only; never dump arbitrary executable strings or credentials."""
import hashlib
import json
import re
import sys
from pathlib import Path

binary = Path(sys.argv[1] if len(sys.argv) > 1 else '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl')
raw = binary.read_bytes()
modules = sorted(set(x.decode() for x in re.findall(rb'(?<![A-Za-z0-9_/])src/[a-z_]+(?:/[a-z_]+)*\.rs', raw)))
crates = sorted(set(x.decode() for x in re.findall(rb'/registry/src/[^/\x00 ]+/([a-zA-Z0-9_.+-]+)/', raw)))
print(json.dumps({
    'artifact': 'ChatGPT.app/Contents/Resources/cua_node/bin/node_repl',
    'sha256': hashlib.sha256(raw).hexdigest(),
    'languageEvidence': {'rustCompilerRevisions': sorted(set(x.decode() for x in re.findall(rb'rustc/[a-f0-9]{40}', raw))), 'sourcePathLiterals': modules},
    'dependencyPathLiterals': crates,
    'interpretation': 'Rust build and module names are evidenced by embedded paths. Native source bodies, exact Cargo features and complete dependency graph are not available from these strings. New Rust is independently implemented against observed worker protocols, not a recovered original source file.',
    'migration': {'installedJavaScript': 'restore as readable TypeScript', 'nativeSupervisor': 'Rust; TS supervisor remains transitional until replacement acceptance', 'nativeDesktop': 'Swift evidence recorded separately in desktop-language-evidence.json; individual responsibility mapping remains open', 'nativeBrowserHost': 'language and ownership still require separate evidence'},
}, indent=2))
