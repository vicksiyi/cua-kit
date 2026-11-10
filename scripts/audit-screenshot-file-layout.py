#!/usr/bin/env python3
"""Read pinned Mach-O metadata only; never execute/attach the native service."""
import hashlib
import json
import struct
import sys
from pathlib import Path

binary = Path(sys.argv[1] if len(sys.argv) > 1 else
    '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
data = binary.read_bytes()
expected = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'
if hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit('Unverified native binary version; update evidence before interpreting addresses')
if struct.unpack_from('<I', data)[0] != 0xfeedfacf:
    raise SystemExit('Expected thin little-endian Mach-O 64')
segments = []
offset = 32
for _ in range(struct.unpack_from('<I', data, 16)[0]):
    command, size = struct.unpack_from('<II', data, offset)
    if command == 0x19:
        address, _, file_offset, file_size = struct.unpack_from('<QQQQ', data, offset + 24)
        segments.append((address, file_offset, file_size))
    offset += size

def read(address, size):
    for base, start, length in segments:
        if base <= address and address + size <= base + length:
            return data[start + address - base:start + address - base + size]
    raise ValueError(f'Unmapped address {address:#x}')

def relative(address):
    return address + struct.unpack('<i', read(address, 4))[0]

def string(address):
    output = bytearray()
    while (byte := read(address, 1)) != b'\0':
        output.extend(byte)
        address += 1
    return output.decode('utf-8')

def fields(descriptor):
    field_descriptor = relative(descriptor + 16)
    kind, record_size, count = struct.unpack('<HHI', read(field_descriptor + 8, 8))
    assert record_size == 12
    result = []
    for index in range(count):
        record = field_descriptor + 16 + index * record_size
        result.append({'name': string(relative(record + 8)),
            'symbolicTypeAddress': hex(relative(record + 4))})
    return {'descriptor': hex(descriptor), 'fieldDescriptor': hex(field_descriptor),
        'kind': kind, 'fields': result}

file = fields(0x1012eb260)
screenshot = fields(0x1012ea684)
assert file['kind'] == 2 and [f['name'] for f in file['fields']] == ['path', 'temporaryFile', 'data']
assert screenshot['kind'] == 0 and [f['name'] for f in screenshot['fields']] == ['file', 'url', 'mimeType']
print(json.dumps({'binarySha256': expected, 'File': file, 'ScreenshotFile': screenshot,
    'limits': 'Metadata layout only: does not prove algorithms, complete coding contracts or runtime acceptance'}, indent=2))
