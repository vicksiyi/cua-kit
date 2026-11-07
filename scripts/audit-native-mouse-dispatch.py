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
fixup_offset = None
offset = 32
for _ in range(struct.unpack_from('<I', data, 16)[0]):
    command, size = struct.unpack_from('<II', data, offset)
    if command == 0x80000034:
        fixup_offset = struct.unpack_from("<I", data, offset + 8)[0]
    if command == 0x19:
        _, address, _, file_offset, file_size = struct.unpack_from('<16sQQQQ', data, offset + 8)
        segments.append((address, address + file_size, file_offset))
    offset += size

def read(address, size):
    for low, high, file_offset in segments:
        if low <= address and address + size <= high:
            return data[file_offset + address - low:file_offset + address - low + size]
    raise ValueError(hex(address))

def pinned_imported_symbol(address):
    # This pinned image uses 24-bit ordinals and DYLD_CHAINED_IMPORT records.
    # Resolve the bind itself: a nearby string literal does not prove equality.
    assert fixup_offset is not None
    version, _, imports, symbols, count, import_format, symbol_format = struct.unpack_from('<7I', data, fixup_offset)
    assert version == 0 and import_format == 1 and symbol_format == 0
    pointer = struct.unpack('<Q', read(address, 8))[0]
    assert pointer >> 63 == 1
    ordinal = pointer & 0xffffff
    assert ordinal < count
    record = struct.unpack_from('<I', data, fixup_offset + imports + ordinal * 4)[0]
    start = fixup_offset + symbols + (record >> 9)
    return data[start:data.index(b'\0', start)].decode()

assert pinned_imported_symbol(0x101466488) == '_$sSS9hasPrefixySbSSF'
assert pinned_imported_symbol(0x101467f90) == '_$ss27_stringCompareWithSmolCheck__9expectingSbs11_StringGutsV_ADs01_G16ComparisonResultOtF'

# Source send(to:delay:) stamps each event immediately before postToPid.
calls = [(0x10006dfa0, 0x1006ecab8), (0x10006dff0, 0x1006f9f30), (0x10006ded4, 0x10026d7f8), (0x10006def0, 0x10026d924), (0x10006e9e8, 0x10026d7f8), (0x10006ea04, 0x10026d924), (0x10026da88, 0x100248374), (0x1007ab300, 0x1007a7fa4), (0x100721e44, 0x10071e390), (0x10071e438, 0x10076589c), (0x1007b8a34, 0x10072dd08), (0x1007b8a48, 0x10072dd08), (0x10072f048, 0x10072dd08), (0x1007259d4, 0x100725a5c), (0x100725a6c, 0x1006f9f30), (0x100725a78, 0x1006fa28c), (0x100725a8c, 0x10025b8e8), (0x10025b904, 0x101153ed0), (0x10006cf58, 0x1006fa28c), (0x10006d080, 0x100085a68), (0x100085be4, 0x100085c24), (0x10006cc34, 0x1007161c4), (0x10006ccc0, 0x100085730), (0x10006cd1c, 0x1007a7ea0), (0x10006ce0c, 0x101154b18), (0x10006ce3c, 0x1007a80f0), (0x10006ce44, 0x1007b8ba8), (0x10006d21c, 0x1007a7ea0), (0x10006d224, 0x1000631d8), (0x10006ea38, 0x100787d8c), (0x10006e228, 0x100086380), (0x1000864b8, 0x1000861c4), (0x1000862e0, 0x1006fabe8), (0x10006e700, 0x100787d8c), (0x10006e11c, 0x100788fac), (0x10006de1c, 0x10077e30c), (0x10006de70, 0x1000858c0), (0x10006dea8, 0x100788190), (0x10006ea88, 0x1007258fc), (0x100085960, 0x1007258fc), (0x100085a3c, 0x100787d8c), (0x10006d660, 0x1006eac60), (0x10006d670, 0x1006eb2bc), (0x10006d680, 0x1006eb350), (0x10006d690, 0x1006eafe0), (0x10006d6a0, 0x1006eacf8), (0x10006d6b0, 0x1006ead90), (0x10006d7a4, 0x1006ec20c), (0x1006ec32c, 0x1006ecab8), (0x1006ec9e8, 0x1011556a0), (0x1006ed6e4, 0x1011556dc), (0x1006ed808, 0x1006ed670), (0x1006ed5e0, 0x1006ed4a0), (0x1006ed460, 0x101153ae0), (0x1006ed570, 0x101153b04), (0x1006ed1d4, 0x101153858), (0x1006ecd88, 0x1006ecdc4), (0x1006ecfb4, 0x1006ed1a0), (0x1006ed0c4, 0x1006ed1a0), (0x1006ed178, 0x1006ed1a0), (0x1006ed330, 0x1006f3f84), (0x1006ec114, 0x101153840), (0x1006ecb08, 0x101153834), (0x100788628, 0x100718904), (0x10078866c, 0x1006fa28c), (0x1007888c8, 0x10078ce74), (0x100788c68, 0x100733c14), (0x100788218, 0x10115114c), (0x1007882e0, 0x10025b818), (0x100788314, 0x1006ee220), (0x100788390, 0x1001803c8), (0x100788464, 0x100788d60), (0x100789ee4, 0x10078c8d0), (0x10078a050, 0x100259184), (0x100734338, 0x1006f9a40), (0x100734318, 0x100728f34), (0x10078b4ec, 0x10025853c), (0x10078b55c, 0x100733c14), (0x10078ce90, 0x101153edc), (0x10078ae24, 0x100260b44), (0x10078aef8, 0x100718904), (0x100258e68, 0x1011510c8), (0x100258c70, 0x10115108c), (0x100258ca8, 0x1011510ec), (0x10025aa10, 0x101154cbc), (0x10025a98c, 0x10026e210), (0x10025aa24, 0x10025c904), (0x100258554, 0x100259710), (0x100259a40, 0x1002587b0), (0x1002585d8, 0x100258860), (0x1007891f0, 0x100259bf0), (0x100789214, 0x100259bdc), (0x1007893bc, 0x100259184), (0x10078903c, 0x100789058), (0x10078809c, 0x10115114c), (0x1007880c8, 0x10115114c), (0x100788fe8, 0x10115114c), (0x1007161e8, 0x100718904), (0x100716200, 0x1007184c0), (0x100716218, 0x1007180a0), (0x100072c54, 0x100788060), (0x100758d00, 0x1006f62b8), (0x100758db4, 0x1006f5b8c), (0x1007b6358, 0x1007a7ea0), (0x10077d3b4, 0x10114ec80), (0x10077d3bc, 0x10114ec5c), (0x10077d3c8, 0x10114eb54), (0x10077d414, 0x10114ec5c), (0x10077d420, 0x10114eb54), (0x100701ef4, 0x10077d320), (0x100704ff0, 0x1007b62d4), (0x1007017a8, 0x100740624), (0x100701838, 0x100740f70), (0x1007019b4, 0x100745848), (0x100701988, 0x1006f74e4), (0x100701704, 0x101152ff4), (0x100701d14, 0x101152ff4), (0x100701d4c, 0x101152ff4), (0x100701d70, 0x101150b34), (0x100701dd0, 0x1006ffa48), (0x100700374, 0x101150b34), (0x1007003b8, 0x101152ff4), (0x1007061e0, 0x101150b34), (0x100701a48, 0x101152ff4), (0x100701a80, 0x101152ff4), (0x100701ab8, 0x101152ff4), (0x100701b04, 0x101152ff4), (0x1007004c4, 0x1007019f8), (0x100700494, 0x100703360), (0x1007004a4, 0x100700d78), (0x1007004b8, 0x1007036a8), (0x10070050c, 0x100703360), (0x100700518, 0x100701b4c), (0x10070052c, 0x1007036a8), (0x1007005f0, 0x100701e04), (0x100700600, 0x1007030f4), (0x100072474, 0x1007161c4), (0x10007249c, 0x1007000cc), (0x1000724d8, 0x100789008), (0x100700908, 0x1007036a8), (0x100700ba4, 0x1006f74e4), (0x1007008ec, 0x100705020), (0x100703418, 0x1007b72a0), (0x10070348c, 0x1007046e4), (0x10070375c, 0x1007b72a0), (0x1007037a4, 0x100704510), (0x1007039a8, 0x1007046e4), (0x100700110, 0x1006f9d8c), (0x100700828, 0x10070083c), (0x100700c88, 0x10070083c), (0x1007011e8, 0x1006f74e4), (0x100082124, 0x100086068), (0x100082138, 0x101153edc), (0x100082158, 0x101153a08), (0x100082174, 0x101153a20), (0x1000860b8, 0x100085318), (0x1000857b8, 0x1006fa28c), (0x10072dd2c, 0x1006fa28c), (0x1007b1f94, 0x100705f84), (0x1006fcf44, 0x100258054), (0x10025b830, 0x10025c904), (0x100706230, 0x100706864), (0x1007062cc, 0x1007a7f4c), (0x10070630c, 0x10025ba5c), (0x1007063a4, 0x101153900), (0x100706488, 0x10074ad50), (0x1007064a4, 0x10070694c), (0x1007064e0, 0x10079d310), (0x10070655c, 0x1006f7a90), (0x1007066ac, 0x100706864), (0x100706764, 0x10025b818), (0x1007069e8, 0x1007a7fa4), (0x100706afc, 0x10074ad50), (0x100706b30, 0x1007a7f4c), (0x10025c958, 0x1011539fc), (0x10025c960, 0x101153ee8), (0x10025c9e8, 0x10025c488), (0x10025bb68, 0x10115414c), (0x10025bbac, 0x101153dc8), (0x10025bbe8, 0x10025c904), (0x100705fe4, 0x1006f9d8c), (0x10070601c, 0x1007a7e50), (0x1007060b8, 0x1007a7ea0), (0x100706888, 0x100706df0), (0x1007068e0, 0x100706fa4), (0x100706fe4, 0x1007a7fa4), (0x10070705c, 0x1007072b4), (0x1007072c4, 0x1007a7f4c), (0x100706e84, 0x10078e178), (0x100705c90, 0x100705e5c), (0x100705cc0, 0x100707390), (0x100705e1c, 0x100705f84), (0x1007073a4, 0x1006f7a90), (0x1006fcd7c, 0x100755a4c), (0x1006fd6a0, 0x100755a4c), (0x100741a28, 0x100260b44), (0x100742350, 0x10070fc2c), (0x100742490, 0x10070fc2c), (0x100741b60, 0x100718904), (0x100741bcc, 0x1006fa28c), (0x100072024, 0x100740624), (0x1007407b0, 0x10075044c), (0x1007408bc, 0x100732798), (0x100740ee4, 0x10074b40c), (0x10074b064, 0x10074b4c8), (0x10074b090, 0x10074b6f8), (0x10074b12c, 0x10074b7cc), (0x10074b5c0, 0x100732798), (0x10074b664, 0x100732798), (0x10074fd78, 0x10025b818), (0x1007504a8, 0x10074b88c), (0x1007504d8, 0x10074b1cc), (0x100750538, 0x10074b2f4), (0x10074afe0, 0x10074b40c), (0x10075135c, 0x100752874), (0x100751374, 0x1007531b0), (0x1007531cc, 0x100715d4c), (0x1007531f4, 0x1007526d0), (0x10075029c, 0x10075246c), (0x1007502b0, 0x10075128c), (0x1007503dc, 0x1007513e4), (0x100751484, 0x100715d4c), (0x1007514ec, 0x1007526d0), (0x10074a204, 0x100750594), (0x100750634, 0x10074ffcc), (0x10075063c, 0x10075027c), (0x10075005c, 0x10026d800), (0x100750070, 0x10026d7fc), (0x100740660, 0x100785018), (0x1007852d4, 0x1007858fc), (0x100753970, 0x1002581ac), (0x10075397c, 0x100258054),
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

# Out-of-process target classifier: regular/view-service array and exit gates.
assert struct.unpack("<Q", read(0x1015715a0, 8))[0] == 2
assert read(0x1015715b0, 2) == bytes([1, 0])
assert read(0x100706eac, 4).hex() == "75000034"
assert read(0x100706eb0, 4).hex() == "9f02166b"
assert read(0x100706eb4, 4).hex() == "e1060054"

# No-hit special case uses the Atlas prefix; imported function verified above.
assert read(0x1012494f0, 16) == b"com.openai.atlas"

# AppKit window lookup selector used after screen-relative y conversion.
assert read(0x10136ebb7, len(b"windowNumberAtPoint:belowWindowWithWindowNumber:")) == b"windowNumberAtPoint:belowWindowWithWindowNumber:"

# All completed mouse target routes initialize flipped coordinates to false.
assert struct.unpack("<I", read(0x100706808, 4))[0] == 0x3902029f

# Controller orderedWindows reads only onscreen/non-desktop IDs relative to 0.
assert struct.unpack("<II", read(0x100082130, 8)) == (0x52800220, 0x52800001)

# Native AX enablement attributes; lifecycle remains an explicit gap.
assert read(0x101257cb0, len(b"AXManualAccessibility")) == b"AXManualAccessibility"
assert read(0x101257cd0, len(b"AXEnhancedUserInterface")) == b"AXEnhancedUserInterface"

# Assertion.Kind declaration order, including the often-missed third kind.
for record, name in [(0x10132305c, b"enableElectronAccessibility"),
                     (0x101323068, b"enableEnhancedUserInterface"),
                     (0x101323074, b"enableVoiceOverOnPreference")]:
    name_ref = record + 8
    target = name_ref + struct.unpack("<i", read(name_ref, 4))[0]
    assert read(target, len(name)) == name
# Acquisition returns oldCount == 0; final release removes the key and returns 1.
assert struct.unpack("<II", read(0x10070367c, 8)) == (0xf100027f, 0x1a9f17e0)
assert struct.unpack("<I", read(0x1007037b8, 4))[0] == 0x52800020

# Assertion is disabled before either explicit/deinit cleanup call.
assert struct.unpack("<I", read(0x100700808, 4))[0] == 0x3902029f
assert struct.unpack("<I", read(0x100700c68, 4))[0] == 0x3902027f
# Last VoiceOver-preference release checks actual VoiceOver app presence,
# writes only this preference in this suite, then posts this notification.
for address, value in [(0x1012569d0, b"com.apple.VoiceOver"),
                       (0x1012569f0, b"com.apple.universalaccess"),
                       (0x101256a10, b"voiceOverOnOffKey"),
                       (0x101256a30, b"com.apple.universalaccess.VoiceOverSettingsDidChange")]:
    assert read(address, len(value)) == value
assert struct.unpack("<I", read(0x10070518c, 4))[0] == 0x52800002

# Third-kind policy tail-calls String.hasPrefix for Atlas.
instruction = struct.unpack('<I', read(0x100701b48, 4))[0]
assert instruction >> 26 == 0b000101
branch = instruction & 0x3ffffff
if branch & 0x2000000: branch -= 0x4000000
assert 0x100701b48 + branch * 4 == 0x101150b34

# Enhanced UI uses a Date wall clock and a one-second inclusive active wait.
assert pinned_imported_symbol(0x1014633a0) == '_$s10Foundation4DateVACycfC'
assert pinned_imported_symbol(0x101463388) == '_$s10Foundation4DateV3nowACvgZ'
assert pinned_imported_symbol(0x101463298) == '_$s10Foundation4DateV17timeIntervalSinceySdACF'
assert read(0x1007018a4, 4).hex() == '0a106e1e'  # fmov d10, #1.0
# Browser reset capture -> async body, then ContinuousClock 100ms sleep.
assert 0x101193aa8 + struct.unpack('<i', read(0x101193aa8, 4))[0] == 0x10070593c
assert pinned_imported_symbol(0x101469750) == '_$ss15ContinuousClockVMa'
assert pinned_imported_symbol(0x101469880) == '_$ss5ClockPss010ContinuousA0VRszrlE10continuousADvgZ'
assert read(0x100703a7c, 12).hex() == '48b1abd208afc8f2682ce0f2'  # 1e17 attoseconds
assert struct.unpack('<I', read(0x100701c6c, 4))[0] == 0x52800022  # set true
assert struct.unpack('<I', read(0x100703b7c, 4))[0] == 0x52800002  # delayed set false

# Initialization waits 100000 microseconds, then polls a WebArea descendant.
assert struct.unpack('<II', read(0x100701e90, 8)) == (0x5290d400, 0x72a00020)
assert struct.unpack('<d', read(0x10115b8d8, 8))[0] == 0.05
assert read(0x100701eec, 4).hex() == '00106e1e'  # timeout 1.0
assert struct.unpack('<I', read(0x100702048, 4))[0] == 0x52800020  # success
assert struct.unpack('<I', read(0x100702090, 4))[0] == 0x52800000  # absent/error

# Synchronous polling uses Date metadata and the same Date now/interval imports.
assert pinned_imported_symbol(0x1014633a8) == '_$s10Foundation4DateVMa'
assert struct.unpack('<I', read(0x10077d3e4, 4))[0] == 0x540002c8  # b.hi timeout
assert struct.unpack('<I', read(0x10077d438, 4))[0] == 0x54fffdc9  # b.ls retry
poll_case_name_ref = 0x101323ce4 + 16 + 8
poll_case_name = poll_case_name_ref + struct.unpack('<i', read(poll_case_name_ref, 4))[0]
assert read(poll_case_name, len(b'timeoutReached')) == b'timeoutReached'

# Descendant search starts with ordinary children, pops from the deque front,
# and appends descendants at start + current count (breadth-first).
assert struct.unpack('<I', read(0x1007b62cc, 4))[0] == 0x52800020  # default predicate true
assert read(0x1007b6478, 8).hex() == '691240f9280500b1'
assert read(0x1007b6e58, 8).hex() == '881340f90d010b8b'
# WebAreaUIElement static role initializer loads UIElementRole.webArea and
# stores it as its non-nil role, rather than a title/name heuristic.
assert read(0x10072c2a4, 16).hex() == 'e87400d008e13c91000140f9e87400d0'

# Window eligibility directly reads one raw AX child (not UIElement cache).
assert read(0x100758cf0, 16).hex() == '010080d222008052030080d224008052'

# Primary fallback reads the final 32-byte window entry: base + count*32,
# followed by load at offset zero (the array header is itself 32 bytes).
assert read(0x100716224, 8).hex() == '0814088b135140a9'
# Deactivation invokes the assertion's disable slot before setting it to nil.
assert read(0x100072b84, 4).hex() == 'e0023fd6'
assert read(0x100072ba0, 4).hex() == 'df6a35f8'

# WindowOrderingObserver cancellation is Task.cancel under its unfair lock.
assert pinned_imported_symbol(0x101469578) == '_$sScT6cancelyyF'
assert read(0x1007880a4, 4).hex() == '7f0e00f9'  # clear main task
assert read(0x1007880d0, 4).hex() == '7f1200f9'  # clear menu task
assert read(0x100788ff0, 4).hex() == '7f1200f9'  # menu close clears only menu

# WindowServerEvent raw values and matching reflected case names.
window_event_names = ['isObscured', 'isUnobscured', 'isOrderedIn', 'isOrderedOut',
    'isTerminated', 'isChangingScreens', 'didMove', 'didResize', 'didChangeOrder',
    'geometryDidChange', 'monitorDataPending', 'didCreate', 'rightsGrantOffered',
    'rightsGrantCompleted', 'recordForTermination', 'isVisible', 'isInvisible',
    'workspaceAddWindow', 'workspaceRemoveWindow', 'workspaceCreated', 'workspaceDestroyed']
assert struct.unpack('<I', read(0x10131bb78 + 12, 4))[0] == len(window_event_names)
assert list(struct.unpack('<21I', read(0x10116c6bc, 84))) == list(range(800, 817)) + list(range(1325, 1329))
for index, name in enumerate(window_event_names):
    reference = 0x10131bb78 + 16 + index * 12 + 8
    address = reference + struct.unpack('<i', read(reference, 4))[0]
    assert read(address, len(name)) == name.encode()
# Primary SPI binding slots 1/2/3: 0x10155b518, 520, 528.
assert read(0x10026bb84, 4).hex() == '048d42f9'
assert read(0x10026bc78, 4).hex() == '049142f9'
assert read(0x10026bbf4, 4).hex() == '039542f9'

# Observer initialization registers all events, ignores CGError and then
# requests the original window array; cleanup removes registry entry first.
assert read(0x100259ac8, 4).hex() == 'e0023fd6'  # register callback invocation
assert read(0x100259afc, 4).hex() == '00013fd6'  # request windows invocation
assert read(0x100258658, 4).hex() == '20033fd6'  # removal invocation

# Registry starts with zero counter. Unsigned checked increment is stored
# before insertion; the newly allocated ID is returned after insertion.
assert read(0x100258990, 4).hex() == '1f5001a9'
assert read(0x1002587d4, 8).hex() == '180500b122040054'
assert read(0x1002587f0, 4).hex() == '180000f9'
assert read(0x100258838, 4).hex() == 'd80200f9'

# Native callback trampoline drops the payload length in favor of context;
# payload's first UInt32 is the window ID, read before registry lookup.
assert read(0x1002589ac, 4).hex() == 'e20303aa'
assert read(0x10025a9a8, 4).hex() == '970240b9'
# Registry snapshot is unlocked before fresh window lookup/handler execution.
assert read(0x10025ab88, 4).hex() == '00033fd6'

# EventStream and iterator storage fields, including retained stream/observer.
for descriptor, expected_fields in [(0x1012c1e4c, ['windowIDs', 'events', 'bufferingPolicy']),
                                     (0x1012c1e74, ['stream', 'observer', 'iterator'])]:
    reference = descriptor + 16
    fields = reference + struct.unpack('<i', read(reference, 4))[0]
    assert struct.unpack('<I', read(fields + 12, 4))[0] == len(expected_fields)
    for index, name in enumerate(expected_fields):
        reference = fields + 16 + index * 12 + 8
        address = reference + struct.unpack('<i', read(reference, 4))[0]
        assert read(address, len(name)) == name.encode()

# Main ordering subscription has one event, enum declaration tag 8, and
# bufferingNewest(1), verified through the imported enum-case metadata.
assert pinned_imported_symbol(0x1014694d8) == '_$sScS12ContinuationV15BufferingPolicyO15bufferingNewestyADyx__GSicAFmlFWC'
assert struct.unpack('<Q', read(0x1015723e8 + 16, 8))[0] == 1
assert read(0x1015723e8 + 32, 1) == bytes([8])
assert read(0x100789374, 4).hex() == '28008052'  # capacity 1

# Temporary restoration observer listens to workspaceAddWindow (tag 17).
assert struct.unpack('<Q', read(0x1015723b8 + 16, 8))[0] == 1
assert read(0x1015723b8 + 32, 1) == bytes([17])
# Callback release-store / pre-raise acquire-load and ContinuousClock 5ms.
assert read(0x10078cf5c, 4).hex() == '08fc9f08'
assert read(0x10078b500, 4).hex() == '08c1bf38'
duration_words = struct.unpack('<4I', read(0x10078bbf4, 16))
duration = 0
for word in duration_words:
    assert word & 31 == 8  # x8 destination
    duration |= ((word >> 5) & 0xffff) << (((word >> 21) & 3) * 16)
assert duration == 5_000_000_000_000_000  # attoseconds = 5ms

# Main loop distinguishes Swift.CancellationError and Task.isCancelled.
assert pinned_imported_symbol(0x1014693f0) == '_$sScEMa'
assert pinned_imported_symbol(0x1014695a8) == '_$sScTss5NeverORszABRs_rlE11isCancelledSbvgZ'
# Set equality result controls retaining the existing subscription.
assert read(0x100789f04, 4).hex() == 'b50b0037'

# Menu opening clears its previous task before reading observed IDs.
assert read(0x100788220, 4).hex() == '3f1300f9'
# Selected foreground PID and original observed-ID snapshot are captured.
assert read(0x10078843c, 8).hex() == '162000b9151400f9'

# Menu task's own source polling budget is twenty 5ms sleeps.
assert struct.unpack('<2q', read(0x101192250, 16)) == (5_000_000_000_000_000, 0)
menu_attempt_comparison = struct.unpack('<I', read(0x100788a98, 4))[0]
assert (menu_attempt_comparison >> 10) & 0xfff == 20

# AX registration recognizes already-registered (-25209) after the ignore list.
ax_already_registered_move = struct.unpack('<I', read(0x1006ecb30, 4))[0]
assert (~((ax_already_registered_move >> 5) & 0xffff)) & 0xffffffff == (-25209 & 0xffffffff)
# Decode the source small-string construction for concrete menu names.
for address, expected_name in [(0x1006eb28c, b'AXMenuOpened'), (0x1006eb320, b'AXMenuClosed')]:
    registers = {0: 0, 1: 0}
    for word in struct.unpack('<7I', read(address, 28)):
        register = word & 31
        assert register in registers
        shift = ((word >> 21) & 3) * 16
        registers[register] |= ((word >> 5) & 0xffff) << shift
    encoded = struct.pack('<QQ', registers[0], registers[1])
    assert encoded[:len(expected_name)] == expected_name

# AX removal accepts already-absent (-25210) before target accounting.
ax_not_registered_move = struct.unpack("<I", read(0x1006ed1dc, 4))[0]
assert (~((ax_not_registered_move >> 5) & 0xffff)) & 0xffffffff == (-25210 & 0xffffffff)

assert pinned_imported_symbol(0x101469058) == "_$sSo17OS_dispatch_queueC8DispatchE4mainABvgZ"
assert pinned_imported_symbol(0x101464a00) == "_kCFRunLoopDefaultMode"

assert pinned_imported_symbol(0x101463730) == "_$sSD10FoundationE34_conditionallyBridgeFromObjectiveC_6resultSbSo12NSDictionaryC_SDyxq_GSgztFZ"

assert struct.unpack("<I", read(0x10006d790, 4))[0] == 0x52800324  # mov w4, #25 (userInitiated)

assert struct.unpack("<d", read(0x10116b0a8, 8))[0] == 0.01  # menu readiness polling delay

# AX controller callback forwards synchronously through a tail branch.
callback_branch = struct.unpack("<I", read(0x10008a400, 4))[0]
assert callback_branch >> 26 == 0b000101
callback_offset = callback_branch & 0x3ffffff
if callback_offset & 0x2000000: callback_offset -= 0x4000000
assert 0x10008a400 + callback_offset * 4 == 0x10006da8c

# Menu window resolution: on-screen-above + exclude desktop, menu levels 101/24.
assert struct.unpack("<I", read(0x100725a88, 4))[0] == 0x52800240
assert struct.unpack("<I", read(0x100725ac0, 4))[0] == 0x7101957f
assert struct.unpack("<I", read(0x100725ac8, 4))[0] == 0x7100617f

# The window protocol has a base requirement and two getter slots, not one.
assert struct.unpack("<II", read(0x1012cc9c0 + 12, 8)) == (1, 3)
for table, targets in [(0x10149c980, [0x7b8a2c, 0x72f040]),
                       (0x10149c0d8, [0x7b8a40, 0x7259c8])]:
    assert [value & 0xffffffff for value in struct.unpack("<QQ", read(table + 16, 16))] == targets
# The named extension getter forwards through slot +16.
assert struct.unpack("<I", read(0x10072ceb0, 4))[0] == 0xf9400828

# Window initializer shares Menu/Sheet initializer code by a direct tail branch.
wrapper_init_branch = struct.unpack("<I", read(0x100724de0, 4))[0]
assert wrapper_init_branch >> 26 == 0b000101
wrapper_offset = wrapper_init_branch & 0x3ffffff
if wrapper_offset & 0x2000000: wrapper_offset -= 0x4000000
assert 0x100724de0 + wrapper_offset * 4 == 0x100721e3c

# MenuBarItem shares that constructor address (merged symbol) and its static
# role initializer loads UIElementRole.menuBarItem at 0x1015cae90 before storing
# the optional role at 0x1015ca7c8. Pin both ADRP+ADD pairs.
assert read(0x1007229d4, 16).hex() == '4275009042403a914375009063201f91'

# Menu-bar items read the first direct child (offsets 0x20..0x38 of
# the UIElement array), then strictly decode that child's AXChildren.
assert read(0x100722bb0, 20).hex() == '080840f9880600b4bc0315f8136042a9176843a9'
assert read(0x100722d6c, 12).hex() == '20008052e10313aa2bc4ff97'
# MenuItem's static .menuItem role and shared initialization path.
assert read(0x100721db8, 36).hex() == '617200f021602b91427500b042803a91437500b063001f91c40400b084f00f9106030014'

# copyItem: exact uppercase C, zero modifiers, English Copy fallback and
# recursive return from only that first matching title's nonempty submenu.
assert read(0x100723704, 20).hex() == '7f0e01f1e10000540820fcd2ff0208eb81000054'
assert read(0x1007239d4, 12).hex() == '16f10737d71900b5a9010014'
assert read(0x100723e94, 24).hex() == '68e88d52082eaf72bf0208eb0880fcd2800348fa20080054'
assert read(0x100724014, 16).hex() == 'a80a40f9880200b4e00315aa14fcff97'
# MenuItem.items tail-calls the same collection implementation as MenuBarItem.
assert read(0x100721e64, 4).hex() == '25030014'

# useSelectionForFindItem: direct items getter, exact cached English title.
assert read(0x1007240a8, 36).hex() == '8efaff97f70300aa180840f9980f00b41b0080d2150080d2885900d008c12a91088100d1'
assert read(0x101256ab0, 23) == b'Use Selection for Find\0'
assert read(0x100724218, 52).hex() == 'c80280d20800faf2e00340f91f0008ebfc6341a960025cfac0050054e10313aac20280d20200faf2e3031caa040080526bbb2894'

# VirtualCursor descriptor: one layout constraint; getter/setter/modify and
# async method. Concrete witnesses route to ComputerUseCursor.isPressed.
assert struct.unpack('<II', read(0x1012cd810 + 12, 8)) == (1, 4)
assert [struct.unpack('<I', read(0x1012cd810 + 36 + n * 8, 4))[0] for n in range(4)] == [0x13, 0x14, 0x16, 0x31]
assert [value & 0xffffffff for value in struct.unpack('<4Q', read(0x10146f030 + 8, 32))] == [0x93f18, 0x93f60, 0x93fac, 0x115f120]
# The no-count convenience invokes witness slot +32 with count=1.
assert struct.unpack('<I', read(0x1007c1d04, 4))[0] == 0xf94012a8
assert struct.unpack('<I', read(0x1007c1d30, 4))[0] == 0x52800020

# The initial current-style closure creates SoftwareCursorStyle; makeView
# caches an NSImageView and sets the SoftwareCursor image to 20x23 points.
assert struct.unpack('<Q', read(0x101550720, 8))[0] & 0xffffffff == 0x9b570
assert read(0x10009c00c, 8).hex() == '0090661e01f0661e'

# Style default floating slots are angle=0, xScale=1, scale=1, pivot=0.5;
# software style overrides the hotspot with (4,4).
assert struct.unpack('<4d', read(0x10115bed0, 32)) == (0.0, 1.0, 1.0, 0.5)
assert read(0x10009bf34, 12).hex() == '0010621e0110621ec0035fd6'

# Cursor Window native initializer: zero frame, borderless, buffered, defer;
# collection flags 0x40048, no release-on-close, input-transparent, layer view.
assert read(0x100094268, 32).hex() == '00e4002f01e4002f02e4002f03e4002fe10313aa020080d24300805224008052'
assert read(0x1000942ec, 8).hex() == '020980528200a072'
assert read(0x100094304, 4).hex() == '02008052'
assert read(0x100094318, 4).hex() == '22008052'
assert read(0x100094358, 4).hex() == '22008052'
# constrainFrameRect:toScreen: returns the incoming CGRect untouched.
assert read(0x1000946b0, 4).hex() == 'c0035fd6'

# Cursor corresponding-window eligibility: absent optional -> true; query
# windowNumbersWithOptions:1 (all applications, current space), compare UInt32.
assert read(0x10009b064, 16).hex() == '09114039690000363500805240000014'
assert read(0x10009b08c, 4).hex() == '22008052'
assert read(0x10009b13c, 8).hex() == '1f03196b81fdff54'

# Cursor visibility: wants gate precedes corresponding-window query;
# either overlay reason short-circuits to orderFront, otherwise order above ID.
assert read(0x10009b1c8, 16).hex() == '1f050071210200549bffff9760030036'
assert read(0x10009b294, 16).hex() == '2a014039aafa07372905403969fa0737'
assert read(0x10009b2fc, 8).hex() == '22008052e30313aa'

# AnimationState reflection order establishes that native tag 3 is ended.
for index, name in enumerate([b'ready', b'retargeted', b'running', b'ended']):
    field_name = 0x101324424 + 16 + index * 12 + 8
    target = field_name + struct.unpack('<i', read(field_name, 4))[0]
    assert read(target, len(name) + 1) == name + b'\0'
assert read(0x10009b394, 8).hex() == '1f0d0071e0000054'
# Clear the position callback before reloading the owned position animation.
assert read(0x10009b3f0, 8).hex() == 'b65e40a9bf7e00a9'
assert read(0x10009b414, 8).hex() == '746a79f8340200b4'

# Outer cursor reset preserves reason0, clears reason1 and conditionally
# restores normal level; visibility is refreshed only for a removed reason1.
assert read(0x10009b338, 24).hex() == '1805403909014039090100391f050039e9000037d8000034'
assert read(0x10009b4fc, 44).hex() == '78010034a8a500b008e143f9686a68381f050071c1000054f40313aac9feff9760000036f40313aa21ffff97'

# Move/resize rejoins after the stop-suppression branch, not before it.
geometry_tail = struct.unpack("<I", read(0x10006ea3c, 4))[0]
assert geometry_tail >> 26 == 0b000101
geometry_offset = geometry_tail & 0x3ffffff
if geometry_offset & 0x2000000: geometry_offset -= 0x4000000
assert 0x10006ea3c + geometry_offset * 4 == 0x10006e8cc

# Attention uses its own required SoftLink request (images and one symbol).
assert struct.unpack("<Q", read(0x10155a3d0 + 16, 8))[0] == 30
assert struct.unpack("<Q", read(0x10155a4e8 + 16, 8))[0] == 2
assert read(0x10124b220, 127).decode() == "60f45d85ff2c4d1adec56ccff6a7b9e03cbb9a1e8e733e649271db28fcba863e37f81773bb064ce21295d09a48a966a2df58cf69b148cbcabb94c4a59823071"

# Public Carbon PID -> PSN wrapper is a tail call, not an invented lookup.
pid_psn_branch = struct.unpack("<I", read(0x10026d7f8, 4))[0]
assert pid_psn_branch >> 26 == 0b000101
pid_psn_offset = pid_psn_branch & 0x3ffffff
if pid_psn_offset & 0x2000000: pid_psn_offset -= 0x4000000
assert 0x10026d7f8 + pid_psn_offset * 4 == 0x101154020

# Window pruning uses the raw-window getter witness at +16.
assert struct.unpack("<I", read(0x100085574, 4))[0] == 0xf9400b68
