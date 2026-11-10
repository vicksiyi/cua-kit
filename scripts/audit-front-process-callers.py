#!/usr/bin/env python3
"""Pinned __text direct-branch scan only; no vendor service execution."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
data, read = audit['data'], audit['read']
targets = {0x10026d8b4:'setFrontProcess',0x10026cc8c:'setWindowLocation',0x10026cd64:'setCursorUpdatesFromBackground'}
calls = {name:[] for name in targets.values()}
offset = 32
for _ in range(struct.unpack_from('<I', data, 16)[0]):
    command, size = struct.unpack_from('<II', data, offset)
    if command == 0x19:
        for index in range(struct.unpack_from('<I', data, offset + 64)[0]):
            section = offset + 72 + index * 80
            if data[section:section+16].rstrip(b'\0') != b'__text' or data[section+16:section+32].rstrip(b'\0') != b'__TEXT': continue
            address, length, fileoff = struct.unpack_from('<QQI', data, section + 32)
            for position, (word,) in enumerate(struct.iter_unpack('<I', data[fileoff:fileoff+length])):
                if word & 0xfc000000 not in (0x94000000, 0x14000000): continue
                immediate = word & 0x3ffffff
                if immediate & 0x2000000: immediate -= 0x4000000
                target = address + position * 4 + immediate * 4
                if target in targets: calls[targets[target]].append(hex(address + position * 4))
    offset += size
assert calls['setFrontProcess'] == ['0x10077b5f0','0x10077b698']
flags = list(struct.unpack('<4I', read(0x101195850, 16)))
assert flags == [0x100,0x200,0x400,0x800]
report = {'binarySha256':hashlib.sha256(data).hexdigest(), 'scope':'Direct B/BL in __TEXT,__text only; indirect calls excluded',
          'calls':calls, 'frontProcessCallers':['AccessibilitySupport NSRunningApplication.showAllWindows','AccessibilitySupport NSRunningApplication.setFrontProcess(windowID:options:)'],
          'options':dict(zip(['allWindows','causedByUser','noWindows','dontUnhide'], flags)),
          'limits':['No direct caller does not mean unused: indirect/runtime calls are not enumerated','Do not substitute this API into synthetic click activation without its original caller evidence','Original native hash pinned by imported read-only audit']}
(root/'reconstruction/front-process-callers-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Original front-process direct callers and four UInt32 option values verified')
