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
         (0x1007549c8, 0x10026cc8c),
         (0x100754ab4, 0x100258288), (0x100754b00, 0x100257d88),
         (0x100754c90, 0x10026cc8c),
         (0x1006fc334, 0x1007a7790), (0x1006fc420, 0x100715974),
         (0x1006fc46c, 0x1007a7790),
         (0x100754414, 0x100730374), (0x1007305e0, 0x10026cc8c),
         (0x100730724, 0x10026cc8c)]
for site, target in calls:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction >> 26 == 0b100101, hex(site)
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert site + displacement * 4 == target, hex(site)
# Source focus notification constants (mov w9, immediate).
for site, opcode in [(0x10072f568, 0x528002a9), (0x10072f6b8, 0x52880009), (0x10072f6f0, 0x52900009)]:
    assert struct.unpack('<I', read(site, 4))[0] == opcode, hex(site)
# Default duration is stored as a signed 128-bit attosecond count.
assert int.from_bytes(read(0x1011950e0, 16), 'little', signed=True) == 50_000_000_000_000_000
# Duration.< comparison is followed by selection of max(requested, default).
assert struct.unpack('<I', read(0x1007b300c, 4))[0] == 0x9a951294
# Pin the increment getter, zero initializer, pair reuse, and per-click count.
assert read(0x101574978, 8) == bytes(8)
for site, opcode in [(0x1007547c0, 0xb1000409),
                     (0x100755bbc, 0xaa1803e6), (0x10075628c, 0xaa1803e6),
                     (0x100755bc0, 0xaa1903e7), (0x100756290, 0xaa1903e7)]:
    assert struct.unpack('<I', read(site, 4))[0] == opcode, hex(site)
print(json.dumps({'binarySha256': expected, 'calls': [
    {'site': hex(site), 'target': hex(target)} for site,target in calls],
    'defaultClickMilliseconds': 50,
    'clickNumber': 'zero-initialized process counter; down/up reuse x24; clickCount uses x25',
    'interpretation': 'setTimestamp precedes postToPid; mouse construction sets window fields and local location',
    'limits': 'Static call-site evidence; does not prove live app acceptance or complete send-loop parity.'}, indent=2))
