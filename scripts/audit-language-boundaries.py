#!/usr/bin/env python3
"""Inventory repository implementation files; classification is review scope, not parity proof."""
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
restored = {'cua','cua-repl','sky','browser','browser-desktop','browser-extension','node-repl','core'}
rows=[]
for package in sorted((root/'packages').iterdir()):
    if not package.is_dir(): continue
    for file in sorted((package/'src').rglob('*')):
        if not file.is_file() or file.suffix not in {'.ts','.js','.mjs','.cjs'}:continue
        kind = ('legacy-node-binding-forwarder' if file.name=='sandbox-bootstrap.ts' and package.name=='runtime-supervisor' else
                'native-responsibility-migrate-to-rust' if package.name=='runtime-supervisor' else
                'native-desktop-swift-boundary-review' if package.name=='native-macos' else
                'native-boundary-needs-original-language-evidence' if package.name=='native-host' else
                'declared-js-restoration-verify-per-file' if package.name in restored else
                'caller-or-deployment-code-review-for-native-responsibility')
        rows.append({'path':str(file.relative_to(root)),'category':kind,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
for directory,category,suffixes in [('src','legacy-prototype-review-required',{'.ts'}),('native','native-implementation-language-not-yet-parity-proof',{'.rs','.swift','.c','.ts'}),('scripts','build-or-deployment-script-review',{'.py','.mjs','.sh'})]:
    for file in sorted((root/directory).rglob('*')):
        if not file.is_file() or file.suffix not in suffixes or any(p in {'target','.build','dist','node_modules','tests'} for p in file.parts):continue
        rows.append({'path':str(file.relative_to(root)),'category':('node-to-native-binding-not-native-service' if directory=='native' and file.suffix=='.ts' else category),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
counts={kind:sum(row['category']==kind for row in rows) for kind in sorted({row['category'] for row in rows})}
print(json.dumps({'scope':'Implementation files under packages/*/src, legacy src, native, and scripts; generated outputs/dependencies/test fixtures excluded. Categories define review queues, not proof of source parity. Hashes make this inventory reproducible.','counts':counts,'files':rows},indent=2))
