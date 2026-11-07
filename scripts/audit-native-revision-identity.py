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


for site, target in [(0x100656600, 0x10063dc28), (0x100656740, 0x100654b9c),
                     (0x1006555e4, 0x1006568e4), (0x1006556d0, 0x10063ebbc),
                     (0x100655a18, 0x100656948), (0x100655a90, 0x100656fb8),
                     (0x100655b90, 0x10065030c), (0x100655bc8, 0x10064e088),
                     (0x100655bdc, 0x10064e088), (0x1006550f4, 0x100656fcc),
                     (0x100656924, 0x1006554c0), (0x100657578, 0x1006569b4),
                     (0x1006554a0, 0x10063dba0)]:
    word = struct.unpack('<I', read(site, 4))[0]
    assert word & 0x7c000000 == 0x14000000
    displacement = word & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert site + displacement * 4 == target
print(json.dumps(dict(binarySHA256=expected,
    root='0x1006564b4: render then zero-based setElementIDs then revision constructor',
    resolver='0x1006554c0',
    table='full render then optional focus render, depth first; later identity and ID-path writes overwrite; reverse mapping built from final forward dictionary',
    lookup='0x1006557a4: require path and reverse identity; focus identity membership selects focus tree, otherwise full tree; use stored path; no fallback after focus path miss',
    precedence=['require sourcePath', 'existing elementID', 'identity dictionary', 'next available ID'],
    mutation='assign node elementID then identity dictionary; return identity, ID, source path',
    limitations=['Root revision assembled; appended revisions, diff and production integration remain incomplete.']), indent=2))
