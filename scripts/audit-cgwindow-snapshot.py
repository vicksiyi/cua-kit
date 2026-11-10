#!/usr/bin/env python3
"""Pinned static CGWindow snapshot audit; no native capture is executed."""
import contextlib, io, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
def call(site, target):
    assert struct.unpack('<I', r(site, 4))[0] == 0x94000000 | (((target - site) // 4) & 0x3ffffff), hex(site)
for site, target in [(0x10025af0c, 0x101153e1c), (0x10025afc0, 0x101153dc8),
                     (0x10025af44, 0x100260e0c), (0x10025afdc, 0x100260e0c)]:
    call(site, target)
for site, expected in [(0x10025af74, 0x1e66400d), (0x10025b008, 0x1e664000),
                       (0x10025aec0, 0xd2800001), (0x10025aec4, 0xd2800002)]:
    assert struct.unpack('<I', r(site, 4))[0] == expected, hex(site)
for offset, expected in [(0xf18, 'getShareableContentWithCompletionHandler:'),
                         (0xa78, 'initWithDesktopIndependentWindow:'),
                         (0xcf8, 'setIgnoreShadowsSingleWindow:'),
                         (0xcf0, 'setIgnoreShadowsDisplay:'),
                         (0xdc8, 'setWidth:'), (0xce8, 'setHeight:'),
                         (0xef8, 'captureImageWithFilter:configuration:completionHandler:')]:
    word = struct.unpack('<Q', r(0x101542000 + offset, 8))[0]
    address = 0x100000000 + (word & 0xffffffff)
    assert r(address, len(expected) + 1) == expected.encode() + b'\0'
for site, target, register in [(0x10025b76c, 0x10025b7c0, 20), (0x10025b7c0, 0x10025b7ec, 21)]:
    assert struct.unpack('<I', r(site, 4))[0] == 0xb4000000 | (((target - site) // 4) & 0x7ffff) << 5 | register
assert r(0x10025b7ec, 4).hex() == '200020d4'
print('CGWindow snapshot scale/rounding, generic executor, SDK selectors and error/nil gates match pinned binary')
