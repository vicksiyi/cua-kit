#!/usr/bin/env python3
"""Static original ApplicationRegistrySPI wrappers; no private SPI invocation."""
import contextlib, io, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
for site, target in [(0x10026d7f8, 0x101154020), (0x10026d7fc, 0x10115402c)]:
    assert struct.unpack('<I', r(site, 4))[0] == 0x14000000 | (((target - site) // 4) & 0x3ffffff)
for site, expected in [(0x10026d814, 0xf942a502), (0x10026d874, 0xf942a901),
                       (0x10026d8c8, 0xf942ad03), (0x10026d938, 0xf942bd02)]:
    assert struct.unpack('<I', r(site, 4))[0] == expected, hex(site)
print('ApplicationRegistrySPI public Carbon branches and shared7/8/9 + independent attention pointer slots verified')
