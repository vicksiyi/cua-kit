#!/usr/bin/env python3
"""Audit static request arrays only; never execute or attach vendor code/SPI."""
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
binary = Path(sys.argv[1] if len(sys.argv) > 1 else
    '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
blob = binary.read_bytes()
sha = hashlib.sha256(blob).hexdigest()
expected = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'
if sha != expected:
    raise SystemExit('Unknown native version; static addresses are not verified')
if struct.unpack_from('<I', blob)[0] != 0xfeedfacf:
    raise SystemExit('Expected thin little-endian Mach-O64')
segments = []
offset = 32
for _ in range(struct.unpack_from('<I', blob, 16)[0]):
    command, size = struct.unpack_from('<II', blob, offset)
    if command == 0x19:
        va, _, start, length = struct.unpack_from('<QQQQ', blob, offset + 24)
        segments.append((va, start, length))
    offset += size

def read(va, size):
    for base, start, length in segments:
        if base <= va and va + size <= base + length:
            return blob[start + va - base:start + va - base + size]
    raise ValueError(f'Unmapped virtual address {va:#x}')

def array(va, count):
    # Native Swift static array object: metadata/refcounts then count/capacity.
    assert struct.unpack('<Q', read(va + 16, 8))[0] == count
    return list(struct.unpack(f'<{count}Q', read(va + 32, count * 8)))

def cstring(va):
    result = bytearray()
    while (byte := read(va, 1)) != b'\0':
        result.extend(byte)
        va += 1
    return result.decode('utf-8')

source = (root / 'native/macos/Sources/CuaHelper/WindowServerSPISymbolRequest.swift').read_text()
pattern = r'static let (\w+) = Self\(images: (\[.*?\]),\s*symbols: (\[\[.*?\]\]),\s*salt: "([^"]+)"\)'
def numbers(text):
    return json.loads(re.sub(r'0x[0-9a-fA-F]+', lambda m: str(int(m[0], 16)), text))
swift = {name: {'images': numbers(images), 'symbols': numbers(symbols), 'salt': salt}
    for name, images, symbols, salt in re.findall(pattern, source, re.S)}
records = json.loads((root / 'reconstruction/native-windowserver-symbol-evidence.json').read_text())
results = []
for request in records['requests']:
    name = request['name']
    assert len(request['symbolsVA']) == len(request['symbols'])
    actual = {'images': array(int(request['imagesVA'], 16), len(request['images'])),
        'symbols': [array(int(va, 16), len(values)) for va, values in zip(request['symbolsVA'], request['symbols'])],
        'salt': cstring(int(request['saltVA'], 16))}
    recorded = {key: request[key] for key in actual}
    assert actual == recorded, f'{name}: native bytes differ from recorded evidence'
    assert actual == swift[name], f'{name}: Swift request differs from current native bytes'
    results.append({'name': name, 'imageCount': len(actual['images']),
        'symbolCount': len(actual['symbols']), 'matchesRecordedAndSwift': True})
assert len(results) == len(swift) == 4
print(json.dumps({'binarySha256': sha, 'arrayElementOffset': 32,
    'requests': results, 'validation': 'Static request bytes only; no SPI resolution or execution',
    'limits': 'Does not establish calling signatures, ownership, runtime symbol availability or UI capture acceptance'}, indent=2))
