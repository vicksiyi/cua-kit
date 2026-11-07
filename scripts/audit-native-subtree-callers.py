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

def relative(address):
    value = struct.unpack('<i', read(address, 4))[0]
    return address + value if value else None

def cstring(address):
    return read(address, 256).split(b'\0', 1)[0].decode()

def fields(descriptor):
    field_table = relative(descriptor + 16)
    size, count = struct.unpack('<HI', read(field_table + 10, 6))
    return [cstring(relative(field_table + 16 + i * size + 8)) for i in range(count)]

operation_fields = fields(0x1012c1710)
context_cases = fields(0x1012c9590)
assert operation_fields[2] == 'contextType'
assert context_cases == ['fullUIContext', 'eventStreamContext', 'informationalContext']
# Struct offset vector starts at metadata word 2, so offset 0x18 is field 2.
assert struct.unpack('<I', read(0x1012c1710 + 24, 4))[0] == 2
calls = []
for low, high, file_offset in segments:
    for offset in range(file_offset, file_offset + high - low - 3, 4):
        word = struct.unpack_from('<I', data, offset)[0]
        if word & 0xfc000000 not in (0x94000000, 0x14000000): continue
        immediate = word & 0x3ffffff
        if immediate & 0x2000000: immediate -= 0x4000000
        address = low + offset - file_offset
        if address + immediate * 4 == 0x10076bd70: calls.append(hex(address))
assert calls == ['0x10021f550', '0x100230d74', '0x100234808', '0x100238774', '0x10023a250', '0x10076cc14']
print(json.dumps(dict(binarySHA256=expected, operationFields=operation_fields,
    contextCases=context_cases, directSubtreeCalls=calls,
    condition=dict(contextFieldLoad='0x10023425c..0x100234260',
        webShapeGetterCall='0x100234784', select='0x1002347ac..0x1002347c0',
        rule='eventStreamContext && isWebShaped ? 20 : 100'),
    limitations=['Static capture-path evidence; not a universal subtree default.',
        'Original collector rendering, invalidation and refetch lifecycle remain to be integrated.',
        'Direct-branch scan does not enumerate indirect calls.']), indent=2))
