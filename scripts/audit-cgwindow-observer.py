#!/usr/bin/env python3
"""Static original observer layout/lifecycle audit, never launch vendor service."""
import contextlib, io, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
for site, expected in [(0x1002584ec, 0x52800401),  # allocation32
                       (0x100259750, 0xf9000a81),  # events at self+16
                       (0x100259a68, 0xf9000f68)]: # callback ID at self+24
    assert struct.unpack('<I', r(site, 4))[0] == expected, hex(site)
def call(site, target):
    assert struct.unpack('<I', r(site, 4))[0] == 0x94000000 | (((target - site) // 4) & 0x3ffffff), hex(site)
call(0x1002585d8, 0x100258860)  # remove callback before native unregister
call(0x100259a40, 0x1002587b0)  # registry entry created before notifications
call(0x1002598e0, 0x100256738)  # failed description checks/removes old dictionary entry
assert r(0x100259ac8, 4).hex() == 'e0023fd6'
assert r(0x100259afc, 4).hex() == '00013fd6'
assert r(0x100258658, 4).hex() == '20033fd6'
print('Pinned observer size/fields, registry and notification lifecycle sites verified')
