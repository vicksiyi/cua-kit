#!/usr/bin/env python3
"""Read-only pinned Mach-O check for associated-window conversion semantics."""
import contextlib
import io
import pathlib
import runpy
import struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
read = audit['read']
assert audit['pinned_imported_symbol'](0x10151ee98) == '_OBJC_CLASS_$_NSNumber'
selector = struct.unpack('<Q', read(0x101542e58, 8))[0]
address = 0x100000000 + (selector & 0xffffffff)
assert read(address, 17) == b'unsignedIntValue\0'
for stub, expected in [
    (0x10114e7b8, '_$s10Foundation25NSFastEnumerationIteratorVMa'),
    (0x101151a94, '_$sSo7NSArrayC10FoundationE12makeIteratorAC017NSFastEnumerationD0VyF'),
    (0x101151d4c, '_$sSt4next7ElementQzSgyFTj'),
]:
    adrp, ldr = struct.unpack('<II', read(stub, 8))
    delta = ((adrp >> 5) & 0x7ffff) << 2 | ((adrp >> 29) & 3)
    if delta & (1 << 20): delta -= 1 << 21
    slot = (stub & ~4095) + delta * 4096 + ((ldr >> 10) & 4095) * 8
    assert audit['pinned_imported_symbol'](slot) == expected
assert struct.unpack('<I', read(0x10026d1fc, 4))[0] == 0xb9002114  # store low UInt32
print('Associated-window NSArray iterator, NSNumber cast target and unsignedIntValue match pinned binary')
