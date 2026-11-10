#!/usr/bin/env python3
"""Pinned read-only activation builder audit; no original executable launch."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root=pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit=runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
def word(address): return struct.unpack('<I',audit['read'](address,4))[0]
def movz(address,register,value):
    instruction=word(address)
    assert instruction & 0xff80001f == 0x52800000 | register
    assert ((instruction>>5)&0xffff) << (16*((instruction>>21)&3)) == value
movz(0x1007303c0,8,0xc0000)
for address,register,value in [(0x1007303f4,2,13),(0x100730404,6,1),(0x1007304c4,6,1),(0x100730610,6,2)]:
    movz(address,register,value)
# All three native allocation-error exits use Error tag0.
for address in [0x100730784,0x100730818,0x100730848]: assert word(address)==0x3900003f
# Numeric zero-window branch skips the optional clicks, unlike generic mouseEvent.
assert word(0x100730448)&0xff00001f == 0x3400001c
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),
        'entry':'0x100754408','builder':'0x100730374',
        'source':'native/macos/Sources/AccessibilitySupport/SynthesizedActivationEvent.swift',
        'behavior':['AppKit-defined subtype1 notification first; flags0 for zero ID else0xc0000',
                    'Append clicks only for nonzero ID and both optional geometry/point present',
                    'Left down/up with fixed eventNumbers1/2, no global counter consumption',
                    'Unflipped local coordinates; all allocation errors invalidParameter'],
        'limits':['Common click construction delegates restored mouseEvent; original body is inlined',
                  'Allocation errors verified statically, not induced at runtime',
                  'No event posting; actual activation/click delivery remains unaccepted']}
(root/'reconstruction/app-activation-event-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Pinned activation flags, fixed event numbers, zero-window gate and error tags verified')
