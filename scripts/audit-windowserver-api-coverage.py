#!/usr/bin/env python3
"""Static exported-name coverage, not signature/body/ABI parity or runtime proof."""
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
BINARY = pathlib.Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
EXPECTED = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'

def main():
    digest = hashlib.sha256(BINARY.read_bytes()).hexdigest()
    if digest != EXPECTED:
        raise SystemExit('Native binary changed; re-audit provenance before updating coverage')
    symbols = subprocess.run(['nm', str(BINARY)], check=True, capture_output=True, text=True).stdout
    demangled = subprocess.run(['swift', 'demangle'], input=symbols, check=True, capture_output=True, text=True).stdout
    exports = {}
    for line in demangled.splitlines():
        match = re.match(r'([0-9a-f]+) T static SystemSoftware\.WindowServerSPI\.(\w+)\(', line)
        if match:
            exports[match[2]] = {'address': '0x' + match[1], 'signature': line.split(' T ', 1)[1]}
    if not exports:
        raise SystemExit('No exported WindowServerSPI methods found; extraction invalid')
    source = ROOT / 'native/macos/Sources/SystemSoftware/WindowServerSPI.swift'
    names = set(re.findall(r'public static func (\w+)\(', source.read_text()))
    for name, entry in exports.items():
        entry['status'] = 'name-present-body-unproven' if name in names else 'missing-from-restored-type'
    report = {
        'binarySha256': digest,
        'scope': 'Exported static method names of SystemSoftware.WindowServerSPI only',
        'source': str(source.relative_to(ROOT)),
        'exportedMethodCount': len(exports),
        'namePresentCount': len(names & exports.keys()),
        'missingNames': sorted(exports.keys() - names),
        'localNamesNotInExportedSet': sorted(names - exports.keys()),
        'methods': dict(sorted(exports.items())),
        'limits': ['Name presence does not verify signatures, bodies, ownership, ABI or runtime behavior',
                   'Non-exported methods and other CUA modules are outside this denominator',
                   'Do not convert these counts into whole-project completion percentage']
    }
    output = ROOT / 'reconstruction/windowserver-api-coverage.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['exportedMethodCount', 'namePresentCount', 'missingNames']}))

if __name__ == '__main__':
    main()
