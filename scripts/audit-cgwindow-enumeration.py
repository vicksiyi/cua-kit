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
print('CGWindow CopyWindowInfo, whole-array conditional bridge, map and nil gates match pinned binary')
