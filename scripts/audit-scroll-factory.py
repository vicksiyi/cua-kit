#!/usr/bin/env python3
"""Pinned scroll factory static audit; no original process execution."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root=pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit=runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
def word(address): return struct.unpack('<I',audit['read'](address,4))[0]
def branch(address):
    value=word(address); assert value & 0xfc000000 == 0x94000000
    offset=value & 0x3ffffff
    if offset & 0x2000000: offset-=0x4000000
    return address+offset*4
calls={0x100754ab4:0x100258288,0x100754b00:0x100257d88,0x100754bc0:0x1002580d0,0x100754bd0:0x1002580d0,0x100754be0:0x1002580d0,0x100754c90:0x10026cc8c}
for site,target in calls.items(): assert branch(site)==target
assert word(0x100754b64)==0x3900003b # strb w27,[x1]; w27=1 source error
assert word(0x100754aac)==0x5280003b
assert word(0x100754b94)==0x3900003f # strb wzr,[x1]; event error0
for address in [0x100754d04,0x100754d08,0x100754d0c]: assert word(address)==0xd4200020
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),
        'entry':'0x100754a60','source':'native/macos/Sources/AccessibilitySupport/SynthesizedEventScroll.swift',
        'calls':{hex(k):hex(v) for k,v in calls.items()},
        'behavior':['HID-system source before checked Int32 delta conversions','Pixel units, wheelCount1, wheel1=deltaY/wheel2=deltaX/wheel3=0','Optional window identity and bounds independent; raw51 then91/92 then optional local coordinates','Source failure Error1; event failure Error0; conversion overflow traps'],
        'limits':['Source/event allocation failures and out-of-range conversion traps not forced in runtime test','Helper MouseWindow overload remains an independent thin compatibility boundary','No scroll events posted; application delivery unaccepted']}
(root/'reconstruction/scroll-factory-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Pinned scroll source/event errors, conversions and six native call sites verified')
