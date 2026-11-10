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
for descriptor, names in [(0x1012c1e4c, ['windowIDs', 'events', 'bufferingPolicy']),
                          (0x1012c1e74, ['stream', 'observer', 'iterator'])]:
    reference = descriptor + 16
    fields = reference + struct.unpack('<i', r(reference, 4))[0]
    assert struct.unpack('<I', r(fields + 12, 4))[0] == len(names)
    for index, name in enumerate(names):
        reference = fields + 16 + index * 12 + 8
        address = reference + struct.unpack('<i', r(reference, 4))[0]
        assert r(address, len(name) + 1) == name.encode() + b'\0'
for site, target in [(0x100258c70, 0x10115108c), (0x100258ca8, 0x1011510ec),
                     (0x100258d20, 0x100259710), (0x100258e68, 0x1011510c8)]:
    call(site, target)
for stub, expected in [
    (0x10115108c, '_$sScS10makeStream2of15bufferingPolicyScSyxG6stream_ScS12ContinuationVyx_G12continuationtxm_AG09BufferingE0Oyx__GtFZ'),
    (0x1011510ec, '_$sScS17makeAsyncIteratorScS0C0Vyx_GyF'),
    (0x1011510c8, '_$sScS12ContinuationV5yieldyAB11YieldResultOyx__GxnF'),
]:
    adrp, ldr = struct.unpack('<II', r(stub, 8))
    delta = ((adrp >> 5) & 0x7ffff) << 2 | ((adrp >> 29) & 3)
    if delta & (1 << 20): delta -= 1 << 21
    slot = (stub & ~4095) + delta * 4096 + ((ldr >> 10) & 4095) * 8
    assert audit['pinned_imported_symbol'](slot) == expected
print('Pinned observer lifecycle, EventStream field descriptors and standard-library calls verified')
