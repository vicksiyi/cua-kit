#!/usr/bin/env python3
"""Pinned original focus/deactivation static audit, no vendor execution."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
read = audit['read']
def word(address): return struct.unpack('<I',read(address,4))[0]
# MOVZ w9 constants in three lazy optional initializers.
constants = {}
for name,address,value in [('processNotification',0x10072f568,21),('taken',0x10072f6b8,0x4000),('returned',0x10072f6f0,0x8000)]:
    instruction=word(address)
    assert instruction & 0xffe0001f == 0x52800009
    assert (instruction >> 5) & 0xffff == value
    constants[name]=value
# Original common failure path writes SynthesizedEvent.Error tag0.
for address in [0x100754500,0x1007546d0]: assert word(address)==0x3900003f
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),
        'entries':{'returned':'0x100754250','removed':'0x100754524','deactivated':'0x100754420'},
        'optionalConstants':constants,'failure':'SynthesizedEvent.Error.invalidParameter tag0',
        'sources':['native/macos/Sources/AccessibilitySupport/SynthesizedKeyFocusEvent.swift','native/macos/Sources/AccessibilitySupport/SynthesizedDeactivationEvent.swift'],
        'limits':['Allocation failure branch is statically matched, not forced in native runtime','Events are constructed and inspected without posting; no real focus or app deactivation asserted','Other event extension/module work and live acceptance remain open']}
(root/'reconstruction/focus-notifications-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Three original notification constants and two error-tag paths verified')
