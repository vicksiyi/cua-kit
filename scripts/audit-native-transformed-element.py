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

# The descriptor, not getter names, distinguishes stored and computed properties.
descriptor = 0x1012ccde4
stored = fields(descriptor)
expected_fields = [
    'element', 'role', 'subrole', 'roleDescription', 'title', 'description',
    'value', 'truncationRange', 'valueDescription', 'valueTypeName',
    'placeholderValue', 'help', 'identifier', 'url', 'domClassList',
    'actionDescriptions', 'isSelected', 'isSelectable', 'isFocused',
    'isFocusable', 'isEnabled', 'isDisclosing', 'isDisclosable',
    'isValueSettable', 'attributedString', 'transformedString',
]
assert stored == expected_fields
# Swift struct descriptor: kind 17, field-offset vector at metadata word 2.
assert struct.unpack('<I', read(descriptor, 4))[0] & 0x1f == 17
assert struct.unpack('<I', read(descriptor + 24, 4))[0] == 2

def branch(address, target, link=True):
    word = struct.unpack('<I', read(address, 4))[0]
    assert word & 0xfc000000 == (0x94000000 if link else 0x14000000)
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    assert address + 4 * immediate == target
    return dict(instruction=hex(address), target=hex(target), link=link)

calls = [branch(0x10075c570, 0x10075e160, False),
         branch(0x10075e0f8, 0x10076589c),
         branch(0x10075e124, 0x10075e160),
         branch(0x10075debC, 0x10065fb6c)]
rendering_descriptor = 0x1012c95ac
header = struct.unpack('<6I', read(rendering_descriptor, 24))
assert header[3:5] == (1, 6)
requirement_start = rendering_descriptor + 24 + 12
rendering_flags = [8, 7, 0x13, 0x14, 0x16, 0x13]
for i, flag in enumerate(rendering_flags):
    assert struct.unpack('<II', read(requirement_start + 8 * i, 8)) == (flag, 0)
rendering_witnesses = [0x100758848, 0x100758854, 0x10075885c, 0x100758870]
for i, target in enumerate(rendering_witnesses):
    raw = struct.unpack('<Q', read(0x101574b78 + (i + 3) * 8, 8))[0]
    assert 0x100000000 + (raw & 0xffffffff) == target
print(json.dumps(dict(binarySHA256=expected, descriptor=hex(descriptor),
    storedFields=stored, verifiedBranches=calls,
    renderingContext=dict(descriptor=hex(rendering_descriptor), flags=rendering_flags,
        requirements=["Role: AccessibilityRole", "Role", "urlShortener.get",
            "urlShortener.set", "urlShortener.modify", "type.get"],
        concreteWitnesses=[hex(x) for x in rendering_witnesses]),
    constructionFindings=[
        'UIElement/context initializer tail-branches into common constructor.',
        'AX/context initializer constructs provider cache before common constructor.',
        'AX-only initializer also initializes a URL shortener before reading current transaction.',
        'actions, cache, axElement, stringValue and interactivity predicates are not stored fields.',
    ],
    limitations=[
        'Stored field discovery does not establish their full initialization semantics.',
        'Common initializer 0x10075e160..0x10075ff54 still requires complete branch reconstruction.',
        'No full transformed owner or production collector integration is claimed.',
    ]), indent=2))
