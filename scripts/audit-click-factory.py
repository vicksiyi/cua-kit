#!/usr/bin/env python3
"""Pinned native click/drag body checks; no original process execution."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root=pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit=runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
def word(address): return struct.unpack('<I',audit['read'](address,4))[0]
def target(address):
    value=word(address); assert value & 0xfc000000 == 0x94000000
    offset=value & 0x3ffffff
    if offset & 0x2000000:offset-=0x4000000
    return address+offset*4
assert target(0x100753710)==0x100755a4c
# cmp x4,1 and signed less-than rejection; no10-count ceiling in native core.
assert word(0x100755a88)==0xf100049f
assert word(0x100755a8c)&0xff00001f==0x5400000b
# Main pair counter and extra drag counter each checked increment once.
assert word(0x100755b84)==0xb1000708
assert word(0x100755d68)==0xb1000768
# Floating point midpoint scales both summed coordinates by exactly0.5.
assert word(0x100755b3c)==0x1e6c1001
# Allocation/count failure shared Error0.
assert word(0x100756478)==0x3900003f
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),'entry':'0x1007536ec','body':'0x100755a4c','source':'native/macos/Sources/AccessibilitySupport/SynthesizedEventClick.swift','behavior':['Reject count<1; no native upper count cap','Each click down/up share one event number and increasing click count','Drag adds exactly three events at start,midpoint,end,all sharing one additional number and clickCount0','Final up at destination uses original down event number','Window/bounds/flip/button/flags use original mouse-event construction'],'limits':['Original inlined event construction is factored through restored mouseEvent helper','Outer helper count<=10 validation remains independent adapter policy','Production Drag.swift now consumes original five-event construction; timing/cancellation policy remains an independent adapter boundary','No real input or application acceptance performed']}
(root/'reconstruction/click-factory-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Pinned click entry/count checks, two counter increments, midpoint and error tag verified')
