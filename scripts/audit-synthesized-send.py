#!/usr/bin/env python3
"""Static original send import/call audit; never execute vendor binary."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root=pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit=runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
def branch(address, link=True):
    word=struct.unpack('<I',audit['read'](address,4))[0]
    assert word & 0xfc000000 == (0x94000000 if link else 0x14000000)
    offset=word & 0x3ffffff
    if offset & 0x2000000: offset-=0x4000000
    return address+offset*4
calls={0x10075394c:0x10115015c,0x100753950:0x101150150,0x100753970:0x1002581ac,0x10075397c:0x100258054,0x100754380:0x10115015c,0x100754384:0x101150150,0x1007543a4:0x1002581ac,0x1007543b0:0x100258054,0x10075559c:0x10115015c,0x1007555a0:0x101150150,0x1007555c0:0x1002581ac,0x1007555cc:0x100258048,0x1007553f4:0x10115015c,0x1007553f8:0x101150150,0x100755418:0x1002581ac,0x100755424:0x100258054}
for site,target in calls.items(): assert branch(site)==target
assert struct.unpack('<I',audit['read'](0x1007555c8,4))[0] == 0x52800021 # mov w1,1 session tap
# Count-1 comparison and cset eq establish handler Bool=isLast.
assert struct.unpack('<I',audit['read'](0x10075417c,4))[0] == 0x1a9f17f8
# Captured event/PID closure tail-calls timestamp/post helper.
assert branch(0x100756708, False) == 0x10075539c
imports={}
for address,expected in [(0x10115015c,'_$s8Dispatch0A4TimeV3nowACyFZ'),(0x101150150,'_$s8Dispatch0A4TimeV17uptimeNanosecondss6UInt64Vvg')]:
    word,load,_=struct.unpack('<3I',audit['read'](address,12))
    assert word & 0x9f000000 == 0x90000000 and load & 0xffc00000 == 0xf9400000
    immediate=((word>>29)&3)|(((word>>5)&0x7ffff)<<2)
    if immediate & (1<<20): immediate-=1<<21
    pointer=(address&~4095)+immediate*4096+((load>>10)&4095)*8
    symbol=audit['pinned_imported_symbol'](pointer)
    assert symbol==expected
    imports[hex(address)]=symbol
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),'source':'native/macos/Sources/AccessibilitySupport/SynthesizedEventSend.swift','originalEntries':{'sync':'0x100754280','asyncDelay':'0x1007537e8','globalDelay':'0x100755440','handler':'0x100753e80'},'calls':{hex(k):hex(v) for k,v in calls.items()},'imports':imports,'limits':['Four original send entry signatures covered; live delivery and whole module behavior remain unaccepted','Dependency overload is an additional test boundary,not an original API','Default posting not executed in fixtures; static calls do not prove live delivery']}
(root/'reconstruction/synthesized-send-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Original sync/async timestamp imports and sixteen call sites and session tap1 verified')
