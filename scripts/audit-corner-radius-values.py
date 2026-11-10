#!/usr/bin/env python3
"""Pinned static numeric-branch audit; never executes vendor code."""
import contextlib, io, math, pathlib, random, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
# CGFloat(truncating: NSNumber) imported by original conversion call.
stub = 0x10114f004
adrp, ldr = struct.unpack('<II', r(stub, 8))
delta = ((adrp >> 5) & 0x7ffff) << 2 | ((adrp >> 29) & 3)
if delta & (1 << 20): delta -= 1 << 21
slot = (stub & ~4095) + delta * 4096 + ((ldr >> 10) & 4095) * 8
assert audit['pinned_imported_symbol'](slot) == '_$s12CoreGraphics7CGFloatV10FoundationE10truncatingACSo8NSNumberCh_tcfC'
# Verify critical condition instructions before interpreting their NZCV sequence.
assert struct.unpack('<I', r(0x10026d5b0, 4))[0] == (0x54000001 | (((0x10026d514 - 0x10026d5b0) // 4) & 0x7ffff) << 5)  # b.ne skip
mask = (1 << 64) - 1
sign = 1 << 63
def compare(a, b):
    result = (a - b) & mask
    return (bool(result & sign), result == 0, a >= b, bool((a ^ b) & (a ^ result) & sign))
def native_accept(bits):
    absolute = bits & (sign - 1)
    x9 = ((absolute - (1 << 52)) & mask) >> 53
    added = (bits + 1) & mask
    n, z, c, v = bool(added & sign), added == 0, bits == mask, bool((~(bits ^ 1) & (bits ^ added)) & sign)
    n, z, c, v = compare(x9, 1023) if not z and n == v else (False, False, True, False)
    n, z, c, v = compare((bits - 1) & mask, (1 << 52) - 1) if c else (False, False, False, False)
    n, z, c, v = compare(absolute, 0) if c else (False, True, False, False)
    return z
samples = [0, sign, 1, sign | 1, (1 << 52) - 1, 1 << 52, 0x7fefffffffffffff,
           0x7ff0000000000000, 0xfff0000000000000, 0x7ff8000000000000, mask]
rng = random.Random(0)
samples += [rng.getrandbits(64) for _ in range(4096)]
for bits in samples:
    value = struct.unpack('<d', struct.pack('<Q', bits))[0]
    assert native_accept(bits) == (math.isfinite(value) and value >= 0), hex(bits)
print('Pinned CGFloat bridge and NZCV filter interpretation passed for 4107 bit patterns; no native execution')
