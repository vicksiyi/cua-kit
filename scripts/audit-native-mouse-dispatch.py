#!/usr/bin/env python3
"""Read-only audit of the pinned vendor Mach-O; never loads or executes it."""
from pathlib import Path
import argparse
import hashlib
import json
import struct

parser = argparse.ArgumentParser()
parser.add_argument('--binary', type=Path, default=Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'))
args = parser.parse_args()
data = args.binary.read_bytes()
expected = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'
if hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit('Unrecognized native build; re-audit protocol descriptors before updating pins')
segments = []
offset = 32
for _ in range(struct.unpack_from('<I', data, 16)[0]):
    command, size = struct.unpack_from('<II', data, offset)
    if command == 0x19:
        _, address, _, file_offset, file_size = struct.unpack_from('<16sQQQQ', data, offset + 8)
        segments.append((address, address + file_size, file_offset))
    offset += size

def read(address, size):
    for low, high, file_offset in segments:
        if low <= address and address + size <= high:
            return data[file_offset + address - low:file_offset + address - low + size]
    raise ValueError(hex(address))

# Source send(to:delay:) stamps each event immediately before postToPid.
calls = [(0x1006fcd7c, 0x100755a4c), (0x1006fd6a0, 0x100755a4c), (0x100741a28, 0x100260b44), (0x100742350, 0x10070fc2c), (0x100742490, 0x10070fc2c), (0x100741b60, 0x100718904), (0x100741bcc, 0x1006fa28c), (0x100072024, 0x100740624), (0x1007407b0, 0x10075044c), (0x1007408bc, 0x100732798), (0x100740ee4, 0x10074b40c), (0x10074b064, 0x10074b4c8), (0x10074b090, 0x10074b6f8), (0x10074b12c, 0x10074b7cc), (0x10074b5c0, 0x100732798), (0x10074b664, 0x100732798), (0x10074fd78, 0x10025b818), (0x1007504a8, 0x10074b88c), (0x1007504d8, 0x10074b1cc), (0x100750538, 0x10074b2f4), (0x10074afe0, 0x10074b40c), (0x10075135c, 0x100752874), (0x100751374, 0x1007531b0), (0x1007531cc, 0x100715d4c), (0x1007531f4, 0x1007526d0), (0x10075029c, 0x10075246c), (0x1007502b0, 0x10075128c), (0x1007503dc, 0x1007513e4), (0x100751484, 0x100715d4c), (0x1007514ec, 0x1007526d0), (0x10074a204, 0x100750594), (0x100750634, 0x10074ffcc), (0x10075063c, 0x10075027c), (0x10075005c, 0x10026d800), (0x100750070, 0x10026d7fc), (0x100740660, 0x100785018), (0x1007852d4, 0x1007858fc), (0x100753970, 0x1002581ac), (0x10075397c, 0x100258054),
         (0x100754904, 0x1002580d0), (0x100754914, 0x1002580d0),
         (0x1007549c8, 0x10026cc8c),
         (0x100754ab4, 0x100258288), (0x100754b00, 0x100257d88),
         (0x100754c90, 0x10026cc8c),
         (0x1006fc334, 0x1007a7790), (0x1006fc420, 0x100715974),
         (0x1006fc46c, 0x1007a7790),
         (0x100754414, 0x100730374), (0x1007305e0, 0x10026cc8c),
         (0x100730724, 0x10026cc8c),
         (0x100741398, 0x100754280), (0x100741430, 0x1007414c8),
         (0x1007416a8, 0x100754280), (0x1007417d8, 0x100754280),
         (0x10074ad3c, 0x100746338), (0x100745a8c, 0x100754280),
         (0x100745358, 0x100257e24), (0x100745384, 0x100257e24),
         (0x1007453c0, 0x100258054),
         (0x10077ea54, 0x101153af8), (0x10077ea64, 0x101153b40),
         (0x10077ecf4, 0x101153b1c), (0x10077ed10, 0x101153ae0),
         (0x10077ed24, 0x101153b10), (0x10077ed3c, 0x101153b28),
         (0x10073283c, 0x100732ad4), (0x100732868, 0x101153a80),
         (0x100732884, 0x1002583e8), (0x100732b28, 0x1002583e8),
         (0x100732b30, 0x101153a8c), (0x100732cbc, 0x1002583e8),
         (0x100745518, 0x10074553c), (0x1007455e0, 0x100257e24),
         (0x100741df4, 0x100732798), (0x100741eb0, 0x100732798),
         (0x100741f20, 0x10026cb84), (0x100741f28, 0x100740f70),
         (0x100742c34, 0x10026cba0), (0x100742c80, 0x1007453f8),
         (0x100742c90, 0x1007453f8),
         (0x10074f848, 0x100257e24), (0x10074f8a4, 0x10074f8e4),
         (0x10074f96c, 0x100257e24), (0x10074fbe0, 0x100258054),
         (0x10074dcf4, 0x1011554e4),
         (0x10074f244, 0x100257e24), (0x10074f254, 0x10026d860),
         (0x10074e2c4, 0x10074f130),
         (0x10074ef20, 0x1002581ac), (0x10074ef2c, 0x100258054),
         (0x10074f038, 0x1002581ac), (0x10074f044, 0x100258054),
         (0x10078e21c, 0x1007a7fa4), (0x10078e370, 0x10074ad50),
         (0x10074adb8, 0x1007a7e50),
         (0x10074e75c, 0x100715d4c), (0x10074e844, 0x10078e178),
         (0x10074e884, 0x10074c688),
         (0x10074f488, 0x100257e24),
         (0x10074c77c, 0x100257e24), (0x10074c7cc, 0x100257e24),
         (0x10074c994, 0x100257e24),
         (0x10074eac0, 0x1006ffa48), (0x1006ffc28, 0x1011554e4),
         (0x1006ffc84, 0x1011554e4),
         (0x1007504d8, 0x10074b1cc)]
for site, target in calls:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction >> 26 == 0b100101, hex(site)
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert site + displacement * 4 == target, hex(site)
# Source focus notification constants (mov w9, immediate).
for site, opcode in [(0x10072f568, 0x528002a9), (0x10072f6b8, 0x52880009), (0x10072f6f0, 0x52900009)]:
    assert struct.unpack('<I', read(site, 4))[0] == opcode, hex(site)
# Focus state writes: focus-only byte1, both belief bytes, cleanup both bytes.
assert read(0x100746338, 12).hex() == '2800805208040039c0035fd6'
assert read(0x100746344, 12).hex() == '2820805208000079c0035fd6'
assert read(0x100746350, 8).hex() == '1f000079c0035fd6'
# Safe-enforce callbacks: raw event types, subtype field and appearance values.
for site, opcode in [(0x100731114, 0x528001a9), (0x100731124, 0x52800269),
                     (0x100731134, 0x52800289), (0x100731190, 0x52800a69),
                     (0x10072f890, 0x528002c9), (0x10072f908, 0x528002e9)]:
    assert struct.unpack('<I', read(site, 4))[0] == opcode, hex(site)
# Safe-enforcement timing data and polling Duration immediate.
assert struct.unpack('<d', read(0x10115b8d8, 8))[0] == 0.05
assert struct.unpack('<d', read(0x101159db8, 8))[0] == 0.1
# Process-target keyboard tap uses the native static array, not all inputs.
assert struct.unpack('<Q', read(0x101571410 + 16, 8))[0] == 3
assert struct.unpack('<III', read(0x101571410 + 32, 12)) == (10, 11, 12)
# Restoration loop: same-layer windows before saved window, not every window.
for site, opcode in [(0x10074265c, 0x52800220),  # list options 0x11
                     (0x1007426bc, 0x6b0a019f),  # owner PID equality
                     (0x1007426cc, 0x6b0d019f)]: # matching layer
    assert struct.unpack('<I', read(site, 4))[0] == opcode, hex(site)
# Click monitor window field initializer and static event list.
assert struct.unpack("<I", read(0x100731148, 4))[0] == 0x52800669
# Packed placement/options.
assert struct.unpack('<Q', read(0x101572280, 8))[0] == 1
assert struct.unpack('<I', read(0x101572290, 4))[0] == 1
assert struct.unpack('<II', read(0x1011921b0, 8)) == (0, 1)
# Special focus process filter name and selector strings.
assert read(0x10136a956, len(b'initWithName:options:')) == b'initWithName:options:'
assert read(0x10136c8f8, len(b'runningProcessesWithFilter:')) == b'runningProcessesWithFilter:'
# ViewBridge focused-element retry constants.
assert struct.unpack("<I", read(0x1007529dc, 4))[0] == 0x52875300
assert struct.unpack("<I", read(0x100752f58, 4))[0] == 0xf100313f
# Per-registration preventer keyboard tap differs from activation monitor.
assert struct.unpack('<III', read(0x101571578, 12)) == (10, 11, 12)
assert struct.unpack('<II', read(0x1011727f0, 8)) == (1, 0)
# Process-notification private fields/subtypes, distinct from AX/window subtype.
for site, expected_bytes in [(0x100731178, '09088052'), (0x1007311d8, '29098052'),
                             (0x10072f5c8, '49008052'), (0x10072f728, '49209e52'),
                             (0x10074cc5c, '28534079'), (0x10074cd40, '68f94737'),
                             (0x10074cd44, '282740b9'), (0x10074cf88, '28008052'),
                             (0x10074cf8c, '28a70039')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Taken-focus predicate branches and route payload writes.
for site, expected_bytes in [(0x10074be2c, '95067837'), (0x10074be30, 'c00c0036'),
                             (0x10074be38, '1f01136b'), (0x10074bf04, '3f01136b'),
                             (0x10074c930, 'f57e60b3'), (0x10074c934, 'c97e60d3'),
                             (0x10074c950, '15a702a9'), (0x10074c954, '08730079')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Registered gained/lost selection excludes the intercepted logical owner.
for site, expected_bytes in [(0x10074d374, '1f01166b'), (0x10074d37c, '1f01136b'),
                             (0x10074d384, '69a34039'), (0x10074d390, '69834039'),
                             (0x10074d398, '691f40b9'), (0x10074d3a4, '1f01136b'),
                             (0x10074d3ac, '1f01166b'), (0x10074d3c0, '68834039'),
                             (0x10074d3c8, '681f40b9')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Callback bodies invoke optional gained/lost handlers and return absence.
for site, expected_bytes in [(0x10074ecac, '730000b4'), (0x10074ecb4, '60023fd6'),
                             (0x10074ecbc, 'e8179f1a'), (0x10074ed10, '730000b4'),
                             (0x10074ed18, '60023fd6'), (0x10074ed20, 'e8179f1a')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Changed-focus history copies complete old identity before writing new.
for site, expected_bytes in [(0x10074d23c, '680340f9'), (0x10074d240, '69134079'),
                             (0x10074d24c, '68c300f8'), (0x10074d258, '692b0079'),
                             (0x10074d264, '780300f9'), (0x10074d270, '73130079')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Intercepted-focus progress, physical endpoint retention and third-PID clear.
for site, expected_bytes in [(0x10074dd78, '68a34039'), (0x10074de88, '698341b8'),
                             (0x10074de94, '3f010a6b'), (0x10074de9c, '88110036'),
                             (0x10074dff8, '682740b9'), (0x10074dffc, '1f010a6b'),
                             (0x10074e0dc, '69a30039'), (0x10074e6f8, '7fff01a9'),
                             (0x10074e700, '68530079')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Focus ID field initializer, release SPI pointer slot and UInt32 checks.
for site, expected_bytes in [(0x10026c068, '08411491'), (0x10026d874, '01a942f9'),
                             (0x1007311c0, 'e9088052'), (0x10074f248, '800bf8b7'),
                             (0x10074f24c, '08fc60d3')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Direct release path is gated by first intercepted-focus observation.
for site, expected_bytes in [(0x10074e288, 'e83e0013'), (0x10074e294, '08b59f1a'),
                             (0x10074e2a0, '88000037'), (0x10074e2b8, '28070036')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# ViewBridge transition guards and identity flags (actual PID optional bit).
for site, expected_bytes in [(0x10074e2ac, 'a8087837'), (0x10074e3c0, '97f74736'),
                             (0x10074e3cc, '28f74736'), (0x10074e3ec, '20f60736'),
                             (0x1007513a4, '01ff60d3'), (0x1007513a8, '08109852'),
                             (0x1007513b0, '01791f33')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Refresh operation constructs taken then returned process notifications.
for site, expected_bytes in [(0x10074edfc, '08892091'), (0x10074ee34, 'e20313aa'),
                             (0x10074ee44, 'e60314aa'), (0x10074ef4c, '08992091'),
                             (0x10074ef58, '0601c079')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# ProcessType classifier and ViewBridge containing-process set (tags 1/0).
for site, expected_bytes in [(0x10078e20c, '21008052'), (0x10078e3cc, 'ff0a00f1'),
                             (0x10078e3d4, '1f030071'), (0x10078e3d8, '9703881a'),
                             (0x10078e530, '95000034'), (0x10078e534, '7f0a00f1')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
assert struct.unpack('<Q', read(0x1015722b0, 8))[0] == 2
assert read(0x1015722c0, 2) == bytes([1, 0])
assert read(0x10136afc8, len(b'isFinishedLaunching')) == b'isFinishedLaunching'
# Compensation: missing focused/containing element, prior registration, kind.
for site, expected_bytes in [(0x10074e79c, 'bad8ffb4'), (0x10074e85c, '080700b4'),
                             (0x10074e888, '20080036'), (0x10074e98c, '170e0034'),
                             (0x10074ec50, '9bfdff17')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Release-result byte initializes zero and updates only for ViewBridge flags.
for site, expected_bytes in [(0x10074b9e4, '1f980039'), (0x10074e600, '08209052'),
                             (0x10074e60c, '1f01296a'), (0x10074e610, '61000054'),
                             (0x10074e614, '68020012'), (0x10074e618, '685b0039')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# System notification tap: packed placement=1/options=0, NOT listen-only.
for site, expected_bytes in [(0x10074bc6c, '28008052'), (0x10074bc78, '49008052'),
                             (0x10074bc84, '081800f9'), (0x10074bc88, '0804a052'),
                             (0x100732ae0, '810a4629')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# New-front clears only a matching intercepted route, then tests release byte.
for site, expected_bytes in [(0x10074f4ac, '888f41b8'), (0x10074f4b0, '89434039'),
                             (0x10074f4bc, '1f01166b'), (0x10074f660, '9f7f00a9'),
                             (0x10074f668, '68530079'), (0x10074f66c, '685b4039'),
                             (0x10074f674, 'e1040054'), (0x10074f708, '1f0100f9')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Outer notification gate and checked unsigned subtype conversion.
for site, expected_bytes in [(0x10074c828, '770200b7'), (0x10074c82c, 'df02176b'),
                             (0x10074c830, '21020054'), (0x10074c7d0, '401bf8b7'),
                             (0x10074c7d4, '08fc50d3')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Unstructured refresh task uses inherited context flags; creation branches join.
for site, expected_bytes in [(0x1006ffb24, '18808352'), (0x1006ffb44, '18808352'),
                             (0x1006ffc64, '09000014')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Gained/lost task contexts copy complete registration payloads, including taps.
for site, expected_bytes in [(0x10074d82c, 'a0077bad'), (0x10074d830, '000401ad'),
                             (0x10074d838, '0010803d'), (0x10074d844, '0090843c'),
                             (0x10074db14, 'a0077bad'), (0x10074db18, '000401ad'),
                             (0x10074db20, '0010803d'), (0x10074db2c, '0090843c')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Registration record: PID, two handlers, keyboard tap, nil mouse taps, false flag.
for site, expected_bytes in [(0x1007504e0, 'f51300b9'), (0x1007504e4, 'f8df01a9'),
                             (0x1007504e8, 'f6cf02a9'), (0x1007504ec, 'e0ff03a9'),
                             (0x1007504f0, 'ff230139')]:
    assert read(site, 4).hex() == expected_bytes, hex(site)
# Default duration is stored as a signed 128-bit attosecond count.
assert int.from_bytes(read(0x1011950e0, 16), 'little', signed=True) == 50_000_000_000_000_000
# Duration.< comparison is followed by selection of max(requested, default).
assert struct.unpack('<I', read(0x1007b300c, 4))[0] == 0x9a951294
# Pin the increment getter, zero initializer, pair reuse, and per-click count.
assert read(0x101574978, 8) == bytes(8)
for site, opcode in [(0x1007547c0, 0xb1000409),
                     (0x100755bbc, 0xaa1803e6), (0x10075628c, 0xaa1803e6),
                     (0x100755bc0, 0xaa1903e7), (0x100756290, 0xaa1903e7)]:
    assert struct.unpack('<I', read(site, 4))[0] == opcode, hex(site)
print(json.dumps({'binarySha256': expected, 'calls': [
    {'site': hex(site), 'target': hex(target)} for site,target in calls],
    'defaultClickMilliseconds': 50,
    'clickNumber': 'zero-initialized process counter; down/up reuse x24; clickCount uses x25',
    'interpretation': 'setTimestamp precedes postToPid; mouse construction sets window fields and local location',
    'limits': 'Static call-site evidence; does not prove live app acceptance or complete send-loop parity.'}, indent=2))

# Menu event array: nine UInt32 CGEventTypes in constructor order.
assert struct.unpack("<Q", read(0x101572230, 8))[0] == 9
assert list(struct.unpack("<9I", read(0x101572240, 36))) == [1, 2, 6, 3, 4, 7, 25, 26, 27]

# Safe activation: nil/same foreground goes directly to enforcement.
assert read(0x10074195c, 4).hex() == "d30100b4"
assert read(0x100741988, 4).hex() == "61040054"
assert read(0x10074199c, 4).hex() == "75fdff97"

# Resolving NSRunningApplication PID: positive PID shortcut and sole-match gate.
assert read(0x10136b06e, len(b"isTerminated")) == b"isTerminated"
assert read(0x1013699db, len(b"executableURL")) == b"executableURL"
assert read(0x10136a931, len(b"initWithName:executablePath:options:")) == b"initWithName:executablePath:options:"

# Direct branch tail-jumps to the nonthrowing frontmost wait.
assert read(0x100741ca0, 4).hex() == "4631ff17"

# Activation point requests Optional<CGPoint> (symbolic reference + Sg).
assert read(0x10129edec, 8) == bytes.fromhex("028b331c00536700")
assert read(0x1011924f8, 7) == b"CGPoint"

# Catalyst flag literal and menu-button-only role branch used in click preparation.
assert read(0x101257cf0, 30) == b"_AXExhibitsMacCatalystBehavior"

# Nonprepared click ORs 0x100000; prepared click loads caller flags unchanged.
assert read(0x1006fcd28, 4).hex() == "0802a052"
assert read(0x1006fcd74, 4).hex() == "250108aa"
assert read(0x1006fd658, 4).hex() == "c50241f9"
