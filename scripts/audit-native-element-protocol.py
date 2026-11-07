#!/usr/bin/env python3
"""Read-only audit of the pinned vendor Mach-O; never loads or executes it."""
from pathlib import Path
import argparse
import hashlib
import json
import struct

parser = argparse.ArgumentParser()
parser.add_argument('--binary', type=Path, default=Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'))
args = parser.parse_args()
data = args.binary.read_bytes()
expected = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'
if hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit('Unrecognized native build; re-audit protocol descriptors before updating pins')
segments = []
offset = 32
for _ in range(struct.unpack_from('<I', data, 16)[0]):
    command, size = struct.unpack_from('<II', data, offset)
    if command == 0x19:
        _, address, _, file_offset, file_size = struct.unpack_from('<16sQQQQ', data, offset + 8)
        segments.append((address, address + file_size, file_offset))
    offset += size

def read(address, size):
    for low, high, file_offset in segments:
        if low <= address and address + size <= high:
            return data[file_offset + address - low:file_offset + address - low + size]
    raise ValueError(hex(address))

def protocol(name, address, table, flags, witness_addresses):
    header = struct.unpack('<6I', read(address, 24))
    signature_count, count = header[3:5]
    if signature_count != 4 or count != len(flags) or count != len(witness_addresses):
        raise SystemExit("Protocol dimensions changed")
    start = address + 24 + signature_count * 12
    requirements = []
    for i in range(count):
        entry = start + i * 8
        kind, relative_default = struct.unpack('<Ii', read(entry, 8))
        if kind != flags[i] or relative_default != 0:
            raise SystemExit('Protocol requirement changed at ' + hex(entry))
        # These exact pinned table slots are rebases, except zero dynamic bases.
        raw = struct.unpack('<Q', read(table + (i + 1) * 8, 8))[0]
        target = None if raw == 0 else 0x100000000 + (raw & 0xffffffff)
        if target != witness_addresses[i]:
            raise SystemExit('Witness target changed at ' + hex(table + (i + 1) * 8))
        requirements.append(dict(index=i, descriptor=hex(entry), flags=hex(kind),
                                 defaultImplementation=None,
                                 witness=hex(target) if target else None))
    return dict(name=name, descriptor=hex(address), signatureRequirements=signature_count,
                requirementCount=count, witnessTable=hex(table), requirements=requirements)

ui = protocol('AccessibilitySupport.UIElementProtocol', 0x1012cd46c, 0x10149ed40,
    [0, 0, 3, 0x13, 0x13, 2, 0x13, 0x13, 0x13, 0x13, 0x11, 0x11],
    [None, None, 0x10078fbf4, 0x10078fbfc, 0x10078fc04, 0x10078fc50,
     0x1007aff6c, 0x1007aff74, 0x1007925f4, 0x100792600, 0x1007b8a04, 0x100792670])
# Inherited protocol is inventoried without pretending unnamed getters are known.
a = 0x1012c9238
h = struct.unpack('<6I', read(a, 24))
assert h[3:5] == (4, 36)
print(json.dumps(dict(binarySHA256=expected, protocol=ui,
    inherited=dict(name='ComputerUseCore.AccessibilityNode', descriptor=hex(a),
                   signatureRequirements=4, requirementCount=36),
    limitations=['Witness member names beyond separately traced entries remain unresolved.',
                 'Zero base-conformance slots require runtime instantiation; they are not missing inheritance.',
                 'This is static evidence, not executable protocol conformance or desktop acceptance.']), indent=2))
