#!/usr/bin/env python3
"""Compare direct CGWindow T exports only; no service execution or ABI proof."""
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGINAL = pathlib.Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
RESTORED = ROOT / 'native/macos/.build/debug/cua-helper'
PIN = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'

def exports(binary):
    raw = subprocess.run(['nm', str(binary)], check=True, capture_output=True, text=True).stdout
    decoded = subprocess.run(['swift', 'demangle'], input=raw, check=True, capture_output=True, text=True).stdout
    result = {}
    for line in decoded.splitlines():
        match = re.match(r'([0-9a-f]+) T (.*)', line)
        if match and match[2].startswith(('SystemSoftware.CGWindow.', 'static SystemSoftware.CGWindow.')):
            result[match[2]] = '0x' + match[1]
    if not result:
        raise RuntimeError('No direct CGWindow T exports; do not treat empty extraction as coverage')
    return result

def main():
    original_hash = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
    if original_hash != PIN:
        raise SystemExit('Original binary changed; re-audit before updating coverage')
    old, new = exports(ORIGINAL), exports(RESTORED)
    matched = sorted(old.keys() & new.keys())
    missing = sorted(old.keys() - new.keys())
    report = {
        'scope': 'Direct global T signatures starting SystemSoftware.CGWindow. or static SystemSoftware.CGWindow.; nested types/accessors included',
        'originalSha256': original_hash,
        'restoredSha256': hashlib.sha256(RESTORED.read_bytes()).hexdigest(),
        'repositoryHeadAtAudit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'originalSignatureCount': len(old), 'restoredSignatureCount': len(new),
        'exactSignatureMatchCount': len(matched),
        'missingOriginalSignatures': missing,
        'additionalRestoredSignatures': sorted(new.keys() - old.keys()),
        'matches': [{'signature': name, 'originalAddress': old[name], 'restoredAddress': new[name]} for name in matched],
        'limits': [
            'Export signature presence does not prove original function bodies, ABI, ownership or runtime behavior',
            'Counts include getters/setters/constructors; not distinct source functions or whole-project completion',
            'Private/local implementation symbols, metadata, protocol witnesses and other modules excluded',
            'Audits existing binaries; repository head alone does not establish binary/source correspondence',
            'Two extracted public constructor/injection boundaries are additional exports, not original API identity'
        ]
    }
    output = ROOT / 'reconstruction/cgwindow-export-surface-evidence.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['originalSignatureCount', 'restoredSignatureCount', 'exactSignatureMatchCount', 'missingOriginalSignatures', 'additionalRestoredSignatures']}))
    if missing:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
