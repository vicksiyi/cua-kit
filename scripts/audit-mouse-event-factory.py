#!/usr/bin/env python3
"""Static pinned original metadata/table verification; never launch vendor service."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
read = audit['read']
def relative(address):
    return address + struct.unpack('<i', read(address, 4))[0]
field = relative(0x1012cccb4 + 16)
assert field == 0x101323788
assert struct.unpack('<H', read(field + 10, 2))[0] == 12
count = struct.unpack('<I', read(field + 12, 4))[0]
names = [read(relative(field + 16 + index * 12 + 8), 64).split(b'\0')[0].decode() for index in range(count)]
assert names == ['mouseDown', 'mouseUp', 'mouseDragged', 'mouseMoved']
tables = {name: list(struct.unpack('<4I', read(address, 16))) for name, address in
          [('left', 0x1011921f0), ('right', 0x101192200), ('other', 0x101192210)]}
assert tables == {'left': [1,2,6,5], 'right': [3,4,7,5], 'other': [25,26,27,5]}
report = {'binarySha256': hashlib.sha256(audit['data']).hexdigest(),
          'entry': '0x1007547d4', 'fieldDescriptor': hex(field), 'cases': names,
          'mappingFunction': '0x100754d28', 'eventTypes': tables,
          'source': 'native/macos/Sources/CuaHelper/SynthesizedEventMouse.swift',
          'limits': ['SynthesizedEvent remains in CuaHelper pending full original module relocation',
                     'No complete ABI/default-argument parity claimed',
                     'In-memory event checks do not prove application event delivery']}
(root / 'reconstruction/mouse-event-factory-evidence.json').write_text(json.dumps(report, indent=2)+'\n')
print('Pinned mouse event enum metadata and three event type tables verified')
