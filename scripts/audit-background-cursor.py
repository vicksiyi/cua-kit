#!/usr/bin/env python3
"""Static operand audit only: no native process is launched or attached."""
import contextlib
import io
import pathlib
import runpy
import struct

root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
read = audit['read']
encoded = read(0x10155aa90, 22)
assert bytes(value ^ 0x54 for value in encoded) == b'SetsCursorInBackground'
assert struct.unpack('<I', read(0x10026cd9c, 4))[0] == 0x92400260  # and x0,x19,#1
assert struct.unpack('<4I', read(0x10026ce8c, 16)) == (0xaa1403e0, 0xaa1403e1, 0xaa1503e2, 0xaa1303e3)
for stub, expected in [
    (0x1011513bc, '_$sSi10FoundationE19_bridgeToObjectiveCSo8NSNumberCyF'),
    (0x10115096c, '_$sSS18_fromUTF8RepairingySS6result_Sb11repairsMadetSRys5UInt8VGFZ'),
    (0x1011507e0, '_$sSS10FoundationE19_bridgeToObjectiveCSo8NSStringCyF'),
]:
    adrp, ldr = struct.unpack('<II', read(stub, 8))
    delta = ((adrp >> 5) & 0x7ffff) << 2 | ((adrp >> 29) & 3)
    if delta & (1 << 20): delta -= 1 << 21
    slot = (stub & ~4095) + delta * 4096 + ((ldr >> 10) & 4095) * 8
    assert audit['pinned_imported_symbol'](slot) == expected
print('Background cursor property bytes and Int/String bridge imports match pinned binary')
