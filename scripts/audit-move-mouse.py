#!/usr/bin/env python3
"""Read original ARM64 only; vendor service is never executed."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
read = audit['read']
def word(address): return struct.unpack('<I', read(address, 4))[0]
def branch(address):
    instruction = word(address)
    assert instruction & 0xfc000000 == 0x94000000
    immediate = instruction & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    return address + immediate * 4
calls = {0x100754e38:0x1002580c4, 0x100754e48:0x100258140,
         0x100754e58:0x1002580d0, 0x100754e68:0x1002580d0,
         0x100754e7c:0x1002580d0, 0x100754e8c:0x1002580d0,
         0x100754f3c:0x10026cc8c}
for site, target in calls.items(): assert branch(site) == target
# adds x9,x22,#1 and b.vs: original checked increment before NSEvent allocation.
assert word(0x100754d90) == 0xb10006c9
assert word(0x100754d94) & 0xff00001f == 0x54000006
report = {'binarySha256': hashlib.sha256(audit['data']).hexdigest(),
          'entry':'0x100754d5c', 'source':'native/macos/Sources/CuaHelper/SynthesizedEventMoveMouse.swift',
          'calls':{hex(k):hex(v) for k,v in calls.items()},
          'behavior':['Consume event number with checked increment before allocation',
                      'NSEvent mouseMoved, clickCount1, pressure1, no initial modifiers',
                      'CG flags0, button0, subtype3, global location',
                      'Optional window identity and optional geometry; zero ID remains present',
                      'Translation then conditional Y flip; allocation failure invalidParameter'],
          'limits':['Restored body delegates common allocation to mouseEvent; original binary has inlined construction',
                    'No production moveMouse caller added without original controller evidence',
                    'CuaHelper module placement remains pending; no live event delivery acceptance']}
(root/'reconstruction/move-mouse-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Original moveMouse checked increment and seven native call sites verified')
