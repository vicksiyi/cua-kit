#!/usr/bin/env python3
"""Read-only static audit of original CGWindow.allWindows; no desktop query."""
import contextlib, io, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
def call(site, target):
    assert struct.unpack('<I', r(site, 4))[0] == 0x94000000 | (((target - site) // 4) & 0x3ffffff)
call(0x10025b904, 0x101153ed0)  # CopyWindowInfo
call(0x10025b954, 0x101150e10)  # whole NSArray conditional bridge
call(0x10025b9a8, 0x10025c488)  # map payload initializer
for site, target, register in [(0x10025b908, 0x10025ba34, 0), (0x10025b96c, 0x10025ba3c, 19)]:
    assert struct.unpack('<I', r(site, 4))[0] == 0xb4000000 | (((target - site) // 4) & 0x7ffff) << 5 | register
stub = 0x101150e10
adrp, ldr = struct.unpack('<II', r(stub, 8))
delta = ((adrp >> 5) & 0x7ffff) << 2 | ((adrp >> 29) & 3)
if delta & (1 << 20): delta -= 1 << 21
slot = (stub & ~4095) + delta * 4096 + ((ldr >> 10) & 4095) * 8
assert audit['pinned_imported_symbol'](slot) == '_$sSa10FoundationE34_conditionallyBridgeFromObjectiveC_6resultSbSo7NSArrayC_SayxGSgztFZ'
# Point lookup uses AppKit containment, height-minus-y, checked UInt32 and raw description lookup.
call(0x10025bb68, 0x10115414c)
call(0x10025bbac, 0x101153dc8)
call(0x10025bbe8, 0x10025c904)
assert struct.unpack('<I', r(0x10025bcd4, 4))[0] == 0x52800240  # raw desktop level key18
call(0x10025bcd8, 0x101153ec4)
for site, expected in [(0x10025bca0, 0xb9400680), (0x10025bcb4, 0xb9402a80),
                       (0x10025bcbc, 0x39414280), (0x10025b998, 0x52800b18)]:
    assert struct.unpack('<I', r(site, 4))[0] == expected
call(0x10025b8a8, 0x100260e0c)  # scale -> bestScreen
call(0x10025bd28, 0x100260e0c)  # screen -> bestScreen
call(0x100260e78, 0x101153e4c)  # preference intersects
call(0x100260f58, 0x101153e40)  # candidate intersection
call(0x100261020, 0x1002617bc)  # first maximum stage
print('CGWindow enumeration, point lookup calls and desktop-level key match pinned binary')
