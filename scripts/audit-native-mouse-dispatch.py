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

# Source send(to:delay:) stamps each event immediately before postToPid.
calls = [(0x100753970, 0x1002581ac), (0x10075397c, 0x100258054),
         (0x100754904, 0x1002580d0), (0x100754914, 0x1002580d0),
         (0x1007549c8, 0x10026cc8c)]
for site, target in calls:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction >> 26 == 0b100101, hex(site)
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert site + displacement * 4 == target, hex(site)
print(json.dumps({'binarySha256': expected, 'calls': [
    {'site': hex(site), 'target': hex(target)} for site,target in calls],
    'interpretation': 'setTimestamp precedes postToPid; mouse construction sets window fields and local location',
    'limits': 'Static call-site evidence; does not prove live app acceptance or complete send-loop parity.'}, indent=2))
