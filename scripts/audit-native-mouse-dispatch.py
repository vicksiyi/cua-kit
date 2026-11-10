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

def pinned_static_swift_string(address):
    # Decode only the known static String representation in this pinned image.
    low, high = struct.unpack('<QQ', read(address, 16))
    if high >> 60 == 0xe:
        return (struct.pack('<QQ', low, high)[:(high >> 56) & 15]).decode('utf-8')
    assert low >> 60 == 0xd, hex(address)
    return read(0x100000000 + (high & 0xffffffff) + 32,
                low & 0xffffffff).decode('utf-8')

assert [pinned_static_swift_string(0x10154ef38 + i * 16) for i in range(4)] == [
    'inc.software.app', 'inc.software.development.app',
    'com.openai.sky.app', 'com.openai.sky.development.app']
assert [pinned_static_swift_string(0x10154efa0 + i * 16) for i in range(2)] == [
    'Add to Photos Library', 'Quick Look']
assert read(0x101248b50, 90).split(b'\0', 1)[0].decode('utf-8') == r'#/(?i)(?:^|\.)docs\.google\.[a-z.]+$/#'
# Bool forwarding is reordered by the intermediate work function. Preserve
# capture+0x70 -> body stack+0x28 -> inner stack+0x40 independently of
# capture+0x88 -> body stack+0x40 (the web-shape publication gate).
for site, word in [(0x100240728, 0x3941c28a), (0x100240734, 0x3942228e),
                   (0x100240738, 0x390103ee), (0x10023ce64, 0x3940e3a8),
                   (0x10023ce68, 0x292a23a9), (0x10023d14c, 0xb85543a8),
                   (0x10023d154, 0x390103e8), (0x10023b168, 0x394143b7),
                   (0x10023d1ac, 0x394143a8)]:
    assert struct.unpack('<I', read(site, 4))[0] == word, hex(site)

def pinned_relative_c_string(site):
    relative = struct.unpack('<i', read(site, 4))[0]
    return read(site + relative, 160).split(b'\0', 1)[0].decode('utf-8')

# RefetchableUIElement's actual protocol witnesses. Most getters/actions use
# UIElementProtocol defaults, rather than forwarding the transformed value's
# captured properties. Keep this distinction explicit before wiring clicks.
assert [word & 0xffffffff for word in struct.unpack('<13Q', read(0x10147a080, 104))] == [
    0x116a598, 0, 0, 0x2318c4, 0x2318cc, 0x231984, 0x231a54,
    0x231ab4, 0x231ab8, 0x231abc, 0x231ac0, 0x231ac4, 0x231b80]
for site, target, opcode in [
    (0x100231ab4, 0x1007a8690, 0x14000000),  # subrole
    (0x100231ab8, 0x1007ab2c4, 0x14000000),  # isInsideWebView
    (0x100231abc, 0x1007916b0, 0x14000000),  # actions
    (0x100231ac0, 0x100791a48, 0x14000000),  # actionDescriptions
    (0x100231b88, 0x100791a68, 0x94000000),  # perform(action:)
    (0x100231bec, 0x1007ab548, 0x94000000),  # generic AX hash
    (0x100231b60, 0x100231604, 0x94000000),  # post-write refetch
]:
    assert struct.unpack('<I', read(site, 4))[0] == opcode | (((target - site) // 4) & 0x3ffffff), hex(site)
# The successful setter passes validate=true and ignoreValueChange=true.
assert struct.unpack('<II', read(0x100231b54, 8)) == (0x52800020, 0x52800021)
# Raw AX construction is deliberately unsupported; the owner/tree initializer
# is required. Pin the fatal witness terminator instead of inventing ownership.
assert struct.unpack('<I', read(0x100231ab0, 4))[0] == 0xd4200020

assert pinned_relative_c_string(0x1012c9884 + 8) == 'UIElementRenderTreeSnapshot'
assert [pinned_relative_c_string(0x1013215ac + 16 + i * 12 + 8) for i in range(3)] == ['subjectID', 'isFocus', 'renders']
assert [pinned_relative_c_string(0x1013215e0 + 16 + i * 12 + 8) for i in range(4)] == ['id', 'text', 'detailText', 'parentIndex']
assert struct.unpack('<I', read(0x101321620 + 12, 4))[0] == 0
assert pinned_relative_c_string(0x1012c17ec + 8) == 'LLMDescriptionMode'
assert pinned_relative_c_string(0x1012c1808 + 8) == 'DifferenceBaseline'
assert [pinned_relative_c_string(0x10131a9ec + 16 + i * 12 + 8) for i in range(2)] == ['difference', 'fullTree']
assert [pinned_relative_c_string(0x10131aa14 + 16 + i * 12 + 8) for i in range(2)] == ['initial', 'previous']
# Symbolic reference to DifferenceBaseline, followed by the tuple's from label.
assert read(0x101293502, 13) == bytes.fromhex('0105e302003466726f6d5f7400')
assert pinned_relative_c_string(0x1012c1824 + 8) == 'FocusedUIElementAccessibilityInfo'
assert pinned_relative_c_string(0x1012c17a8 + 8) == 'SystemSelection'
assert [pinned_relative_c_string(0x10131a984 + 16 + i * 12 + 8)
        for i in range(6)] == ['applicationWindow', 'windowRevision', 'invalidationMonitor',
                              'url', 'contextType', 'screenshotNeededForContext']
assert [pinned_relative_c_string(0x10131aa64 + 16 + i * 12 + 8)
        for i in range(5)] == ['windowRevision', 'copyMenuItemIsEnabled',
                              'webAreaURL', 'contextType', 'screenshotNeededForContext']

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
# selectedText: typed AXSelectedText read, then marker range/string only when
# nil or empty; parameterized read errors are suppressed by this getter.
calls.extend([(0x10078e844, 0x1007a7600), (0x10078e878, 0x10078e994),
              (0x10078e8d4, 0x1007aecec), (0x1007aed78, 0x1006f6ed4)])
assert struct.unpack('<I', read(0x10078e838, 4))[0] == 0x52800001
# differenceLines full-tree node counter starts at zero, increments once per
# traversal entry, then seeds the remaining-budget slot from the total.
for site, word in [(0x100629a20, 0xf9008a7f), (0x100629a4c, 0xf9408a68),
                   (0x100629a54, 0x91000508), (0x100629a58, 0xf9008a68),
                   (0x10062a0a0, 0xf9408a69), (0x10062a0a4, 0xf9002a69)]:
    assert struct.unpack('<I', read(site, 4))[0] == word, hex(site)
# Removed-ID formatter first constructs a Set (deduplicating), then sorts
# and uses literal ASCII hyphen/comma-space range formatting.
assert pinned_imported_symbol(0x101466998) == '_$sSh15minimumCapacityShyxGSi_tcfC'
calls.extend([(0x10062b70c, 0x10062cac8), (0x10062caf0, 0x100636c24),
              (0x100636c54, 0x101151320), (0x10062cb70, 0x100629438)])
assert struct.unpack('<I', read(0x10062cd5c, 4))[0] == 0x528005a0
assert struct.unpack('<I', read(0x10062cde4, 4))[0] == 0x52840580
assert read(0x101255a30, 22) == b'Removed element IDs: \0'
# differenceLines interleaves each snapshot with its rebuild; errors from
# either snapshot take the common nil-return boundary.
calls.extend([(0x1006298e0, 0x100645930), (0x100629950, 0x100645930)])
# Snapshot.renderTree tail-calls the Int-node rebuild. Root extraction drops
# the non-root count from the end, relying on snapshot's BFS root prefix.
assert struct.unpack('<I', read(0x10063cc6c, 4))[0] == 0x14000000 | ((0x100645930 - 0x10063cc6c) // 4)
calls.extend([(0x100645c20, 0x1006457ac)])
# Snapshot construction uses the existing swift-collections Deque and the
# revision forwards its render tree/lineage into that constructor.
calls.extend([(0x100641608, 0x1004674c4), (0x1006417e8, 0x100463834),
              (0x1006548a4, 0x100641478),
              (0x1006298a8, 0x100654804), (0x1006298fc, 0x100654804)])
# LLM description focus prefix reads selectedText before considering the
# optional focus render tree, and renders that tree with tab indentation.
calls.extend([(0x100238d6c, 0x10078e7f0), (0x100238e10, 0x10063deec)])
assert struct.unpack('<I', read(0x100238df4, 4))[0] == 0x52800120
# fadeIn preparation, animation closure and completion thunk.
calls.extend([(0x100096410, 0x1000965d0),
              (0x1000966ac, 0x10102bc88),
              (0x1000966c4, 0x100095858),
              (0x10009e1a0, 0x100096870),
              (0x10009e214, 0x100095580)])
# owner first-show fade branch and completion notification name initializer.
# B (tail-call) rather than BL at0x100092b3c.
assert struct.unpack('<I', read(0x100092b3c, 4))[0] == 0x14000d6e
assert read(0x101242aa0, 31) == b'computerUseCursorDidFinishMove\0'
# Per-controller lazy cursor construction and application-monitor setup.
calls.extend([(0x10006edd8, 0x100090ff8),
              (0x10006ee30, 0x10071795c),
              (0x10006ee84, 0x10009c188),
              (0x100073950, 0x10006ecd8)])
# prepareToInteract resolves with validation before positioning and repeats
# the same ID lookup when the async position result says it scrolled.
calls.extend([(0x100072f7c, 0x10022e6b4), (0x100073388, 0x10022e6b4)])
assert struct.unpack('<I', read(0x100072f70, 4))[0] == 0x52800021
assert struct.unpack('<I', read(0x100073384, 4))[0] == 0x52800021
assert struct.unpack('<I', read(0x100073098, 4))[0] == 0x14000148
assert struct.unpack('<I', read(0x100073378, 4))[0] == 0x36000148
# prepareToInteract validates the resolved element's actual process, not just
# the app initially bound by the agent. The security array is the existing
# systemAuthentication classification, not the broader forbidden-target list.
calls.extend([(0x100073430, 0x1006f9f30), (0x100073458, 0x100086fc4),
              (0x10008704c, 0x100256fc4), (0x10008709c, 0x1001d3710)])
assert struct.unpack('<Q', read(0x101558c70 + 16, 8))[0] == 3
assert [pinned_static_swift_string(0x101558c70 + 32 + i * 16) for i in range(3)] == [
    'com.apple.UserNotificationCenter', 'com.apple.LocalAuthenticationRemoteService',
    'com.apple.SecurityAgent']
# Actual operation callers use different Optional<Timing> tags (0 closeEnough,
# 1 finished, 2 nil). Click forwards animateCursor; other callers pass true.
for site, word in [
    (0x100075054, 0x52800002), (0x100075058, 0x52800023),
    (0x100077090, 0x52800022), (0x100077094, 0x52800023), (0x100077098, 0x52800024),
    (0x100078fcc, 0x52800002), (0x100078fd0, 0x52800023), (0x100078fd4, 0x52800024),
    (0x10007c4cc, 0x52800042), (0x10007c4d0, 0x52800003), (0x10007c4d4, 0x52800024),
]:
    assert struct.unpack('<I', read(site, 4))[0] == word, hex(site)
for site in [0x100075070, 0x1000770ac, 0x100078fe8, 0x10007c4e8]:
    assert struct.unpack('<I', read(site, 4))[0] == 0x14000000 | (((0x100072e44 - site) // 4) & 0x3ffffff)
assert struct.unpack('<I', read(0x100075044, 4))[0] == 0x394216c4
# Cursor feature metadata: default is true, not a fabricated remote flag value.
assert pinned_static_swift_string(0x10150be80) == 'feature/computerUseCursor'
assert pinned_static_swift_string(0x10150be90) == 'Enable the virtual cursor in Computer Use.'
assert read(0x10150bea0, 1) == b'\x01'
# updateSkyshot uses controllerEnabled & ~disableAXDiffing for this capture,
# while the newly published refetchable owner retains controllerEnabled itself.
for site, word in [(0x10006ef78, 0x3917a6c2), (0x10006fd20, 0x3957a6cc),
                   (0x10006fd44, 0x3919aac8), (0x10006fd48, 0x0a2c011a),
                   (0x10006fdd8, 0x38286aba), (0x100070a34, 0x3959aad3),
                   (0x100070aac, 0x38286b73)]:
    assert struct.unpack('<I', read(site, 4))[0] == word, hex(site)
# positionElement always requests scrollToVisible=true before cursor gates.
assert struct.unpack('<I', read(0x10007362c, 4))[0] == 0x52800020
calls.extend([(0x1000736f4, 0x100fbd254), (0x100073734, 0x100fbbfe0)])
# Ancestor scroll plan: boundary, prepend splice, frame execution and poll.
calls.extend([(0x10079f568, 0x1007a0654),
              (0x10079f67c, 0x1007a3880),
              (0x10079f79c, 0x1007a3880),
              (0x10079f8d4, 0x1007b029c),
              (0x10079fa08, 0x1007a08d8),
              (0x10079fd6c, 0x10077d320)])
# Scroll request carry-state uses clipsChildren, not scrollArea alone.
calls.extend([(0x10079f7c0, 0x1007a04d4),
              (0x1007a1a18, 0x10079fe78),
              (0x1007a1a3c, 0x10079ffb8),
              (0x1007a1aa0, 0x101153da4)])
assert struct.unpack('<d', read(0x10116b2e0, 8))[0] == 0.025
# Scroll axis key paths: vertical size/min/max before horizontal.
for address, getter in [(0x10119690c, 0x1007a1ad4),
                        (0x101196964, 0x1007a1ad8),
                        (0x1011969b4, 0x1007a1adc)]:
    assert address + struct.unpack('<i', read(address, 4))[0] == getter
assert struct.unpack('<I', read(0x1007a153c, 4))[0] == 0x1e6939c0
assert struct.unpack('<I', read(0x1007a16cc, 4))[0] == 0x1e601840
# Scroll frame setter shares the provider-aware AX encoded-value writer.
calls.extend([(0x1007a1738, 0x1007290bc),
              (0x100729118, 0x1006ea3e4),
              (0x10072913c, 0x1006f74e4),
              (0x1007a0980, 0x101153e64),
              (0x1007a0998, 0x101153e58),
              (0x1007a09fc, 0x101153db0)])
# Final normalized-value clamp is max(value,0), then min(intermediate,1).
assert pinned_imported_symbol(0x101468228) == '_$ss3maxyxx_xtSLRzlF'
assert pinned_imported_symbol(0x101468238) == '_$ss3minyxx_xtSLRzlF'
calls.extend([(0x1007a1718, 0x1007a3308),
              (0x1007a3364, 0x101153330), (0x1007a337c, 0x101153348)])
# Scroll content walk starts from children, inserts into visited set, unions
# nonempty frames and checks the page-scroll predicate before descending.
calls.extend([(0x1007a1bd8, 0x1007a7ea0),
              (0x1007a1e00, 0x1006ee388),
              (0x1007a2668, 0x101153e58),
              (0x1007a2690, 0x101153e88),
              (0x1007a2d84, 0x10079d420),
              (0x1007a3110, 0x10076d7a0)])
# Current scrollbar AXValue uses NSNumber specialization and CF-first decoder.
assert pinned_imported_symbol(0x10151ee98) == '_OBJC_CLASS_$_NSNumber'
calls.extend([(0x100713e90, 0x1007144d0),
              (0x100714510, 0x101153a68), (0x100714518, 0x101153924),
              (0x100714598, 0x101153864), (0x100714620, 0x10115387c),
              (0x1007146ac, 0x10115396c), (0x100714740, 0x101153a14),
              (0x1007a134c, 0x100713e78)])
# Attribute-settable query suppresses AX read errors without support preflight.
calls.extend([(0x1007b02d0, 0x1006f732c)])
# positionElement inlines owner.move with relativeToWindow=true and returns
# didScroll after the move/fade/finish-notification phase.
calls.extend([(0x100074090, 0x1000946b4)])
assert struct.unpack('<I', read(0x100074080, 4))[0] == 0x52800021
assert struct.unpack('<I', read(0x100073cbc, 4))[0] == 0x3900e01f
# ApplicationWindow.id reads the stored CGWindow number, not AX focus.
assert struct.unpack('<I', read(0x10077f1d8, 4))[0] == 0xb9401280
# AX-window constructor uses the full resolver; ID-first and exact-frame
# ordinary fallback are separate from screenshot selection policy.
calls.extend([(0x10077f234, 0x10071f47c),
              (0x10071f568, 0x1006fa28c),
              (0x10071f584, 0x10025b818),
              (0x10071ff70, 0x101153dbc)])
# Desktop fallback uses on-screen windows and level key18; ordinary default
# enumeration uses options0x11 and rejects level>=key8 and own process.
calls.extend([(0x10071fd2c, 0x10025b8e8),
              (0x10071fdd0, 0x10025bcc4),
              (0x10025bcd8, 0x101153ec4),
              (0x10071f304, 0x10025b8e8),
              (0x10071f394, 0x101153ec4), (0x10071f3a4, 0x1011548f0)])
assert struct.unpack('<I', read(0x10025bcd4, 4))[0] == 0x52800240
assert struct.unpack('<I', read(0x10071f2fc, 4))[0] == 0x52800220
# Tree invalidation monitor creates observer, subscribes twice, starts utility
# monitoring, and explicitly stops monitoring on teardown.
calls.extend([(0x10076aff8, 0x1006ec098),
              (0x10076b068, 0x1006ecab8), (0x10076b0a8, 0x1006ecab8),
              (0x10076b154, 0x1006ec4cc), (0x10076b538, 0x1006ed4a0),
              (0x10076b32c, 0x1006ede20)])
assert struct.unpack('<I', read(0x10076b150, 4))[0] == 0x52800220
calls += [(0x1007161e8, 0x100718904), (0x100716200, 0x1007184c0),
          (0x100716218, 0x1007180a0), (0x100718a04, 0x100712f84)]
calls += [(0x100786250, 0x1007161c4), (0x100786300, 0x100713570),
          (0x10078650c, 0x100713570), (0x1007866f8, 0x100787560)]
calls += [(0x10023854c, 0x1006fabe8), (0x1002386c8, 0x10076ae48),
          (0x100238774, 0x10076bd70)]
calls += [(0x10071e4e0, 0x1006f9d8c), (0x10071e5c8, 0x1002561f0),
          (0x10071e5d0, 0x100256494), (0x10071e5f4, 0x1002565d0)]
calls += [(0x1002383a4, 0x1007000cc), (0x1002383e8, 0x100715d4c)]
calls += [(0x100238870, 0x100758398), (0x10023890c, 0x10076c8e8)]
calls += [(0x100758438, 0x100715974), (0x100758480, 0x10071e484),
          (0x1007584d4, 0x10071e484), (0x100758504, 0x100758cb4),
          (0x1007585b0, 0x1007575ac)]
calls += [(0x10023d71c, 0x100240700), (0x100240750, 0x10023ce1c),
          (0x10023d19c, 0x10023aa2c), (0x10023ae18, 0x100717f3c),
          (0x10023ae7c, 0x1007b62d4), (0x10023c004, 0x10078ebe0),
          (0x10023c034, 0x10078e994), (0x100766538, 0x100768994),
          (0x100768a44, 0x100769a74)]
calls += [(0x10078ec38, 0x1007a7600), (0x10078e9e4, 0x1007a7600)]
calls += [(0x1007a426c, 0x1007b0468), (0x1007b04ac, 0x1007b06a0),
          (0x1007a42c8, 0x1007a44f4), (0x1007a42e0, 0x1007a4ee8),
          (0x1007a434c, 0x1007b04f4), (0x1007a438c, 0x1007a4844)]
calls += [(0x10022e7a8, 0x1006557a4), (0x10022e8c4, 0x10022e910)]
calls += [(0x100231210, 0x1002324a4), (0x1002324bc, 0x10023d6c4)]
calls += [(0x10023bb44, 0x10076b6f4), (0x10023bc20, 0x10076b838), (0x10076b71c, 0x100655d5c), (0x100655ee0, 0x10063cc70), (0x100655f04, 0x1006413c0), (0x100656200, 0x10063f3b8)]
calls += [(0x10063cd78, 0x1004674c4), (0x10063cd98, 0x10063f960), (0x10063cde8, 0x100463834), (0x10063ce2c, 0x1004674c4)]
calls += [(0x100640a58, 0x10064b370), (0x100640a68, 0x10064b370), (0x100640a78, 0x10064b450), (0x100640a88, 0x10064b450), (0x100640abc, 0x100460920), (0x100640b08, 0x101152ff4)]
calls += [(0x10063fe0c, 0x101150714), (0x10063fe5c, 0x1006409e4), (0x10063fe70, 0x101150f0c)]
calls += [(0x1006455c0, 0x101150234), (0x100645618, 0x101150300), (0x100645670, 0x101150c24), (0x1006456b8, 0x101152874), (0x100645774, 0x1011503e4)]
calls += [(0x100640410, 0x1011502dc), (0x1006404f0, 0x101151398), (0x100640544, 0x1006409e4), (0x100640670, 0x101150354), (0x100640894, 0x101150f0c)]
calls += [(0x100637914, 0x100637a10), (0x1006379b8, 0x100637e50), (0x1006379d8, 0x1006381a4)]
calls += [(0x1006379a0, 0x101150c18), (0x100637f68, 0x101151404), (0x100637fa0, 0x1011505f4), (0x1006384a0, 0x101151344)]
calls += [(0x10064144c, 0x101150f84)]
calls += [(0x10063f204, 0x10063efd4), (0x10063d248, 0x10114ef2c), (0x100641350, 0x10063d1a4), (0x100641360, 0x10063d1a4), (0x100641374, 0x10063d220), (0x100641284, 0x1011506cc)]
calls += [(0x10075b0f0, 0x10063aea8), (0x10075b1f8, 0x100638c74), (0x10075b2c8, 0x10075b050)]
calls += [(0x10023b538, 0x1006604c8), (0x10023b634, 0x10065fbfc), (0x10023b654, 0x1006604c8), (0x10023b794, 0x100660624), (0x10023b8a4, 0x10075b044), (0x10023b8dc, 0x10075b044)]
calls += [(0x10023c578, 0x1007594e8), (0x10023c5a8, 0x100766558), (0x10023c62c, 0x1007594e8), (0x10023c654, 0x100766558), (0x10023c8bc, 0x100625d58), (0x10023cacc, 0x100625d58)]
calls += [(0x1007599e0, 0x100751a9c), (0x100751af8, 0x1006f9d8c), (0x100759a04, 0x101154ba8), (0x100759a20, 0x101154ba8)]
calls += [(0x10075aa00, 0x10076589c), (0x10075aa40, 0x1007b8a1c), (0x10075aa84, 0x100710b44)]
calls += [(0x10075abd8, 0x100625d58)]
# Rebuild callback enters the same generic provider/tree builder, not a copy
# of the already transformed subtree. Keep its transaction/cache calls pinned.
calls += [(0x10075a904, 0x10076aba0), (0x100768ac8, 0x100768ad8),
          (0x100768e68, 0x1006ede20), (0x100768f54, 0x10076589c),
          (0x100768f9c, 0x10075e160), (0x100769070, 0x10071b8c8),
          (0x1007691dc, 0x10076881c)]
calls += [(0x10076892c, 0x10064fb6c), (0x1006edef4, 0x101153a74), (0x1006edf4c, 0x101153a5c)]
calls += [(0x10071b8d8, 0x1007a44ec)]
calls += [(0x1007a53c4, 0x1007a46fc), (0x1007a53d8, 0x1007b06a0), (0x1007a5418, 0x1007a55b8)]
calls += [(0x1007a55e0, 0x1007af0d0), (0x1007a560c, 0x1007118c4), (0x1007a5694, 0x1007ae414)]
calls += [(0x1007a518c, 0x1007a4638), (0x1007a5204, 0x1007af0d0), (0x1007a5218, 0x1007118c4), (0x1007a5348, 0x100763150), (0x1007631c0, 0x100716d94)]
calls += [(0x1007a5034, 0x1007a70b0), (0x1007a7148, 0x100716d94), (0x1007a71a8, 0x100716d94)]
calls += [(0x1007a50e4, 0x1007a546c)]
calls += [(0x1007a504c, 0x1007a56f4), (0x1007a5734, 0x1007a5dec), (0x1007a5764, 0x1007a6114), (0x1007a6164, 0x1007a6180), (0x1007a6214, 0x1007a66c4)]
calls += [(0x1007a4f34, 0x1007b04f4), (0x1007a4f94, 0x1007a5158), (0x1007a5124, 0x1007a5864), (0x1007a4750, 0x10114f0ac), (0x1007a479c, 0x10114f0ac)]
calls += [(0x1007a48cc, 0x10079d310), (0x1007a4908, 0x10079d310), (0x1007a493c, 0x101153e40), (0x1007a4b5c, 0x101153e28), (0x1007a4b70, 0x101153e4c)]
calls += [(0x1007a48ac, 0x1007a55b8), (0x1007a49ec, 0x1006f5f88), (0x1007a4a08, 0x100712830), (0x1007a4d20, 0x1007a56f4), (0x1007a4d84, 0x1007a546c), (0x1007a4e00, 0x1007a5864)]
calls += [(0x100769ec0, 0x10076589c), (0x100769f08, 0x10075e160), (0x100769ff4, 0x1007a41e0), (0x10076a12c, 0x100769250), (0x10076a1d0, 0x10076881c)]
calls += [(0x1007696f8, 0x10075e160), (0x1007697dc, 0x10071b8e8), (0x100769914, 0x100769250), (0x1007699ac, 0x10076881c)]
calls += [(0x10075e824, 0x100762be4)]
calls += [(0x100766538, 0x100768994), (0x100768a44, 0x100769a74)]
calls += [(0x10023b014, 0x1007664dc)]
calls += [(0x100766ca8, 0x1007674b0), (0x100767524, 0x1007666ec), (0x100766f24, 0x100650a38)]
calls += [(0x1007677fc, 0x1007b8a1c), (0x100767874, 0x101153a08), (0x100767a14, 0x10115390c)]
calls += [(0x100767c64, 0x100712f2c), (0x100767ce0, 0x1006f5f88), (0x100767d74, 0x100712f2c)]
calls += [(0x100766d78, 0x10064ff84), (0x100766d9c, 0x1007b71b8), (0x100766de8, 0x10064fd7c)]
calls += [(0x1007671a4, 0x10076a244), (0x10076745c, 0x100650a38)]
calls += [(0x1007673a8, 0x100768a84), (0x10076740c, 0x100650a38)]
calls += [(0x1007681c8, 0x100724ef4), (0x100768308, 0x100710b44), (0x100768628, 0x101151e18)]
calls += [(0x1007683e4, 0x10076589c), (0x100768418, 0x10075e160), (0x100768764, 0x10076589c), (0x10076879c, 0x10075e160), (0x1007687bc, 0x10076881c)]
calls += [(0x100724fd4, 0x100713e4c), (0x100725044, 0x1006f5f88), (0x1007250d4, 0x100713e4c)]
calls += [(0x100718e48, 0x100712f84), (0x100718ec0, 0x1006f5f88), (0x100718f70, 0x100712f84)]
calls += [(0x10023b0d0, 0x1006fabe8), (0x10023b0fc, 0x100718d48), (0x10023b138, 0x100767f88)]
calls += [(0x10023d71c, 0x100240700), (0x100240750, 0x10023ce1c), (0x10023d19c, 0x10023aa2c)]
calls += [(0x10023b1d0, 0x10023dc7c), (0x10023dd38, 0x10064ff84), (0x10023dd98, 0x10064fd7c), (0x10023b470, 0x100766958)]
calls += [(0x10023b538, 0x1006604c8)]
calls += [(0x10023f184, 0x1007ae414), (0x10023f4c0, 0x100792570), (0x10023f590, 0x100182dd4), (0x10023f5ac, 0x10023df50), (0x10023e338, 0x10023da5c)]
calls += [(0x10023b4b8, 0x10023c064), (0x10023c14c, 0x100651fec), (0x10023c15c, 0x100651ea4), (0x10023c204, 0x100651ea4), (0x10023c23c, 0x1007b8c28)]
calls += [(0x10023d39c, 0x10023f630), (0x10023f6f0, 0x10114e938), (0x10023f8b8, 0x10114f178)]
calls += [(0x100230760, 0x1007861d0), (0x1002309d0, 0x1007000cc), (0x100230ed4, 0x10076c8e8)]
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

# InterpolatableAnimation.Event payload cases and stop sequencing.
for index, name in enumerate([b'valueChanged', b'finished', b'retargeted']):
    field_name = 0x1013245b8 + 16 + index * 12 + 8
    target = field_name + struct.unpack('<i', read(field_name, 4))[0]
    assert read(target, len(name) + 1) == name + b'\0'
assert read(0x1007c60fc, 12).hex() == '1804003660008052c2fdff97'
assert read(0x1007c6128, 12).hex() == 'f60240f9960300b4f70640f9'
assert read(0x1007c614c, 4).hex() == '22008052'
assert read(0x1007c617c, 16).hex() == 'e80317aa7ffbff97e00317aafe000094'

# State assignment always writes; didSet compares old/current before lazy
# shared-coordinator access. Repeated immediate stop still emits finished.
assert read(0x1007c5840, 12).hex() == '806a7538936a3538b1010094'
assert read(0x1007c5f44, 12).hex() == '936a77387f02356b60020054'

# Coordinator invokes the transaction completion before testing
# (state | 2) == 3: retargeted/ended then remove the completion entry.
assert read(0x1007c90fc, 40).hex() == 'b7831938a0a301d1f40318aa40033fd6e00318aac2302694e8021f32081d00121f0d0071c1030054'

# Coordinator remove(driverSource:) ends dictionary read access, retains
# old handler and invalidates it, then removes the fresh entry by identity key.
assert read(0x1007cae1c, 48).hex() == 'e00316aa84292694f40316aaadfdff9760620091e123009122048052030080d27828269474620091e00315aaee010094'

# Handler stop-all loop: missing snapshotted UUID returns, not continue;
# a found animation receives stop(immediately:true) before fresh removal.
assert read(0x1007ca7e4, 8).hex() == '1f04007140090054'
assert read(0x1007ca82c, 20).hex() == '280f40f920008052e1031caae20319aa00013fd6'

# Animation protocol has UUID/state getters plus stop/reset/tick methods.
assert struct.unpack('<II', read(0x1012cd860 + 12, 8)) == (0, 5)
assert [struct.unpack('<I', read(0x1012cd860 + 24 + n * 8, 4))[0] for n in range(5)] == [0x13, 0x13, 0x11, 0x11, 0x11]
assert [value & 0xffffffff for value in struct.unpack('<5Q', read(0x1014a03d8 + 8, 40))] == [0x7c6488, 0x7c64d4, 0x7c6518, 0x7c6538, 0x7c6560]
# Update timing uses un-clamped subtraction/addition; no synthesized duration.
assert read(0x1007c2b90, 32).hex() == '0000679e4038601e0800669e210000720010889ac0035fd60228611ec0035fd6'

# Class vtable header offset=19 words; reset is method index 29, hence
# witness slot 0x180 is the exported reset descriptor/implementation.
assert struct.unpack('<II', read(0x1012cda80, 8)) == (19, 34)
assert (19 + (0x1012cdb70 - 0x1012cda88) // 8) * 8 == 0x180
assert 0x1012cdb74 + struct.unpack('<i', read(0x1012cdb74, 4))[0] == 0x1007c5b14
# Field vector starts at metadata word 12; field 6 is startTime (word 18).
assert struct.unpack('<II', read(0x1012cda34 + 36, 8)) == (7, 12)
assert read(0x1007c5b14, 32).hex() == '880240f9084940f98802088b1f0100f929008052092100390000805237ffff17'

# Tick initializes any non-running state then always assigns running;
# nil projected result enters natural completion, not immediate stop.
assert read(0x1007c6288, 32).hex() == '1f090071a0000054880240f908c540f94041601e00013fd6400080525afdff97'
assert read(0x1007c62d8, 32).hex() == '1f040071e1000054280740f9e00317aae10316aa00013fd633feff9717000014'
# Natural finished callback precedes the ended state setter.
assert read(0x1007c5ca8, 4).hex() == 'e0023fd6'
assert read(0x1007c5cc8, 12).hex() == '60008052f40313aacffeff97'

# Value-change wrapper reads old, invokes mutation, reads new, then gets
# handler; equality compares new first, old second only for a present handler.
assert read(0x1007c59d4, 28).hex() == 'e80318aa69fdff97f4031baa80033fd6e80316aaf4031aaa64fdff97'
assert read(0x1007c5a10, 8).hex() == '9a0240f93a0600b4'
assert read(0x1007c5a28, 28).hex() == 'e00316aae10318aaf40313aae20313aae30319aa362b2694a0000036'

# Double length2 and squared-length2 use squared lanes + pairwise add;
# length adds sqrt. These are not an overflow-safe hypot implementation.
assert read(0x1007de868, 16).hex() == '00dc606e00d8707e00c0611ec0035fd6'
assert read(0x1007de948, 12).hex() == '00dc606e00d8707ec0035fd6'

# High-dimensional Double norms narrow before reducing (Float then half).
assert read(0x1007de924, 32).hex() == '0068610ee068614e2168610ec168614e4268610ea268614e6368610e8368614e'
assert read(0x1007ded8c, 24).hex() == 'f76a612ed76a616eb56a612e1568616ea06a210ee06a214e'
assert read(0x1007ded2c, 24).hex() == '0140006e0014410e01040c0e0014410e00d8305e00c0e21e'

# Float length reductions retain Float through 16 lanes; 32 lanes narrow to half.
assert read(0x1007de398, 16).hex() == '00dc202e00d8307e00c0211ec0035fd6'
assert read(0x1007de41c, 48).hex() == '42dc226e00dc206e63dc236e21dc216e21d4234e00d4224e00d4214e0140006e00d4210e00d8307e00c0211ec0035fd6'
assert read(0x1007dee00, 32).hex() == '0068210ee068214e2168210ec168214e4268210ea268214e6368210e8368214e'

# Numeric protocol requirement layouts recovered from native metadata.
assert struct.unpack('<II', read(0x1012ce188 + 12, 8)) == (6, 18)
assert [struct.unpack('<I', read(0x1012ce1e8 + i * 8, 4))[0]
        for i in range(18)] == [0] * 6 + [1] * 12
assert struct.unpack('<II', read(0x1012ce278 + 12, 8)) == (4, 6)
assert [struct.unpack('<I', read(0x1012ce2c0 + i * 8, 4))[0]
        for i in range(6)] == [0, 0, 0, 8, 0x11, 0x11]
assert struct.unpack('<II', read(0x1012ce3a4 + 12, 8)) == (3, 6)
assert [struct.unpack('<I', read(0x1012ce3e0 + i * 8, 4))[0]
        for i in range(6)] == [0, 8, 7, 2, 0x11, 3]

# SIMDValue comparison reconstructs left/right Value, then uses Value's
# comparison; do not synthesize equality over the stored SIMD representation.
for call_site, destination in [(0x1007e56c8, 0x1007e5078),
        (0x1007e56d8, 0x1007e5078), (0x1007e56f0, 0x101150714),
        (0x1007e57c8, 0x1007e5078), (0x1007e57d8, 0x1007e5078),
        (0x1007e57f0, 0x101150624)]:
    instruction = struct.unpack('<I', read(call_site, 4))[0]
    assert instruction >> 26 == 0b100101
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert call_site + displacement * 4 == destination

# SIMDValue Codable uses generic single-value containers, never keyed vector fields.
for stub, expected_symbol in [
    (0x1011535f4, '_$ss7DecoderP20singleValueContainers06Singlec8DecodingD0_pyKFTj'),
    (0x101153048, '_$ss28SingleValueDecodingContainerP6decodeyqd__qd__mKSeRd__lFTj'),
    (0x101153624, '_$ss7EncoderP20singleValueContainers06Singlec8EncodingD0_pyFTj'),
    (0x1011530c0, '_$ss28SingleValueEncodingContainerP6encodeyyqd__KSERd__lFTj')]:
    adrp, ldr = struct.unpack('<II', read(stub, 8))
    page_delta = ((adrp >> 5) & 0x7ffff) << 2 | ((adrp >> 29) & 3)
    if page_delta & (1 << 20): page_delta -= 1 << 21
    slot = (stub & ~4095) + page_delta * 4096 + ((ldr >> 10) & 4095) * 8
    assert pinned_imported_symbol(slot) == expected_symbol

# SIMD1's logical count is 1; subscript delegates directly to SIMDStorage
# getter/setter instead of adding a logical-lane bounds check.
assert read(0x100010154, 8).hex() == '20008052c0035fd6'
for site, destination in [(0x1007e2f20, 0x1011520e8),
                          (0x1007e3204, 0x1011520f4)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction >> 26 in (0b000101, 0b100101)
    delta = instruction & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == destination

# SIMD1 magnitude uses Scalar's Numeric.magnitude witness, then Numeric.*
# for the squared result, rather than a norm over both storage lanes.
for site, target in [(0x1007e4554, 0x1011513d4),
                     (0x1007e4660, 0x1011513d4), (0x1007e467c, 0x1011513c8)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# Nonfinite approximate-comparison rescaling literals: significand 1,
# finite-operand exponent -1. Finite path uses strict Comparable.< stub.
assert struct.unpack('<q', read(0x1011727f0, 8))[0] == 1
assert struct.unpack('<q', read(0x101198a60, 8))[0] == -1
for site, target in [(0x1007ec8b8, 0x101150624),
                     (0x1007ecbbc, 0x101150714),
                     (0x1007ecd6c, 0x1007ec6b4)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# Vector comparison uses generic max and inclusive <=, then shared mask
# reduction. Its reduction folds signed masks with max (true=-1, false=0).
for site, target in [(0x1007e0bd8, 0x101153330),
                     (0x1007e0d9c, 0x10115063c),
                     (0x1007e0e5c, 0x1007e13a0),
                     (0x1007e131c, 0x1007e13a0),
                     (0x1007e19c4, 0x101153330)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# CoreGraphics vector lane mappings are direct shuffles, without rect normalization.
assert read(0x1007e47b4, 16).hex() == '01e4006f0104086e201ca14ec0035fd6'
assert read(0x1007e489c, 8).hex() == '0104185ec0035fd6'
assert read(0x1007e48a4, 8).hex() == '2004186ec0035fd6'
assert read(0x1007e48cc, 16).hex() == '221ca14e0104185e4304185ec0035fd6'
assert read(0x1007e48dc, 16).hex() == '2004186e6204186e411ca24ec0035fd6'

# Target setter captures previous wrapped target, mutates storage, then
# invokes the running-state observer. Observer sets retargeted before fresh target read.
for site, target in [(0x1007c660c, 0x1007e5078),
                     (0x1007c6638, 0x1007e5b24),
                     (0x1007c664c, 0x1007c5d3c),
                     (0x1007c5e18, 0x101150714),
                     (0x1007c5e3c, 0x1007c580c),
                     (0x1007c5eb0, 0x1007c5304)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# Initial capture reads current wrapped Value then writes initial SIMDValue;
# startTime storage precedes both calls in the native routine.
for site, target in [(0x1007c5b8c, 0x1007c4f7c),
                     (0x1007c5b94, 0x1007c66e8),
                     (0x1007c6734, 0x1007e5b24)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# Bezier kernel uses target timestamp d2 and native inclusive timing/clamp sequence.
assert read(0x1007c30a0, 4).hex() == '4840601e'
assert read(0x1007c3388, 8).hex() == '0820601e0d2c0054'
assert read(0x1007c33a4, 20).hex() == '010140fd0139611e2820601e22a4601ee9000054'
assert read(0x1007c33d8, 28).hex() == '2018601e0820601e01e4002f00ac611e01106e1e0020611e28cc601e'

# BezierFunction native storage includes original points plus six coefficients.
field_offset = 0x1012ce070 + 16
fields = field_offset + struct.unpack('<i', read(field_offset, 4))[0]
assert struct.unpack('<I', read(fields + 12, 4))[0] == 10
names = []
for index in range(10):
    slot = fields + 16 + index * 12 + 8
    address = slot + struct.unpack('<i', read(slot, 4))[0]
    names.append(read(address, 8).split(b'\x00')[0].decode())
assert names == ['x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'bx', 'by', 'ax', 'ay']

# Shared Bezier solver: eight Newton attempts and a 1e-6 derivative threshold.
assert read(0x1007d8e74, 4).hex() == '16018052'
assert struct.unpack('<d', read(0x1011727f8, 8))[0] == 1e-6

# Native Bezier preset literals and interpolation epsilon are fixed constants.
assert struct.unpack('<d', read(0x10116b158, 8))[0] == 0.42
assert struct.unpack('<d', read(0x10116b2f0, 8))[0] == 0.58
assert struct.unpack('<d', read(0x101198a58, 8))[0] == 0.0001

# BezierParameters stores curve/duration; Curve custom payload precedes four presets.
for descriptor, expected in [(0x1012ce0ac, ['curve', 'duration']),
    (0x1012ce0c8, ['custom', 'linear', 'easeIn', 'easeOut', 'easeInOut'])]:
    slot = descriptor + 16
    fields = slot + struct.unpack('<i', read(slot, 4))[0]
    count = struct.unpack('<I', read(fields + 12, 4))[0]
    assert count == len(expected)
    actual = []
    for index in range(count):
        slot = fields + 16 + index * 12 + 8
        name = slot + struct.unpack('<i', read(slot, 4))[0]
        actual.append(read(name, 16).split(b'\x00')[0].decode())
    assert actual == expected

# Constructor helper converts four control coordinates then rebuilds coefficients.
for site, target in [(0x1007c2e0c, 0x101150294),
                     (0x1007c2e20, 0x101150294),
                     (0x1007c2e38, 0x101150294),
                     (0x1007c2e4c, 0x101150294),
                     (0x1007c2e74, 0x1007d7ecc)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# InterpolatableAnimation has concrete default completion=false and projection=nil
# slots. Do not replace these native defaults with abstract traps or linear interpolation.
for descriptor, implementation in [(0x1012cda88 + 32 * 8, 0x1007c6408),
                                    (0x1012cda88 + 33 * 8, 0x1007c6410)]:
    slot = descriptor + 4
    assert slot + struct.unpack('<i', read(slot, 4))[0] == implementation
assert read(0x1007c6408, 8).hex() == '00008052c0035fd6'

# Driver frame opens CATransaction, disables actions, and commits before
# checking live registry emptiness and calling driver.stop/invalidation.
for page_pc, offset, expected in [(0x1007ca064, 0x8d0, b'begin'),
        (0x1007ca070, 0xca8, b'setDisableActions:'),
        (0x1007ca45c, 0x918, b'commit')]:
    slot = (page_pc & ~4095) + 3448 * 4096 + offset
    pointer = struct.unpack('<Q', read(slot, 8))[0]
    address = 0x100000000 + (pointer & 0xffffffff)
    assert read(address, len(expected) + 1) == expected + b'\x00'

# Driver registration tail guards active/empty before installing weak callback and starting.
assert read(0x1007c94d4, 8).hex() == '88824039a8040037'
assert read(0x1007c94f0, 12).hex() == 'a81640f9080940f9a80300b4'
assert read(0x1007c9538, 12).hex() == '080000d008d13491884e01a9'
assert read(0x1007c9560, 12).hex() == '880240f9084940f900013fd6'

# Immediate registration branches on ended before removal/insertion, then rejoins activation.
assert read(0x1007c93e0, 12).hex() == '081c00121f0d0071a1030054'
assert read(0x1007c9458, 4).hex() == '19000014'
assert read(0x1007c948c, 40).hex() == 'f50319aa20a30091a14302d122048052030080d2df2e2694a0e301d134a30091e1031caab4010094'

# Sleep error continuation aliases the normal resume path; cancellation is
# checked after weak owner load, and registration receives Duration.zero.
for site, target in [(0x1007cbfc8, 0x1007c9764),
                     (0x1007c97ac, 0x101151170),
                     (0x1007c97bc, 0x10115375c),
                     (0x1007c97dc, 0x1007c91c4)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 in (0b000101, 0b100101)
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# New driver-handler invalidation weakly captures coordinator, retains source,
# and resolves removal against its current source key at invocation time.
for site, target in [(0x1007c8d40, 0x1011556d0),
                     (0x1007cbd30, 0x1007cad04),
                     (0x1007cad3c, 0x1011556dc),
                     (0x1007cad78, 0x1007cb600)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 in (0b000101, 0b100101)
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# Descriptor payload cases and spring storage names recovered from field records.
for descriptor, names in [(0x1012ce4c4, [b'bezier', b'spring']),
                          (0x1012ce0e4, [b'response', b'dampingFraction']),
                          (0x1012ce4fc, [b'priority', b'delay', b'completion', b'id', b'driverSource', b'descriptor']),
                          (0x1012ce44c, [b'response', b'stiffness', b'drag', b'dt', b'idleVelocityThreshold']),
                          (0x1012ce488, [b'configuration', b'time', b'velocity', b'force'])]:
    slot = descriptor + 16
    fields = slot + struct.unpack('<i', read(slot, 4))[0]
    assert struct.unpack('<I', read(fields + 12, 4))[0] == len(names)
    for index, name in enumerate(names):
        slot = fields + 16 + index * 12 + 8
        address = slot + struct.unpack('<i', read(slot, 4))[0]
        assert read(address, len(name) + 1) == name + b'\x00'

# Scoot preflight uses 0.001, then falls back to SwiftUI Angle equality.
assert struct.unpack('<d', read((0x10009a314 & ~4095) + 4305 * 4096 + 0xd8, 8))[0] == 0.001
opcode = struct.unpack('<I', read(0x10009a864, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x10009a864 + delta * 4 == 0x10114fdb4

# Scoot reset angle constants and CGPoint length operation grouping.
for address, value in [(0x10116b0e0, 57.29577951308232),
                       (0x10116b0e8, 0.017453292519943295),
                       (0x10116b0f8, 3.141592653589793)]:
    assert struct.unpack('<d', read(address, 8))[0] == value
assert struct.unpack('<5I', read(0x10025feb8, 20)) == (
    0x1e600800, 0x1e610821, 0x1e612800, 0x1e61c000, 0xd65f03c0)
# Fresh Style loads precede the five subsequent property setters.
for site in [0x10009a750, 0x10009a774, 0x10009a798, 0x10009a7bc, 0x10009a7e0]:
    assert struct.unpack('<I', read(site, 4))[0] == 0xf8756a74

# Four scoot field-reset phases clear callbacks, reload the current field,
# stop that current animation, and clear the field. Calls use immediate=true in each phase.
for site, index_register in [(0x10009a3e0, 26), (0x10009a488, 25),
                             (0x10009a538, 24), (0x10009a614, 25)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction & 31 == 20 and (instruction >> 5) & 31 == 19
    assert (instruction >> 16) & 31 == index_register
for site in [0x10009a41c, 0x10009a4c4, 0x10009a574, 0x10009a650]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == 0x1007c606c

# windowDidChangeScreen reads the screen selector and resets only on nil.
slot = (0x10009aea4 & ~4095) + 5288 * 4096 + 0xc40
address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
assert read(address, 7) == b'screen\x00'
for site, target in [(0x10009aebc, 0x10009aed0), (0x10009af74, 0x10009b30c)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    if site == 0x10009aebc:
        assert opcode & 0xff00001f == 0xb4000000
        delta = (opcode >> 5) & 0x7ffff
        if delta & 0x40000: delta -= 0x80000
    else:
        assert opcode >> 26 == 0b000101
        delta = opcode & 0x3ffffff
        if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# The pinned AppMonitor preserves field metadata but its vtable does not
# provide method bodies through dynamic dispatch. Static constructor and
# callback bodies DO exist; see the direct-call pins below.
app_monitor_fields = 0x1013164f4
assert struct.unpack('<I', read(app_monitor_fields + 12, 4))[0] == 7
for index, name in enumerate([b'application', b'axObserver', b'runningApplication',
        b'cursorWindow', b'activeObserver', b'appIsActive', b'menusOpen']):
    record = app_monitor_fields + 16 + index * 12
    address = record + 8 + struct.unpack('<i', read(record + 8, 4))[0]
    assert read(address, len(name) + 1) == name + b'\x00'
for offset in range(0x88, 0x120, 8):
    assert pinned_imported_symbol(0x101550da8 + offset) == '_swift_deletedMethodError'
assert read(0x101550da8 + 0x120, 24) == bytes(24)
assert pinned_imported_symbol(0x101462ef8) == '_$s10Foundation21NSKeyValueObservationCMn'

# CAFilter name is XOR-decoded; selector is located by salted method hash.
assert bytes(byte ^ 0x6c for byte in read(0x1015c3108 + 32, 8)) == b'CAFilter'
assert read((0x1010308c0 & ~4095) + 593 * 4096 + 0x360, 128) == b'215bb664fac94b9e50faca8106be4dd77fd37a73606ca79682e992187974d983dfa5a32ce4dcfa868a6f0f6b3485a79252e0a79fef79b22854f9a6bdc92d54b\x00'
opcode = struct.unpack('<I', read(0x101030bd8, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x101030bd8 + delta * 4 == 0x10024bacc

# makeFilterInstance bridges each present erased value to Objective-C and
# sends setValue:forKey:, including boxed Optional.none values.
assert pinned_imported_symbol(0x101467f88) == '_$ss27_bridgeAnythingToObjectiveCyyXlxlF'
address = 0x100000000 + (struct.unpack('<Q', read(0x1015432e8, 8))[0] & 0xffffffff)
assert read(address, len(b'setValue:forKey:\x00')) == b'setValue:forKey:\x00'
opcode = struct.unpack('<I', read(0x10102b80c, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x10102b80c + delta * 4 == 0x101152fe8

# FilterConvertible has three generic requirements and six witness slots;
# the same-type requirement binds Keys.RawValue to Swift.String.
assert struct.unpack('<2I', read(0x1012ec08c, 8)) == (3, 6)
assert read(0x1012b85a0, 3) == b'SS\x00'
assert [struct.unpack('<I', read(0x1012ec0bc + i * 8, 4))[0] for i in range(6)] == [8, 8, 7, 3, 2, 0x11]
assert struct.unpack('<I', read(0x101347f28 + 12, 4))[0] == 7
for index, name in enumerate([b'colorSaturate', b'gaussianBlur', b'luminanceCurveMap',
        b'luminanceToAlpha', b'variableBlur', b'sdrNormalize', b'alphaThreshold']):
    record = 0x101347f28 + 16 + index * 12
    address = record + 8 + struct.unpack('<i', read(record + 8, 4))[0]
    assert read(address, len(name) + 1) == name + b'\x00'
assert struct.unpack('<I', read(0x10102dc98, 4))[0] == 0x52804040  # nil Bool tags2,2

# GaussianBlur Keys declaration order and projected key-path table/getters.
for index, (name, keypath, getter) in enumerate([
        (b'inputRadius', 0x101230618, 0x10102d1f4),
        (b'inputHardEdges', 0x1012305f0, 0x10102da00),
        (b'inputNormalizeEdges', 0x1012305c8, 0x10102db60)]):
    record = 0x101347d7c + 16 + index * 12
    address = record + 8 + struct.unpack('<i', read(record + 8, 4))[0]
    assert read(address, len(name) + 1) == name + b'\x00'
    pointer = 0x100000000 + (struct.unpack('<Q', read(0x101513680 + index * 8, 8))[0] & 0xffffffff)
    assert pointer == keypath
    assert keypath + 0x1c + struct.unpack('<i', read(keypath + 0x1c, 4))[0] == getter

# GaussianBlur stores property wrappers; erased setter casts conditionally,
# projection setter force-casts to the concrete Property specialization.
assert struct.unpack('<I', read(0x101347d48 + 12, 4))[0] == 3
for index, name in enumerate([b'_radius', b'_hardEdges', b'_normalizeEdges']):
    record = 0x101347d48 + 16 + index * 12
    address = record + 8 + struct.unpack('<i', read(record + 8, 4))[0]
    assert read(address, len(name) + 1) == name + b'\x00'
assert struct.unpack('<I', read(0x10102c6e8, 4))[0] == 0x528000c4
assert struct.unpack('<I', read(0x10102c8f4, 4))[0] == 0x528000e4

# Cursor filter cleanup dynamically tests GaussianBlur and writes layerFilters.
for site, target in [(0x10009560c, 0x10102ab28), (0x100095674, 0x101155118),
                     (0x100095718, 0x10102a564), (0x100095798, 0x101155118)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Window hide sets a Gaussian blur of7, runs an AppKit animation group, then
# orders out, restores alpha1, clears its filters and resumes continuation.
for slot, name in [(0x101542c10, b'runAnimationGroup:completionHandler:')]:
    address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
    assert read(address, len(name) + 1) == name + b'\x00'
for site, target in [(0x100095ef8, 0x10102bc88),
                     (0x100095f10, 0x100095858),
                     (0x10009e2bc, 0x100095580)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
assert struct.unpack('<I', read(0x100095f08, 4))[0] == 0x1e639001  # blur7
assert struct.unpack('<I', read(0x10009e2ac, 4))[0] == 0x1e6e1000  # alpha1

# orderOut prepares/reset in both visibility branches; visible path awaits
# Window's async hide, then weak-loads the delegate again for didHide.
for site, target, branch in [(0x1000933e8, 0x10009b30c, 0b100101),
                            (0x10009346c, 0x10009b30c, 0b100101),
                            (0x100093448, 0x100095a6c, 0b000101)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == branch and site + delta * 4 == target
assert struct.unpack('<I', read(0x1000934c4, 4))[0] == 0xf9400ea8
assert struct.unpack('<I', read(0x100093aec, 4))[0] == 0xf9400ea8

# Observed state uses owner activity tags1/2 and CG rectangle conversion.
assert struct.unpack('<I', read(0x100090cc4, 4))[0] == 0x7100051f
assert struct.unpack('<I', read(0x100090d0c, 4))[0] == 0x7100091f
for site, target in [(0x10009079c, 0x10101dbf8), (0x1000907a8, 0x100260398)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target
    assert opcode >> 26 == (0b000101 if site == 0x1000907a8 else 0b100101)

# Owner show writes Window visibility/association, updates it, then posts location.
opcode = struct.unpack('<I', read(0x100093058, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x100093058 + delta * 4 == 0x10009b1a8
assert struct.unpack('<I', read(0x100093030, 4))[0] == 0x3829690a

# Hotspot conversion uses the retained window's current Style and the screen
# containing (0,0), then flips around that screen frame's maxY (zero if absent).
for site, target in [(0x100090b30, 0x10101dca4),
                     (0x10101dcc8, 0x100261878),
                     (0x100261944, 0x101153da4),
                     (0x10101dd08, 0x101153de0)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Swift FieldRecord IsVar bit (0x2): owner fields are mutable; Window's
# MotionConfiguration is immutable. Preserve these source storage contracts.
for index in range(8):
    assert struct.unpack('<I', read(0x101316228 + 16 + index * 12, 4))[0] == 2
for index in range(22):
    assert struct.unpack('<I', read(0x10131631c + 16 + index * 12, 4))[0] == (0 if index == 1 else 2)

# Concrete cursor owner field order is distinct from Window's 22 fields.
assert struct.unpack('<I', read(0x101316228 + 12, 4))[0] == 8
for index, name in enumerate([b'delegate', b'targetWindowID', b'isMoving', b'shouldFadeOut',
                            b'window', b'correspondingApplicationPID', b'style', b'activityState']):
    record = 0x101316228 + 16 + index * 12
    address = record + 8 + struct.unpack('<i', read(record + 8, 4))[0]
    assert read(address, len(name) + 1) == name + b'\x00'
# Setter first writes owner's activity state then invokes Style's setter.
assert struct.unpack('<I', read(0x100090dac, 4))[0] == 0xf9408115

# Owner movement uses defaultCenter and posts a distinct location notification.
name_address = (0x100090068 & ~4095) + 4530 * 4096 + 0xa70
assert read(name_address, 35) == b'computerUseCursorLocationDidChange\x00'
for slot, name in [(0x101542150, b'defaultCenter'),
                   (0x101542e90, b'windowDidMove:'),
                   (0x101542b90, b'postNotificationName:object:')]:
    address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
    assert read(address, len(name) + 1) == name + b'\x00'
assert pinned_imported_symbol((0x100091144 & ~4095) + 5075 * 4096 + 0x658) == '_NSWindowDidMoveNotification'

# Cursor global registry uses Foundation weak-object hashing, not a strong list.
assert pinned_imported_symbol((0x100090470 & ~4095) + 5262 * 4096 + 0xea8) == '_OBJC_CLASS_$_NSHashTable'
slot = (0x10009047c & ~4095) + 5298 * 4096 + 0xe80
address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
assert read(address, 21) == b'weakObjectsHashTable\x00'

# Cursor isPressed accesses the Style getter/setter vtable, not an owner flag.
assert struct.unpack('<I', read(0x100090b6c, 4))[0] == 0xf9407113
assert struct.unpack('<I', read(0x100090bbc, 4))[0] == 0xf9407515

# Concrete cursor press uses 50ms animation time and the existing click delay.
assert struct.unpack('<2q', read(0x1011950d0, 16)) == (50000000000000000, 0)
for site, target in [(0x1000914a0, 0x100753e74), (0x100091720, 0x100753720)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
assert struct.unpack('<I', read(0x1000919c8, 4))[0] == 0x52800000

# Occlusion handler enumerates NSNumber IDs and always ends in Style hook.
for slot, name in [(0x101542b50, b'occlusionState'),
                   (0x101542eb0, b'windowNumbersWithOptions:'),
                   (0x101542ae0, b'integerValue')]:
    address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
    assert read(address, len(name) + 1) == name + b'\x00'
assert struct.unpack('<I', read(0x10009ac44, 4))[0] == 0xf100081f  # exact state2
assert struct.unpack('<I', read(0x100009888, 4))[0] == 0xd65f03c0  # default hook
opcode = struct.unpack('<I', read(0x10009ae60, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x10009ae60 + delta * 4 == 0x10009b1a8

# Application constructor uses the same element-cache builder as UIElement.
for site, target in [(0x100093d1c, 0x10071795c),
                     (0x100717970, 0x1011538f4),
                     (0x100717a08, 0x10076589c)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
# Owner PID is written before application construction; monitor uses a fresh
# window load while assignment retains the earlier destination.
assert struct.unpack('<I', read(0x100093d30, 4))[0] == 0xf87a6a94

# Concrete cursor window uses ordinary orderFront:, not orderFrontRegardless.
for slot, name in [(0x101542b60, b'orderFront:'), (0x101542b68, b'orderWindow:relativeTo:')]:
    address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
    assert read(address, len(name) + 1) == name + b'\x00'
assert struct.unpack('<I', read(0x1000946b0, 4))[0] == 0xd65f03c0

# AppMonitor observer registration has no ignored AX errors; KVO is .new
# followed by explicit active read. Deinit stops AX before invalidating KVO.
assert pinned_imported_symbol((0x10009c350 & ~4095) + 5068 * 4096 + 0x918) == '__swiftEmptyArrayStorage'
assert struct.unpack('<I', read(0x10009c36c, 4))[0] == 0x52800324  # qos25
assert struct.unpack('<I', read(0x10009c464, 4))[0] == 0x52800021  # KVO options1
for site, target in [(0x10009ca6c, 0x1006ed4a0), (0x10009ca88, 0x10114e71c)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# AppMonitor AX handler preserves checked, non-saturating menu accounting.
assert struct.unpack('<I', read(0x10009e93c, 4))[0] == 0xb1000515
assert struct.unpack('<I', read(0x10009e984, 4))[0] == 0xf1000515
for site, target in [(0x10009e888, 0x1007161c4),
                     (0x10009e8a8, 0x1006fa28c),
                     (0x10009e9b4, 0x10009a880),
                     (0x10009ea3c, 0x10009b1a8),
                     (0x10009ca28, 0x10009a880)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
slot = (0x10009ea08 & ~4095) + 5284 * 4096 + 0x518
address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
assert read(address, 10) == b'isVisible\x00'

# setWindowLevel C thunk reloads primary slot12, passing connection/window/level.
assert (0x10026cd20 & ~4095) + 4847 * 4096 + 0x570 == 0x10155b570
assert struct.unpack('<I', read(0x10026cd24, 4))[0] == 0xf942b903
assert struct.unpack('<I', read(0x10026cd28, 4))[0] == 0xaa1403e0
assert struct.unpack('<I', read(0x10026cd2c, 4))[0] == 0xaa1303e2
assert struct.unpack('<I', read(0x10026cd3c, 4))[0] == 0xd61f0060
# Native overlay promotion uses level key15 and AppKit level102.
assert struct.unpack('<I', read(0x10009a8e0, 4))[0] == 0x528001e0
assert struct.unpack('<I', read(0x10009a908, 4))[0] == 0x52800cc2

# setCorrespondingApplication -> static AppMonitor constructor -> AX observer.
# Deleted dynamic slots do not imply absence of statically dispatched bodies.
for site, target in [(0x100093d6c, 0x10009c188),
                     (0x10009c22c, 0x1006f4ab4),
                     (0x10009c290, 0x1006ea8f8),
                     (0x10009c2a0, 0x1006eb2bc),
                     (0x10009c2b0, 0x1006eb350),
                     (0x10009c37c, 0x1006ec20c),
                     (0x10009c504, 0x10009a880)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
# Constructor is assigned into the live Window field; not merely dead metadata.
assert struct.unpack('<2I', read(0x100093d78, 8)) == (0xf8686ab3, 0xf8286aa0)

# Overlay reason names/types and the two optional zero-argument handlers.
assert read(0x10128bea4, 6) == b'yycSg\x00'
assert struct.unpack('<I', read(0x101316558 + 12, 4))[0] == 2
for index, expected_name in enumerate([b'appMonitor', b'petLaunch']):
    record = 0x101316558 + 16 + index * 12
    name_address = record + 8 + struct.unpack('<i', read(record + 8, 4))[0]
    type_address = record + 4 + struct.unpack('<i', read(record + 4, 4))[0]
    assert read(name_address, len(expected_name) + 1) == expected_name + b'\x00'
    assert read(type_address, 3) == b'Sb\x00'
for index in [10, 11]:
    record = 0x10131631c + 16 + index * 12
    assert record + 4 + struct.unpack('<i', read(record + 4, 4))[0] == 0x10128bea4

# Cursor window notification ownership uses the workspace notification center.
for page, offset, selector in [(5295, 0xe20, b'sharedWorkspace'),
        (5294, 0xb38, b'notificationCenter'), (5294, 0x878, b'activeSpaceDidChange:'),
        (5294, 0x888, b'addObserver:selector:name:object:'), (5294, 0x510, b'removeObserver:')]:
    slot = 0x100094000 + page * 4096 + offset
    address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
    assert read(address, len(selector) + 1) == selector + b'\x00'
assert pinned_imported_symbol(0x100094000 + 5072 * 4096 + 0x678) == '_NSWorkspaceActiveSpaceDidChangeNotification'

# Designated cursor window appearance setup selectors.
for offset, selector in [(0x3e0, b'setTitle:'), (0x5a8, b'setCollectionBehavior:'),
        (0x588, b'setReleasedWhenClosed:'), (0xd00, b'setIgnoresMouseEvents:'),
        (0x308, b'setWantsLayer:'), (0x5f8, b'setView:'),
        (0x5e8, b'setContentViewController:'), (0x5d0, b'clearColor'),
        (0x318, b'setBackgroundColor:')]:
    slot = 0x100094000 + 5294 * 4096 + offset
    address = 0x100000000 + (struct.unpack('<Q', read(slot, 8))[0] & 0xffffffff)
    assert read(address, len(selector) + 1) == selector + b'\x00'

# Live cursor motion configuration copies a contiguous 28-Double constant
# table after clickAngle=-44 and candidateCount=20; do not substitute presets.
assert list(struct.unpack('<28d', read(0x10115bdf0, 224))) == [
    20.0, 0.41960295031576633, 0.15, 0.2765523188064277, 0.5783555327868779,
    10.0, 0.9, 0.12, 2.2, 0.9, 196.0, 0.24, 0.84, 12.0, 0.07, 0.82,
    0.09, 0.86, 0.095, 0.72, 0.0, 0.5, 0.38, 0.18, 0.055, 0.76, 76.0, 0.99]
assert struct.unpack('<I', read(0x1013160b0 + 12, 4))[0] == 30

# Cursor Window stores six concrete SpringAnimation owners (not generic
# interpolation boxes); position uses CGPoint and the other five use CGFloat.
window_fields = 0x10131631c
assert struct.unpack('<I', read(window_fields + 12, 4))[0] == 22
for index, name in enumerate([b'cursorMotionProgressAnimation', b'cursorScootPositionAnimation',
        b'cursorScootBaseRotationAnimation', b'cursorScootAxisAnimation',
        b'cursorScootStretchAnimation', b'cursorScootRotationAnimation'], start=4):
    record = window_fields + 16 + index * 12
    slot = record + 8
    address = slot + struct.unpack('<i', read(slot, 4))[0]
    assert read(address, len(name) + 1) == name + b'\x00'
    slot = record + 4
    typeref = slot + struct.unpack('<i', read(slot, 4))[0]
    assert read(typeref, 1) == b'\x02'
    assert typeref + 1 + struct.unpack('<i', read(typeref + 1, 4))[0] == 0x101461638
    assert read(typeref + 5, 2) == b'y\x02' and read(typeref + 11, 4) == b'GSg\x00'
    expected_argument = 0x101461958 if index == 5 else 0x101468d88
    assert typeref + 7 + struct.unpack('<i', read(typeref + 7, 4))[0] == expected_argument
assert 0x100000000 + (struct.unpack('<Q', read(0x101461638, 8))[0] & 0xffffffff) == 0x1012cdbd4
assert 0x100000000 + (struct.unpack('<Q', read(0x101461958, 8))[0] & 0xffffffff) == 0x1012bceac
assert pinned_imported_symbol(0x101468d88) == '_$s12CoreGraphics7CGFloatVMn'

# Descriptor factory constructs the matching concrete subclass.
for site, target in [(0x1007ea894, 0x1007c3b78),
                     (0x1007ea8e8, 0x1007c8844)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Spring owner composes configuration/state/base constructors, reset and frames.
for site, target in [(0x1007c87ac, 0x1007e7b64),
                     (0x1007c87f0, 0x1007e7eb4),
                     (0x1007c881c, 0x1007c6754),
                     (0x1007c7fa4, 0x1007e7f84),
                     (0x1007c7fb4, 0x1007c5b14),
                     (0x1007c8250, 0x1007c5b34),
                     (0x1007c83b4, 0x1007e8048),
                     (0x1007c83e4, 0x1007e80f4)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Position portion constructs literal 0.01, multiplies vectors, subtracts,
# then compares scalar squared measures; it is not a single distance < 0.01.
assert struct.unpack('<d', read((0x1007e8500 & ~4095) + 2435 * 4096 + 0xa8, 8))[0] == 0.01
for site, target in [(0x1007e8514, 0x1011532f4),
                     (0x1007e8668, 0x1011513c8),
                     (0x1007e8774, 0x101152844),
                     (0x1007e8898, 0x101150618),
                     (0x1007e88c8, 0x101150618)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Physical idle's first gate uses max squared motion > squared threshold.
for site, target in [(0x1007e847c, 0x101153330),
                     (0x1007e84ac, 0x1011513c8),
                     (0x1007e84c8, 0x101150618)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Logical completion converts elapsed simulation time to scalar and uses >=.
for site, target in [(0x1007c7b14, 0x101150294),
                     (0x1007c7b3c, 0x101150630)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Force stage: negative drag, damping product, target-position, spring product,
# sum. Then final force*half-dt and half-velocity addition.
for site, target in [(0x1007e9b10, 0x1011522f8),
                     (0x1007e9c8c, 0x1011513c8),
                     (0x1007e9dc4, 0x101152844),
                     (0x1007e9f98, 0x1011513c8),
                     (0x1007ea0bc, 0x101152838),
                     (0x1007ea2cc, 0x1011513c8),
                     (0x1007ea3ec, 0x101152838)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Drift converts full dt, then multiplies half-step velocity and adds position.
for site, target in [(0x1007e97b4, 0x101150294),
                     (0x1007e9934, 0x1011513c8),
                     (0x1007e9a64, 0x101152838)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# First integration stage converts Double half-dt before lane multiply/add.
for site, target in [(0x1007e9444, 0x101150294),
                     (0x1007e9618, 0x1011513c8),
                     (0x1007e9730, 0x101152838)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target

# Time loop calls physical step, reloads dt/time, adds dt and repeats while less.
opcode = struct.unpack('<I', read(0x1007e80c0, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x1007e80c0 + delta * 4 == 0x1007e8d54
opcode = struct.unpack('<I', read(0x1007e80d8, 4))[0]
delta = (opcode >> 5) & 0x7ffff
if delta & 0x40000: delta -= 0x80000
assert opcode & 15 == 4 and 0x1007e80d8 + delta * 4 == 0x1007e80b4

# Configuration bounds stiffness before drag and uses 0.06 for absent threshold.
for site, target in [(0x1007e7d40, 0x1007e8940),
                     (0x1007e7d68, 0x101153348),
                     (0x1007e7d8c, 0x1007e8b5c)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
assert struct.unpack('<d', read((0x1007e7dc8 & ~4095) + 2481 * 4096 + 0xa68, 8))[0] == 0.06

# Drag evaluates sqrt(stiffness) then two multiplications in scalar precision.
for site, target in [(0x1007e8cac, 0x101150408),
                     (0x1007e8d1c, 0x1011513c8),
                     (0x1007e8d30, 0x1011513c8)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b100101 and site + delta * 4 == target
assert struct.unpack('<q', read((0x1007e8cd4 & ~4095) + 2474 * 4096 + 0x190, 8))[0] == 2

# Private simulation type is VelocityVerletSimulation, not an analytic curve.
slot = 0x1012ce488 + 8
address = slot + struct.unpack('<i', read(slot, 4))[0]
assert read(address, 25) == b'VelocityVerletSimulation\x00'
# Stiffness numerator is 2*pi as Double before scalar conversion.
assert struct.unpack('<d', read((0x1007e8ad8 & ~4095) + 2435 * 4096 + 0x130, 8))[0] == 6.283185307179586

# Spring duration/bounce initializer and smooth preset share the same conversion.
for site, target in [(0x1007dc264, 0x1007dbcbc), (0x1007dbcbc, 0x1007dbcf0)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert opcode >> 26 == 0b000101 and site + delta * 4 == target

# Registration selects the last transaction (count - 1), not a priority scan.
assert struct.unpack('<I', read(0x1007c8b6c, 4))[0] == 0xd1000529
# Explicit-source nil branch enters fallback transaction-source resolution.
opcode = struct.unpack('<I', read(0x1007c8bb0, 4))[0]
delta = (opcode >> 5) & 0x7ffff
if delta & 0x40000: delta -= 0x80000
assert opcode & 31 == 22 and 0x1007c8bb0 + delta * 4 == 0x1007c8bc0

# Transaction body invocation is followed by CBNZ x21 to epilogue:
# thrown Swift error bypasses the successful-path last-element removal.
assert read(0x1007cac20, 8).hex() == '20013fd6150300b5'
opcode = struct.unpack('<I', read(0x1007cac24, 4))[0]
delta = (opcode >> 5) & 0x7ffff
if delta & 0x40000: delta -= 0x80000
assert 0x1007cac24 + delta * 4 == 0x1007cac84

# Transaction priorities use layout-priority values, not ordinal ranks.
assert [struct.unpack('<q', read(address, 8))[0] for address in
        [0x1011987c8, 0x1011987d0, 0x1011987d8, 0x1011987e0]] == [250, 500, 750, 1000]
opcode = struct.unpack('<I', read(0x1007eb618, 4))[0]
delta = opcode & 0x3ffffff
if delta & 0x2000000: delta -= 0x4000000
assert opcode >> 26 == 0b100101 and 0x1007eb618 + delta * 4 == 0x1011555e0

# Bezier constructor resolves scalar parameters before inline base storage
# initialization; base initializes current, initial and target from arguments.
for site, target in [(0x1007c3b2c, 0x1007c2c6c),
                     (0x1007c3b54, 0x1007c6754),
                     (0x1007c679c, 0x1007e5160),
                     (0x1007c67b4, 0x1007e5160),
                     (0x1007c67e8, 0x1007e5160),
                     (0x1007c6808, 0x1007c667c),
                     (0x1007c6810, 0x1007c66e8),
                     (0x1007c6818, 0x1007c6580)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 == 0b100101
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target

# Projected target setter delegates to a storage-only body, unlike the
# wrapped setter's old-value snapshot and target-change observer.
for site, target in [(0x1007c54f8, 0x1007c54fc),
                     (0x1007c69c8, 0x1007e5248)]:
    opcode = struct.unpack('<I', read(site, 4))[0]
    assert opcode >> 26 in (0b000101, 0b100101)
    delta = opcode & 0x3ffffff
    if delta & 0x2000000: delta -= 0x4000000
    assert site + delta * 4 == target
# Following storage write: end access, restore frame, return; no observer call.
assert read(0x1007c69d4, 24).hex() == 'bfc300d1fd7b43a9f44f42a9f65741a9f85fc4a8c0035fd6'

# ApproximatelyEquatable has Comparable and Epsilon:SIMDScalar signature
# requirements; witness layout is base, associated conformance, associated type,
# then one instance method (not a synthetic default-tolerance property).
assert struct.unpack('<II', read(0x1012ce2f0 + 12, 8)) == (2, 4)
assert [struct.unpack('<I', read(0x1012ce320 + i * 8, 4))[0]
        for i in range(4)] == [0, 8, 7, 0x11]
name_slot = 0x1012ce2f0 + 20
name_address = name_slot + struct.unpack('<i', read(name_slot, 4))[0]
assert read(name_address, 8) == b'Epsilon\x00'

# AnimationDriverSource is class-constrained with one factory method.
assert struct.unpack('<II', read(0x1012cdec0 + 12, 8)) == (1, 1)
assert struct.unpack('<I', read(0x1012cdec0 + 36, 4))[0] == 0x11
assert struct.unpack('<i', read(0x1012cde44 + 20, 4))[0] == 0
# Native base start/stop are genuinely no-op; display-link subclass overrides.
for descriptor in [0x1012cdea8, 0x1012cdeb0]:
    relative = descriptor + 4
    assert relative + struct.unpack('<i', read(relative, 4))[0] == 0x100009888
assert read(0x100009888, 4).hex() == 'c0035fd6'

# Display-link start/stop guard and mutation; frame reads are skipped with
# nil callback. Native run-loop mode is common, not a periodic timer.
assert read(0x1007d7934, 16).hex() == '88824039c803003793820039931640f9'
assert read(0x1007d759c, 20).hex() == '888240391f050071e10000549f820039801640f9'
assert read(0x1007d79f4, 16).hex() == '930a40f9330400b4951640f9d50400b4'
assert pinned_imported_symbol((0x1007d7980 & ~4095) + 3213 * 4096 + 0x988) == '_NSRunLoopCommonModes'

# Factory selector is zero-argument displayLinkDidFire, matching the restored
# Swift @objc method. Do not add a sender argument to explain unavailable frames.
selector_slot = (0x1007d7424 & ~4095) + 3436 * 4096 + 0x130
selector_pointer = struct.unpack('<Q', read(selector_slot, 8))[0]
selector_address = 0x100000000 + (selector_pointer & 0xffffffff)
assert read(selector_address, 19) == b'displayLinkDidFire\x00'

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

# GraphicsSupport filter factory uses a single ordered symbol request with two
# alternatives. Preserve the original image priorities and salt, not dlsym.
assert struct.unpack('<Q', read(0x1015c3138 + 16, 8))[0] == 3
assert struct.unpack('<3Q', read(0x1015c3138 + 32, 24)) == (0x02efd67f50396e76, 0x023f5c33484e6a09, 0x0201ae547159d0ad)
assert struct.unpack('<Q', read(0x1015c3178 + 16, 8))[0] == 2
assert struct.unpack('<2Q', read(0x1015c3178 + 32, 16)) == (0xc01ddf872290b0ce, 0xbd275f37e7008392)
assert read(0x1012812e0, 127) == b'd3ada88f56dc505b982f68a138ed2f61c7b3138b191a59efde335469f0aeb8b1d60ae7e55a72783254289a2628565e3c3dbefd54e73268a3d2334086f8ca7c\0'

# populated(from:) reads valueForKeyPath:, not valueForKey:, bridges AnyObject
# to Any, and skips absent KVC results before modifying the projected property.
filter_population_selector = struct.unpack('<Q', read(0x1015431d0, 8))[0]
assert read(0x100000000 + (filter_population_selector & 0xffffffff), 17) == b'valueForKeyPath:\0'
assert pinned_imported_symbol(0x101467060) == '_$ss018_bridgeAnyObjectToB0yypyXlSgF'

# CALayer typed-filter setter calls setFilters: even for an empty input; the
# original getter obtains filters then recognizes each object's description.
for slot, expected in [(0x101543868, b'setFilters:\0'), (0x101543840, b'filters\0'), (0x101543830, b'description\0')]:
    chained = struct.unpack('<Q', read(slot, 8))[0]
    assert read(0x100000000 + (chained & 0xffffffff), len(expected)) == expected

# Remaining GraphicsSupport filter field/key order recovered from descriptors.
def filter_field_names(table):
    count = struct.unpack('<I', read(table + 12, 4))[0]
    result = []
    for index in range(count):
        location = table + 16 + index * 12 + 8
        pointer = location + struct.unpack('<i', read(location, 4))[0]
        result.append(read(pointer, 128).split(b'\0')[0].decode())
    return result
for table, names in [
    (0x101347d10, ['_amount']), (0x101347d2c, ['inputAmount']),
    (0x101347db0, ['_inputValues', '_inputAmount']), (0x101347dd8, ['inputValues', 'inputAmount']),
    (0x101347e00, ['_inputPremultipliedValues']), (0x101347e1c, ['inputPremultipliedValues']),
    (0x101347e38, ['_radius', '_normalizeEdges', '_inputFade', '_inputSourceSublayerName']),
    (0x101347e78, ['inputRadius', 'inputNormalizeEdges', 'inputFade', 'inputSourceSublayerName']),
    (0x101347eb8, []), (0x101347ec8, ['_amount', '_color']), (0x101347ef0, ['inputAmount', 'inputColor']),
]:
    assert filter_field_names(table) == names
# Defaults: ColorSaturate amount0; VariableBlur radius0, Bool nil tags 2/2,
# String nil; AlphaThreshold amount0/color nil. EmptyKeys init returns nil.
assert struct.unpack('<2I', read(0x1000478b8, 8)) == (0x2f00e400, 0xd65f03c0)
assert struct.unpack('<I', read(0x10102f4c0, 4))[0] == 0x52804040
assert struct.unpack('<I', read(0x10102fddc, 4))[0] == 0xd2800000

# updateFilter searches by conditional concrete-type cast, then uses a fresh
# layerFilters getter for replacement/append. Nil removes all matches.
for address, destination in [(0x10102bdd0, 0x10102c3ec), (0x10102be48, 0x10102c3ec),
    (0x10102c080, 0x10102c3ec), (0x10102bfd0, 0x10102ab28), (0x10102be9c, 0x10102ab28)]:
    instruction = struct.unpack('<I', read(address, 4))[0]
    assert instruction >> 26 == 0b100101
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert address + displacement * 4 == destination

# Blur transition and alpha fade use 0.44 seconds and EaseInEaseOut, not
# NSAnimationContext's default duration or an invented easing curve.
assert struct.unpack('<d', read(0x10116b0f0, 8))[0] == 0.44
assert pinned_imported_symbol(0x101462470) == '_kCAMediaTimingFunctionEaseInEaseOut'
for slot, expected in [(0x101542cb0, b'setDuration:\0'), (0x101542da0, b'setTimingFunction:\0'),
    (0x1015428b0, b'animator\0'), (0x101542c48, b'setAlphaValue:\0')]:
    chained = struct.unpack('<Q', read(slot, 8))[0]
    assert read(0x100000000 + (chained & 0xffffffff), len(expected)) == expected

# Owner hide notification is separate from its location-change notification.
assert read(0x101242a50, 25) == b'computerUseCursorDidHide\0'

# The remaining Delegate requirement is asynchronous will-move (slot +8),
# receiving point, original aboveWindowID and animated. isDelegate skips this
# ownership phase; isMoving is set only after the awaited callback rejoins.
assert struct.unpack('<I', read(0x100092090, 4))[0] == 0xf9400668
move_delegate_branch = struct.unpack('<I', read(0x100092000, 4))[0]
move_delegate_delta = (move_delegate_branch >> 5) & 0x3fff
if move_delegate_delta & 0x2000: move_delegate_delta -= 0x4000
assert 0x100092000 + move_delegate_delta * 4 == 0x10009212c
assert struct.unpack('<I', read(0x10009242c, 4))[0] == 0x38336a95

# Hidden move appearance prepares alpha0/blur7 when either animated or fadeIn
# is set. It runs after the delegate prefix and before the window motion body.
for site, target in [(0x100092214, 0x10102bc88)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target
assert struct.unpack('<I', read(0x1000921ec, 4))[0] == 0xd2e80388
assert struct.unpack('<I', read(0x10009217c, 4))[0] == 0x2f00e400

# Absolute cursor origin uses the shared CG/AppKit point flip, then subtracts
# captured window height and reads the current style hotspot twice (+0xa8).
for site, target in [(0x1000948a4, 0x10101dd38), (0x1000948c0, 0x101153dc8),
                     (0x10101dcc8, 0x100261878)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target
assert struct.unpack('<I', read(0x1000948d8, 4))[0] == 0xf9405513
assert struct.unpack('<I', read(0x1000948fc, 4))[0] == 0xf9405513

# Move initial origin computes prior-hotspot origin even when visible, then
# unconditionally reads the current frame before the visibility/animation pick.
assert struct.unpack('<I', read(0x100094994, 4))[0] == 0xf9405513
assert struct.unpack('<I', read(0x1000949d4, 4))[0] == 0xf9405513
for address in [0x100094a18, 0x100094a1c, 0x100094a24, 0x100094a28]:
    assert (struct.unpack('<I', read(address, 4))[0] & 0xff200c00) == 0x1e200c00

# Relative origin conversion occurs twice around the real reset call. The
# interpolated origin is captured before reset and restored afterwards.
for site, target in [(0x100094a4c, 0x10101dd34), (0x100094a8c, 0x10009b30c),
                     (0x100094ab8, 0x10101dd34)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target
assert struct.unpack('<I', read(0x100094a84, 4))[0] == 0x6d402d0a
assert struct.unpack('<I', read(0x100094a98, 4))[0] == 0x6d002d0a

# Window move association writes wants/id before optional temporary promotion,
# uses the same level SPI, and always rejoins the visibility updater.
for site, target, branch in [(0x10009a9f0, 0x10026ccf8, 0b100101),
                            (0x10009aa14, 0x10009b1a8, 0b000101),
                            (0x100094b18, 0x10009a950, 0b100101)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == branch and site + displacement * 4 == target

# Non-animation cleanup clears only the temporary overlay bit, lowers to0
# only without AppMonitor ownership, then calls visibility update.
assert struct.unpack('<I', read(0x100094bd8, 4))[0] == 0x3900051f
instruction = struct.unpack('<I', read(0x100094bf8, 4))[0]
displacement = instruction & 0x3ffffff
if displacement & 0x2000000: displacement -= 0x4000000
assert instruction >> 26 == 0b100101 and 0x100094bf8 + displacement * 4 == 0x10009b1a8

# Move callbacks share a resumed flag. Completion weak-loads the owner before
# consulting it, resumes if necessary, then clears isMoving only if !isDelegate.
for site, target in [(0x100092f64, 0x10115564c), (0x100092fc0, 0x101150fe4),
                     (0x100092f0c, 0x101150fe4)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target
assert struct.unpack('<I', read(0x100092fe4, 4))[0] == 0x38346a7f

# Close-enough timing is a plain two-case enum; thresholds are ANDed, inclusive.
assert filter_field_names(0x101316298) == ['progressThreshold', 'distanceThreshold']
assert filter_field_names(0x1013162c0) == ['closeEnough', 'finished']
assert struct.unpack('<2d', read(0x10115efd0, 16)) == (0.995, 3.157)
for site in [0x100097914, 0x100097d98]:
    assert struct.unpack('<I', read(site, 4))[0] & 0xf == 0xb  # B.LT excludes low/unordered progress
for site in [0x100097924, 0x100097da8]:
    assert struct.unpack('<I', read(site, 4))[0] & 0xf == 0x8  # B.HI excludes high/unordered distance

# Progress-motion finish clears the live progress and interaction slots after
# interaction callback, then clears captured completion and timing before it runs.
for address, instruction in [(0x100097c84, 0xf8286a7f), (0x100097c90, 0xa9007edf),
    (0x100097ca8, 0xa9007d1f), (0x100097cb4, 0x38286a7f)]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction

# Linear motion projects position onto the start-target vector; the native
# envelope uses rise/0.22 and fall^0.62. Squared-length threshold is0.001.
assert struct.unpack('<d', read(0x10116b0d8, 8))[0] == 0.001
assert struct.unpack('<2d', read(0x10116b100, 16)) == (0.22, 0.62)
assert struct.unpack('<I', read(0x1000974b4, 4))[0] & 0xf == 0xb  # LT includes unordered
instruction = struct.unpack('<I', read(0x100097520, 4))[0]
displacement = instruction & 0x3ffffff
if displacement & 0x2000000: displacement -= 0x4000000
assert instruction >> 26 == 0b100101 and 0x100097520 + displacement * 4 == 0x101154cd4

# Motion direction uses literal degree/radian factors and CGPoint.length's
# multiply/add/sqrt implementation, not hypot or angle normalization.
assert struct.unpack('<2d', read(0x10116b0e0, 16)) == (57.29577951308232, 0.017453292519943295)
for site, target in [(0x100097bcc, 0x10025feb8), (0x100097bf0, 0x1011545c0)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target

# Motion frame writeback rounds only the absolute window origin and calls the
# separate association stage afterwards; interpolated storage stays unrounded.
for site, target in [(0x100097b44, 0x100260b40), (0x100097b6c, 0x10009aa1c)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target
frame_origin_selector = struct.unpack('<Q', read(0x101542548, 8))[0]
assert read(0x100000000 + (frame_origin_selector & 0xffffffff), 16) == b'setFrameOrigin:\0'

# Moving temporary overlay tests the hotspot against AppKit windows below the
# cursor. Only reaching the current non-nil corresponding ID clears it.
selector = struct.unpack('<Q', read(0x101542ea8, 8))[0]
name = b'windowNumberAtPoint:belowWindowWithWindowNumber:\0'
assert read(0x100000000 + (selector & 0xffffffff), len(name)) == name
instruction = struct.unpack('<I', read(0x10009abd4, 4))[0]
displacement = instruction & 0x3ffffff
if displacement & 0x2000000: displacement -= 0x4000000
assert instruction >> 26 == 0b000101 and 0x10009abd4 + displacement * 4 == 0x10009b1a8

# Terminal tangent blending uses clickAngle*pi/180 and a cubic ease-out after
# MotionConfiguration field29 (terminalTangentBlendStart).
assert struct.unpack('<d', read(0x10116b0f8, 8))[0] == 3.141592653589793
for site, target in [(0x100097f68, 0x101154458), (0x100097ff4, 0x101154cd4)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert instruction >> 26 == 0b100101 and site + displacement * 4 == target
assert struct.unpack('<I', read(0x100097fcc, 4))[0] == 0xfd407661

# Piecewise cubic sampling stores three points per segment (48 bytes), chooses
# the last segment/local t1 for p>=1 or unordered, and returns a local derivative.
assert struct.unpack('<I', read(0x1000952ec, 4))[0] == 0x5280060a
assert struct.unpack('<2d', read(0x10115bef0, 16)) == (3.0, 6.0)
instruction = struct.unpack('<I', read(0x1000953ac, 4))[0]
displacement = instruction & 0x3ffffff
if displacement & 0x2000000: displacement -= 0x4000000
assert instruction >> 26 == 0b100101 and 0x1000953ac + displacement * 4 == 0x10009df30

# Empty planning screen inventory returns CGRectNull.
assert pinned_imported_symbol(0x101464b98) == '_CGRectNull'

# Planner straight-distance threshold branch, /3 and exact 2/3 constant;
# CGPoint.distance tail-calls hypot instead of sqrt(x*x+y*y).
for address, expected_bytes in [
    (0x1000980d8, '69060054'), (0x1000981ac, '0210611e'),
    (0x1000981c0, 'e8f300b2'), (0x1000981c4, 'a8fce7f2'),
    (0x10025fefc, '8cd23b14')
]:
    assert read(address, 4).hex() == expected_bytes

# Candidate-generator relative handle cap and second seed scale.
assert struct.unpack('<d', read(0x10116b148, 8))[0] == 0.9
assert struct.unpack('<d', read(0x10116b170, 8))[0] == 0.65

# Ordered arc/flow scale grids used by candidate generation.
assert struct.unpack('<3d', read(0x10154b7d0, 24)) == (0.55, 0.8, 1.05)
assert struct.unpack('<3d', read(0x10154b810, 24)) == (0.65, 1.0, 1.35)
assert struct.unpack('<d', read(0x10116b178, 8))[0] == 0.16

# Per-segment metric sampler's angle threshold and wrapping constants.
assert struct.unpack('<d', read(0x10116b0a8, 8))[0] == 0.01
assert struct.unpack('<d', read(0x10116b120, 8))[0] == -2 * 3.141592653589793
assert struct.unpack('<d', read(0x10116b128, 8))[0] == -3.141592653589793
assert struct.unpack('<d', read(0x10116b130, 8))[0] == 2 * 3.141592653589793

# Endpoint alignment score's threshold and normalization interval.
assert struct.unpack('<d', read(0x10116b110, 8))[0] == -0.08
assert struct.unpack('<d', read(0x10116b118, 8))[0] == 0.92

# In-bounds filtering, empty filtered-pool fallback, strict score comparison.
for address, expected_bytes in [(0x1000986e0, 'c0000054'),
    (0x1000987e8, 'a80000b4'), (0x100098a48, 'c5fcff54')]:
    assert read(address, 4).hex() == expected_bytes

# Progress tick scales local derivative by segment count and falls back
# to unscaled position delta on zero/unordered resulting speed.
for address, expected_bytes in [(0x100097e24, '21d8617e'),
    (0x100097e28, '0008611e'), (0x100097e50, '0d020054'),
    (0x100097e94, '2939601e'), (0x100097ec0, '0839601e')]:
    assert read(address, 4).hex() == expected_bytes

# Geometric spring-response normalizers and complexity weights.
for address, value in [(0x10116b138, 0.55), (0x10116b140, 4.39822971502571),
    (0x10116b150, 0.04), (0x10116b158, 0.42), (0x10116b160, 0.38),
    (0x10116b168, 0.12), (0x10115b898, 0.28), (0x10115b8d0, 0.2)]:
    assert struct.unpack('<d', read(address, 8))[0] == value

# Progress callback weak-owner/weak-animation/live-slot identity gates.
for address, expected_bytes in [(0x10009726c, '000400b4'),
    (0x100097290, 'a00200b4'), (0x1000972a4, '680100b4'),
    (0x1000972ac, '21010054')]:
    assert read(address, 4).hex() == expected_bytes

# SystemSelection's three reference fields; refetchable owner stores the
# diffing flag and resolves its window from the current selection.
for address, expected_bytes in [(0x10023cbac, '800240f9'),
    (0x10023cbf0, '800640f9'), (0x10023cc34, '800a40f9'),
    (0x10022e618, '966a2838'), (0x10022e5cc, '806a73f8')]:
    assert read(address, 4).hex() == expected_bytes

# Refetch policy reads both monitor fields under lock, short-circuits layout
# before identity/set lookup, then optionally validates only invalidUIElement.
for address, expected_bytes in [(0x10022e9fc, '60434039'),
    (0x10022ea00, '610f40f9'), (0x10022eac0, '97020036'),
    (0x10022eb5c, '96050036'), (0x10022ec10, '68050036'),
    (0x10022eca4, '284e8c12'), (0x10022ecac, '3f01086b')]:
    assert read(address, 4).hex() == expected_bytes

# Refetch comparison witness slots: role, subrole (UIElementProtocol), then
# roleDescription/title/value/valueDescription/description/placeholder/help/
# identifier/URL (AccessibilityNode). Both value mismatch paths test ignore.
for address, expected_bytes in [(0x10022f874, 'a91a40f9'),
    (0x10022f914, 'e81e40f9'), (0x10022f9bc, 'a81e40f9'),
    (0x10022fa64, 'a82240f9'), (0x10022fb14, 'a82a40f9'),
    (0x10022fba0, 'a82e40f9'), (0x10022fc80, 'a82640f9'),
    (0x10022fd28, 'a86e40f9'), (0x10022fdd0, 'a83640f9'),
    (0x10022fe78, 'a83a40f9'), (0x10022ff54, 'a93e40f9'),
    (0x10022fb9c, '281b0036'), (0x10022fc4c, 'a8150036')]:
    assert read(address, 4).hex() == expected_bytes

# Recovery first searches old observation with ignore=false, requires one,
# then searches refreshed observation with the requested ignore flag.
for address, expected_bytes in [(0x10022f21c, '01008052'),
    (0x10022f244, 'df0600f1'), (0x10022f270, '41030012'),
    (0x10022f284, '081400b4'), (0x10022f288, '1f0500f1'),
    (0x10023029c, '293540f9'), (0x100654904, '153540f9')]:
    assert read(address, 4).hex() == expected_bytes

# Refetchable wrapper holds tree strongly; write delegates to setValue witness,
# skips refresh on write error, otherwise requests validate=true/ignore=true.
for address, expected_bytes in [(0x100232300, '951e00f9'),
    (0x1002313c8, '801e40f9'), (0x100231748, '282f40f9'),
    (0x100231778, 'b40000b5'), (0x10023177c, '20008052'),
    (0x100231780, '21008052'), (0x1002316c4, 'd763f997')]:
    assert read(address, 4).hex() == expected_bytes

# Transformed TreeCache value keeps full transaction plus the monitor pointer.
for address, expected_bytes in [(0x10076ca24, '081480b9'),
    (0x10076ca44, '081880b9'), (0x10076ca48, 'b36a28f8'),
    (0x10076d2cc, '081480b9')]:
    assert read(address, 4).hex() == expected_bytes

# Application primary window prefers focused, then main, then last AXWindows
# element (array header32 + (count-1)*32 == count*32).
for address, expected_bytes in [(0x1007161ec, '200500b5'),
    (0x100716204, '600400b5'), (0x10071621c, '080840f9'),
    (0x100716224, '0814088b'), (0x100716228, '135140a9')]:
    assert read(address, 4).hex() == expected_bytes

# FocusedUIElementContext stored fields and exact nested error cases come from
# Swift reflection, independently of disassembler's nearest-symbol labels.
def focus_context_relative(address):
    return address + struct.unpack('<i', read(address, 4))[0]

def focus_context_fields(descriptor):
    table = focus_context_relative(descriptor + 16)
    _, _, _, stride, count = struct.unpack('<IIHHI', read(table, 16))
    result = []
    for index in range(count):
        field = table + 16 + index * stride
        name = read(focus_context_relative(field + 8), 100).split(b'\0')[0].decode()
        result.append((name, field))
    return result

assert [name for name, _ in focus_context_fields(0x1012cd2d0)] == ['element', 'applicationWindow']
focus_context_error_fields = focus_context_fields(0x1012cd2ec)
assert [name for name, _ in focus_context_error_fields] == [
    'noAppNameMatch', 'noFrontmostApp', 'noWindowsAvailable', 'cgWindowNotFound', 'invalidProcessIdentifier']
assert read(focus_context_relative(focus_context_error_fields[0][1] + 4), 3) == b'SS\0'
assert all(read(field + 4, 4) == b'\0' * 4 for _, field in focus_context_error_fields[1:])

# Extraction checks first tree root; fullUI(tag0) alone owns a monitor.
# Event-stream(tag1) plus web-shaped selects20 children; otherwise100.
for address, expected_bytes in [(0x1002384d4, '880a40f9'),
    (0x100238500, '966a68f8'), (0x10023863c, '1f1d0072'),
    (0x100238648, '7f2a00f9'), (0x1002386d0, 'e81a80b9'),
    (0x10023871c, '1f050071'), (0x100238728, '880c8052'),
    (0x10023872c, '89028052'), (0x100238730, '3411889a')]:
    assert read(address, 4).hex() == expected_bytes

# Extraction root fallback, enablement/focus gates and explicit assertion
# disable on both normal and error exits. Metadata0x88 resolves disable().
for address, expected_bytes in [(0x10023825c, '480200b4'),
    (0x100238348, 'd7060036'), (0x1002383d0, 'd40200b4'),
    (0x100238978, '084540f9'), (0x100238aec, '084540f9')]:
    assert read(address, 4).hex() == expected_bytes
assert 0x100000000 + (struct.unpack('<Q', read(0x101573388, 8))[0] & 0xffffffff) == 0x1007007e4

# Existing focus skips Electron fallback. Selection predicate accepts positive
# CFRange.length or marker range presence, without validating range.location.
for address, expected_bytes in [(0x10023ae08, '540500b5'),
    (0x10023ae1c, '20040036'), (0x10023c008, 'a2000037'),
    (0x10023c00c, '3f0000f1'), (0x10023c010, '6d000054'),
    (0x10023c03c, 'f3079f1a')]:
    assert read(address, 4).hex() == expected_bytes

# Both selected-range property entries pass ignoringTypeMismatch=false.
assert read(0x10078ec2c, 4).hex() == '01008052'
assert read(0x10078e9d8, 4).hex() == '01008052'

# Recursive tree entry uses path.count, not cursor.depth, with signed <201.
assert pinned_imported_symbol(0x101463668) == '_$s10Foundation9IndexPathV5countSivg'
assert pinned_imported_symbol(0x101463688) == '_$s10Foundation9IndexPathV9appendingyACSiF'
for address, expected_bytes in [(0x100769c8c, '1f2403f1'),
    (0x100769c90, '2b070054'), (0x100769dd8, '54210036'),
    (0x10076a0c4, 'a0fb0736'), (0x10076a0d4, 'e0031caa')]:
    assert read(address, 4).hex() == expected_bytes

# Visible-child policy has positive count, event-stream/web special handling,
# strict >threshold, and branch-specific >499 positional filtering guards.
for address, expected_bytes in [(0x1007a4284, '7f0700f1'),
    (0x1007a4290, '1f050071'), (0x1007a42a0, '7fcf07f1'),
    (0x1007a42a4, '88070054'), (0x1007a42bc, 'cd020054'),
    (0x1007a4360, '7fcf07f1'), (0x1007a437c, '800c8052'),
    (0x1007a4380, '01008052')]:
    assert read(address, 4).hex() == expected_bytes

# RefetchableSkyshotAXTree.Error: recover names from reflection records,
# rather than guessing from redacted logs or protocol error strings.
refetch_descriptor = 0x1012c16f4
assert struct.unpack('<I', read(refetch_descriptor, 4))[0] & 0x1f == 0x12
assert struct.unpack('<II', read(refetch_descriptor + 20, 8)) == (1, 5)
refetch_fields_slot = refetch_descriptor + 16
refetch_fields = refetch_fields_slot + struct.unpack('<i', read(refetch_fields_slot, 4))[0]
assert refetch_fields == 0x10131a818
assert struct.unpack('<HHI', read(refetch_fields + 8, 8)) == (2, 12, 6)
refetch_cases = []
for index in range(6):
    name_slot = refetch_fields + 16 + index * 12 + 8
    name_address = name_slot + struct.unpack('<i', read(name_slot, 4))[0]
    refetch_cases.append(read(name_address, 64).split(b'\0', 1)[0].decode())
assert refetch_cases == ['invalidElementID', 'noInvalidationMonitorProvided',
    'elementAmbiguousBeforeRefetch', 'elementAmbiguousAfterRefetch',
    'elementNoLongerValid', 'elementNoLongerValidAfterRefetch']
payload_slot = refetch_fields + 20
payload_type = payload_slot + struct.unpack('<i', read(payload_slot, 4))[0]
assert read(payload_type, 3) == b'Si\0'
for address, encoded in [(0x10022f4c0, 0x52800028),
    (0x10022f5c0, 0x52800088), (0x10022f684, 0x52800048),
    (0x10022ecb4, 0x52800074)]:
    assert struct.unpack('<I', read(address, 4))[0] == encoded

# Indexed resolution passes ignoreValueChange=false and retains the exact
# invalid ID as the Int payload (rather than subtracting a one-based offset).
assert read(0x10022e8b8, 4).hex() == '02008052'
assert read(0x10022e820, 4).hex() == '380000f9'
assert read(0x10022e824, 4).hex() == '3f200039'

# The publication helper invokes SystemSelection's value-witness assignWithCopy
# (metadata VWT offset0x18); the return then copies from stored current selection.
assert read(0x1002324c8, 4).hex() == '080d40f9'
assert read(0x1002324cc, 4).hex() == 'e00313aa'
assert read(0x1002324d0, 4).hex() == 'e10314aa'
assert read(0x1002324d4, 4).hex() == '00013fd6'

# Extraction selects append only when diffing is enabled and previous exists.
assert read(0x10023badc, 4).hex() == 'a8060036'
assert read(0x10023bae0, 4).hex() == '940600b4'

assert pinned_imported_symbol(0x101467f90) == '_$ss27_stringCompareWithSmolCheck__9expectingSbs11_StringGutsV_ADs01_G16ComparisonResultOtF'

assert pinned_imported_symbol(0x101465f70) == '_$sSDyq_Sgxcis'
assert read(0x100645720, 4).hex() == "080113ab"

# Ordered identities bypass retention computation and return nil. Strict
# comparison uses the initial -1 sentinel, not a nondecreasing comparison.
assert read(0x10063791c, 4).hex() == '000080d2'
assert read(0x100637b80, 4).hex() == '08008092'
assert read(0x100637bfc, 4).hex() == '1f0114eb'
retention_order_branch = struct.unpack('<I', read(0x100637c04, 4))[0]
assert retention_order_branch & 0xff00001f == 0x5400000b

# Greedy retention requires strict offset increase and a sufficient suffix
# length; it updates the previous offset only after selecting an identity.
for address, condition in [(0x100638458, 0xa), (0x10063847c, 0xb)]:
    instruction = struct.unpack('<I', read(address, 4))[0]
    assert instruction & 0xff00001f == 0x54000000 | condition

# Buffer retains the difference and materializes changes, initially unsorted.
assert struct.unpack('<I', read(0x1012c985c, 4))[0] == 3
buffer_fields = 0x101321578
assert struct.unpack('<I', read(buffer_fields + 12, 4))[0] == 3
buffer_names = []
for i in range(3):
    slot = buffer_fields + 16 + i * 12 + 8
    address = slot + struct.unpack('<i', read(slot, 4))[0]
    buffer_names.append(read(address, 64).split(b'\0', 1)[0].decode())
assert buffer_names == ['difference', 'changes', 'changesSortedDepthFirst']
assert read(0x10064145c, 4).hex() == '03008052'

assert pinned_imported_symbol(0x101463678) == '_$s10Foundation9IndexPathV7compareySo18NSComparisonResultVACF'

# none/remove/insert/update priorities are 0/1/2/3, independently of tags.
for address, encoded in [(0x10063f2bc, 0xd2800014), (0x10063f380, 0x52800034),
    (0x10063f348, 0x52800054), (0x10063f310, 0x52800074)]:
    assert struct.unpack('<I', read(address, 4))[0] == encoded
assert read(0x10064128c, 4).hex() == '28008052'

# Native revision storage includes retained changes and previous revision.
revision_fields_slot = 0x1012c9bf8
revision_fields = revision_fields_slot + struct.unpack('<i', read(revision_fields_slot, 4))[0]
assert revision_fields == 0x101321890
assert struct.unpack('<I', read(revision_fields + 12, 4))[0] == 8
revision_names = []
for i in range(8):
    slot = revision_fields + 16 + i * 12 + 8
    address = slot + struct.unpack('<i', read(slot, 4))[0]
    revision_names.append(read(address, 64).split(b'\0', 1)[0].decode())
assert revision_names == ['lineageID', 'tree', 'renderTree', 'focusTree',
    'focusRenderTree', 'ids', 'changes', 'previousRevision']

# Informational context tag2 plus attributed text bypasses value replacement.
assert read(0x10075b188, 4).hex() == "3f090071"

# Native Mac tree transform forwards to the generic traversal with a contextless
# dispatch thunk. It does not capture/replace node ownership with the for: app.
assert read(0x1007665d4, 4).hex() == '030080d2'
for site, target in [(0x1007665ec, 0x100651398), (0x100767f84, 0x1007595fc)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction >> 26 == 0b000101
    displacement = instruction & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert site + displacement * 4 == target

# Two specialization trampolines retain the native generic rebuild chain.
for site, target in [(0x10076aba8, 0x100768a84)]:
    instruction = struct.unpack('<I', read(site, 4))[0]
    assert instruction >> 26 == 0b000101, hex(site)
    displacement = instruction & 0x3ffffff
    if displacement & (1 << 25): displacement -= 1 << 26
    assert site + displacement * 4 == target, hex(site)
# Shared builder depth guard remains path.count < 201.
assert struct.unpack('<I', read(0x100768d34, 4))[0] == 0xf103241f

# The apparent Protobuf symbol is a merged constant-return implementation;
# the CUA default threshold thunk returns 100, not a child-array reader.
assert struct.unpack('<II', read(0x1007a44ec, 8)) == (0x52800c80, 0xd65f03c0)

# Extractor child filter is the unconditional true closure.
assert struct.unpack('<II', read(0x10023d79c, 8)) == (0x52800020, 0xd65f03c0)

# Resolved focus leaves receive the native nil optional subset payload.
assert struct.unpack('<QQ', read(0x101159da0, 16)) == (0, 1)

# differenceLines budget traversal seed: Change tags, option bits 2/3,
# queued render starts at zero; suppressed subtree/update consumes one.
for site, expected in [(0x10062b9c4, '1f040071'), (0x10062b9cc, '60070035'),
    (0x10062ba44, '1f080071'), (0x10062baec, 'd3051037'),
    (0x10062bb5c, '13041837'), (0x10062bb98, '010080d2'),
    (0x10062bc14, '21008052')]:
    assert read(site, 4).hex() == expected, hex(site)

# Difference budget prefix pops from the Deque tail (head + count - 1),
# increments once per render, and stops at equality with remaining budget.
for site, expected in [(0x10062a384, '3f0008eb'), (0x10062a388, 'eb040054'),
    (0x10062a448, '080500f1'), (0x10062a454, '2901088b'),
    (0x10062a470, 'a80e00f9'), (0x10062a40c, '18070091'),
    (0x10062a420, '001e0054'), (0x10062a7f4, '001348fa')]:
    assert read(site, 4).hex() == expected, hex(site)

# Ignore bypass; pending + equal-budget rejection; debit and callback payload.
for site, expected in [(0x10062a358, 'c8000036'), (0x10062a7ec, '1f0100f1'),
    (0x10062a7f8, '807d0054'), (0x10062ac04, '080118eb'),
    (0x10062b7b4, '608a40f9'), (0x10062b7b8, '01008052'),
    (0x10062b7c0, 'c0023fd6')]:
    assert read(site, 4).hex() == expected, hex(site)

# Summary removals set the accumulated flag; final summary budget check has
# its own option gate, remaining < 1, and callback tag1 (not tag0 difference).
for site, expected in [(0x10062a1c0, '1f0c0071'), (0x10062a274, '3a008052'),
    (0x10062ad1c, 'c8010036'), (0x10062ad24, '1f0500f1'),
    (0x10062ad2c, '4803080a'), (0x10062ad44, '21008052')]:
    assert read(site, 4).hex() == expected, hex(site)

# Root diff line markers '~', '+', '-' and new-cursor depth minus one.
for site, expected in [(0x10062c738, 'c80f8052'), (0x10062c8fc, '68058052'),
    (0x10062c980, 'a8058052'), (0x10062c718, '020400f1'),
    (0x10062c730, '98020094')]:
    assert read(site, 4).hex() == expected, hex(site)

# Native change sorting compares Foundation IndexPath first, then ascending rank.
assert pinned_imported_symbol(0x101463678) == '_$s10Foundation9IndexPathV7compareySo18NSComparisonResultVACF'
for site, expected in [(0x10063227c, '1f0400b1'), (0x100632280, '40040054'),
    (0x1006322fc, '1f0113eb'), (0x100632300, '03030054')]:
    assert read(site, 4).hex() == expected, hex(site)

# Native removed-ID-range feature flag metadata and default.
assert pinned_static_swift_string(0x10150c060) == 'feature/axTreeDiffingRemovedElementIDRanges'
assert pinned_static_swift_string(0x10150c070) == 'Summarizes removed AX tree elements as consolidated ID ranges in diff rendering.'
assert read(0x10150c080, 1) == b'\x01'

# Production updateSkyshot description callers select previous diff (tag1)
# and no line-option bits (x1=0), in both capture continuations.
for site in [0x100070ab0, 0x10007124c]:
    assert read(site, 8).hex() == '20008052010080d2', hex(site)

# Scroll optional event window field initializer is raw51, present (tag0).
assert read(0x100731148, 12).hex() == '69068052090100b91f110039'

# All three IPC scroll branches use vertical height/horizontal width and an
# ordered <=100 floor before pages conversion. Size provenance is separate.
assert read(0x100161100, 28).hex() == '8006416d7f0a0071203c601e280be8d20101679e0020611e219c601e'
for site in [0x1001613ac, 0x100161660]:
    assert read(site, 32).hex() == 'c04e41391f0800710831899a000140fd280be8d20101679e0020611e219c601e', hex(site)

# Element-scroll frame optional selects its own size even if empty/negative;
# nil takes visibleRect.size before querying clickablePoint.
assert read(0x100161240, 12).hex() == '34f01894c8824f39c8010036'
assert read(0x100161274, 36).hex() == '884200918962009103000014c8420f91c9620f91200140fd010140fdc08a03fdc18603fd'

# Element scroll clickablePoint -> integer scaled/window coordinates. Nonpositive
# or unordered scale selects1; positive infinity is retained, not finite-clamped.
assert read(0x100161470, 16).hex() == '806a73fc0820601e01106e1e09cc611e'
assert read(0x1001614a4, 12).hex() == '800240fd4039601e0018691e'
assert read(0x1001614e8, 12).hex() == '810640fd0139611e2118691e'
assert read(0x100161528, 8).hex() == '1400789e3500789e'

# Scroll element branch enters prepareToInteract before reading frame: timing1,
# positionElement=true, animateCursor=true. Then moveMouse also uses timing1.
assert read(0x100160580, 12).hex() == '220080522300805224008052'
assert read(0x1001605b4, 4).hex() == '244afc17'  # B 0x100072e44
assert read(0x100161594, 4).hex() == '21008052'

# Successful scroll continuation optionally captures; updateSkyshot receives
# disableAXDiffing=false, skipScreenshot=false. Noncapture sets controller+0x20.
assert read(0x100161770, 12).hex() == 'c84641391f05007101040054'
assert read(0x1001617d8, 8).hex() == '0200805203008052'
assert read(0x1001617f4, 4).hex() == 'da35fc17'  # B updateSkyshot
assert read(0x1001617f8, 12).hex() == 'c81e43f92900805209810039'

# Coordinate scroll converts request doubles directly to Int and awaits
# moveMouse timing1; its continuation enters visibleRect-based scroll.
assert read(0x10015f3cc, 8).hex() == '0800789e081000f9'
assert read(0x10015f408, 8).hex() == '0800789e081400f9'
assert read(0x10015f434, 12).hex() == '080000d0080101911a2000a9'
assert read(0x10015f44c, 4).hex() == '21008052'

# moveMouse nil -> (0,0), writes cursor position before ordered-window target
# resolution; unlike scroll preparation this entry does not late-reread geometry.
assert read(0x10007e498, 8).hex() == '150080d2170080d2'
assert read(0x10007e4c4, 4).hex() == '775600a9'
assert read(0x10007e5a0, 4).hex() == 'd80e0094'
assert read(0x10007e5c8, 4).hex() == '9f1d1a94'

# Controller move tail validates MouseEventTarget before creating visible cursor.
assert read(0x10007e7d0, 16).hex() == 'c03241f9150080d2fd230094d50100b5'
assert read(0x10007e8d4, 4).hex() == '01c1ff97'  # createVirtualCursorIfNeeded
# Cursor targetWindowID is present, even if its UInt32 payload is0.
assert read(0x10007eacc, 8).hex() == '970200b99f120039'
# Controller position read is followed by fresh scale/visibleRect transforms.
assert read(0x10007e950, 16).hex() == 'b359439468aa0090184540f98b32406d'

# Complete geometry-update arithmetic (rect storage, pixel/point mode,2048/768
# bounds, inverse scale and size storage), excluding trailing RET.
assert __import__('hashlib').sha256(read(0x100071950, 0x220)).hexdigest() == '163aca7450bc6e0a141913e95c3e71d165a1ba189c92c8122a92354c927888d1'

# Screenshot option provenance: Statsig config/defaults/packed result and both
# CGWindow.scale -> geometry helper callers. No live Statsig config queried.
for site, size, digest in [
    (0x100220914, 536, 'b4e6c4672515525f30effc1835a1ea7a020889f078b559efc85ce1be389efef1'),
    (0x10006f5d4, 52, 'f73218e151cadc536fe30d530664a7ff106be2c58634154e3995a180b59a79c3'),
    (0x10006f81c, 52, '133692c3e7be5b36d0ac2b1fcd9bead356f129b0558b8015edb97a409b4ecb88'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# CGWindow.bounds is at value offsets8/24; copied CGWindow starts frame598,
# so geometry callers' frame5a0..5b8 are bounds, not capture contentRect.
assert read(0x10025bca8, 12).hex() == '8086406d828e416dc0035fd6'
for site in [0x10006f5bc, 0x10006f804]:
    assert read(site, 16).hex() == 'c8d242fdc9d642fdcada42fdcbde42fd', hex(site)

# CGWindow scale and NSScreen best-screen/first-max helper bodies. Selection
# does not reject zero-overlap candidates; nil scale fallback is2.
for site, size, digest in [
    (0x10025b86c, 124, '291088531a34030f4c5b41b1299788db9056c20a70810d80419924b54bdbc815'),
    (0x100260e0c, 604, '2840fd5c67bb12399971561cf18262b2d88ef8017703a5121a0e616a0fd9921c'),
    (0x1002617bc, 188, '751d51df296d67221f37f5b9251b0cf33d44d44130e5b9c36c11c917fc6545fb'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# updateSkyshot skipScreenshot is saved at frame5ea. Both geometry call paths
# skip for nonnil menu-bar item or skipScreenshot, returning local zero size
# rather than calling the geometry mutator / clearing existing controller state.
assert read(0x10006ef74, 4).hex() == 'c3aa1739'
assert read(0x10006f5a8, 8).hex() == 'b40300b598030037'
assert read(0x10006f7f0, 8).hex() == 'b80300b594030037'
for site in [0x10006f624, 0x10006f86c]:
    assert read(site, 8).hex() == '08e4002f09e4002f', hex(site)

# Initial geometry is CGRectNull, zero scale, zero size, zero integer position.
assert pinned_imported_symbol(0x101464b98) == '_CGRectNull'
assert __import__('hashlib').sha256(read(0x10006c9cc, 0x48)).hexdigest() == '3136b84de8584846c9808cdf844951baf5a93bd04fe6272a5dd6e9224c9638c3'

# Geometry helper output is passed as present optional CGSize into the async
# capture operation, guarded by the same menu-item/skipScreenshot conditions.
for site, size, digest in [
    (0x10006fe40, 28, '975d37add790c5ddb9b4cd2cf26e249dcbcc62a05a19315d7d9ea61fb701ed37'),
    (0x10006ffc4, 12, '0afbb4b248fcc6b39a4c76828d84bf5ab69a9363aaf32f36d9d0bb6b3d507700'),
    (0x100086cb0, 164, 'a1815bc1c2bb27f3cb0b79345ea2ad585d2f7188eb19b4c84d9e1cebf46a55f2'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# Screenshot optional-size forwarding through SkyshotOperation/signpost into
# SlimCore.captureScreenshotBuffer; nil delay (payload0/tag1) preserved.
for site, size, digest in [
    (0x100235458, 48, '2a8cabfa2a95dad1e36ad839b7ac80cb39e438f8e71d4a6acd57decc4721dff4'),
    (0x100237d54, 48, '9098bb1563ba1ac2a9505566324a675224350e52c8fdb45143afe2dac3c38a9b'),
    (0x100234f94, 72, 'a7cd9e2a68a79620eab05c99a01aae7275065eae94e0c340144602ff8a8b246f'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# Screenshot pixel conversion validates finite positive dimensions, ceil then
# checked Int conversion. No8192/32M host budget in this original helper.
assert __import__('hashlib').sha256(read(0x100fb7c00, 264)).hexdigest() == '3f684a8a80e7dda91b865578071acaf9130740833d74af3b779da6b4eae73900'

# Accelerated window capture path requests ignoreGlobalClipShape/mainConnection,
# invokes WindowServerSPI.captureWindowImagesInRect and takes first image only.
assert __import__('hashlib').sha256(read(0x100fb27f8, 0x70)).hexdigest() == '1e8c5f8d5a5bc871bb12af6bbe130e8cc1ece45d105510856ec86cbe27595c96'

# WindowServer capture wrapper, its separately salted lazy symbol request,
# and ignoreGlobalClipShape0x800. Missing binding/empty IDs return nil.
for site, size, digest in [
    (0x10026cf58, 264, 'f50a252fd554b807f645a5d1addd79173b2dcdcc1ec680f7e1ff593f043dc601'),
    (0x10026db24, 140, '40aa52ce09ed1b9386911e1ea50c99032f5c3a6f29f3b2d1f6f069a92f994116'),
    (0x10026be38, 8, '53f368d0b5ba1685b1c33dc9cd98f14e08f3e53ac67988de4cb694290493d9a9'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# Single-symbol WindowServer lookup delegates to SoftLink batch with one request.
assert __import__('hashlib').sha256(read(0x10026da14, 272)).hexdigest() == 'e2ebf4905630fa48cc5e93737e66518f09fa7ce121a24a2e1d51606e528f14f7'

# ScreenCaptureKit branch configuration setters, width/height and optional rect.
for site, size, digest in [
    (0x100fb8804, 116, '7fcb15a33a9bff12f082726befc97da9cc69a57de0aecc021e65201df013d36a'),
    (0x100fb8a7c, 76, 'd6193687ed8cd7f3053c9ba811b5a09211eb0d7212a37cca89545480e6320143'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# ScreenCaptureKit capture entry invokes SCScreenshotManager completion API;
# completion chooses error first, then image, traps if neither is provided.
for site, size, digest in [
    (0x100fb56c0, 156, 'c5672b360e99588099faf27bf653a632a965f709d29ec000ff55f92baa9f32a2'),
    (0x100fb581c, 176, '20e8b7c2538dd25dff55aa266af70792954784fbe5b4cda262c459e6c9b9b5d5'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# Selected SCWindow: offscreen goes accelerated; onscreen builds desktop-
# independent SCContentFilter. These are upfront routes, not nil-result retry.
for site, size, digest in [
    (0x100fb86d8, 32, '3c008633bf932f64eba5dd148ebc026fa3ad6f45da5e6e30b1d9b89bb1a3de4a'),
    (0x100fb878c, 28, '30e635ea37bd25b2e723a750ec91bc24824daac60f7904d7799d82a260afcec3'),
    (0x100fb88d0, 100, 'ca8507cf51aa9d7fb1bbc0708cad530d84483aafcecfee1e7b801702ec0eff92'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# Single-window selection: exactly one explicitID, else app matching only for
# absent/empty ID list. Missing explicitID does not fall back to app name.
assert __import__('hashlib').sha256(read(0x100fb8340, 380)).hexdigest() == 'be8cdc7479b7c1c912560c59560b830a525acaece4ff6e0f7e4ee457b1e88603'

# Shareable-content scope gates, all-requested-IDs-visible helper and SDK calls.
for site, size, digest in [
    (0x100fb49d8, 160, '79cc1ed655029fdd18b500645e6937792932653f756f0b2b8499f68931546439'),
    (0x100fb4ab8, 32, '8ea9010913932022035da26474fa02da1bb7722e9afd9c8fa1ac8991fcd0cdec'),
    (0x100fb5050, 28, 'a07890efee6aeda189c0756faa5b2303bda7ab47617cc8ec3152377638b64054'),
    (0x100fb5180, 20, '782a5c69e527e4091b4db2fba0312802d4f1f3e0ce1c363acc91a3efe982497f'),
]:
    assert __import__('hashlib').sha256(read(site, size)).hexdigest() == digest, hex(site)

# Screenshot app-name candidate construction and two-pass matcher, installed build.
assert __import__('hashlib').sha256(read(0x100fb723c, 0x400)).hexdigest() == 'a53e80039704ae14f8cc9df384806370aa5b9687576fdca95566d66f67de4d9d'
assert __import__('hashlib').sha256(read(0x100fb763c, 0x5c4)).hexdigest() == '1d3a4311d0d29caecf34187a347367899c64552f9e64d55dbcc340080b825b7c'

# Screenshot display pairwise maximum-overlap selection.
assert __import__('hashlib').sha256(read(0x100fb912c, 0x148)).hexdigest() == '9f2fc940c7ce4158af546338c82decc2997629c0b69261f1a6858af2b165f927'

# Display-relative crop and including-windows content filter.
assert __import__('hashlib').sha256(read(0x100fb9324, 0xe8)).hexdigest() == '35317524e04867d29778506342d703cde0178e6aa285343270e589ab30a50d15'

# Included-window crop/union region.
assert __import__('hashlib').sha256(read(0x100fb8ca4, 0x70)).hexdigest() == '441789959883e9e084b84ed1fdf6e1d76843b65da1ac04e8ef16d80a1342f4dc'

# Included-window crop/union region.
assert __import__('hashlib').sha256(read(0x100fb9058, 0xd4)).hexdigest() == 'f73f4fd4fe144e79ffaf7458644b208d17078a4fc769c36445fe6c65d6853f05'

# Selected/first-included offscreen target routing.
assert __import__('hashlib').sha256(read(0x100fb86d8, 0x9c)).hexdigest() == '94b0dea9fac9a07cf0e96ebc34de31cd16bd20ee03006182537f4fcac4b7028e'

# Selected/first-included offscreen target routing.
assert __import__('hashlib').sha256(read(0x100fb8898, 0x9c)).hexdigest() == '4624342ff2c8070fe67b59d3adfb9b063a443196c136c79078f4e4f355a00e6a'

# Selected/first-included offscreen target routing.
assert __import__('hashlib').sha256(read(0x100fb9274, 0xc)).hexdigest() == '48386f8fe52811b09c3a3a22a4b287b64581da86b2b9fa995e951f4cef17169c'

# CGImage resizing, original format and high interpolation.
assert __import__('hashlib').sha256(read(0x100fb5490, 0x1b0)).hexdigest() == '3416d68e591a7234b1d90a81a3d1c8c0fab55051139368632db9f44aa79129c4'

# Optional requested size and offscreen resize fallback.
assert __import__('hashlib').sha256(read(0x100fb7d08, 0x40)).hexdigest() == '3c96af8abcc05d713dcd85d18c4dacf88241cd87129f12bbc1ef533658d6aa64'

# Optional requested size and offscreen resize fallback.
assert __import__('hashlib').sha256(read(0x100fb8934, 0x1c)).hexdigest() == '3880a00d07043eb0952179180487b0bafb832686ee0ed7f5026e2c808fd3ec76'

# Optional requested size and offscreen resize fallback.
assert __import__('hashlib').sha256(read(0x100fb8e60, 0x2c)).hexdigest() == '52d3aabb881cae83dc022f8b32ecf5c284185b6513a8b3b05b44d9b74cbc9550'

# Absent requested image size uses filter Float pointPixelScale.
assert __import__('hashlib').sha256(read(0x100fb8874, 0x24)).hexdigest() == '0c8852c86ab83f4e36baad92c6b9fa1d2eaeb52724cdafa341d0ca114201ed61'

# ScreenCaptureKit success continuation returns captured image directly.
assert __import__('hashlib').sha256(read(0x100fb94a8, 0xb4)).hexdigest() == '68a09d2cbee520a782492357c3a35faf451d1a6d54eda024cdb375bf61ed14da'

# SC error continuation propagates stored async error.
assert __import__('hashlib').sha256(read(0x100fb9754, 0xcc)).hexdigest() == 'b8d38b6c8c3aec223a05de418dfc6259e65375acd651c3df776ff0ec4d05a6fd'

# Single-window filter and independent frame width/height reads.
assert __import__('hashlib').sha256(read(0x100fb8774, 0x80)).hexdigest() == 'd33d2530c31d6336cd7c631ad4d95d8017dfbc62ed3ff8c4a2485144bede004d'

# Full display filter with empty excludingWindows and display dimensions.
assert __import__('hashlib').sha256(read(0x100fb8fc4, 0x90)).hexdigest() == '3d1650ddea7bb6b03f5a511b5a114f91cb8ba7e8a4b280ce9a41d29011e3b65d'

# Initial-display fallback and missing-display error tag.
assert __import__('hashlib').sha256(read(0x100fb930c, 0x18)).hexdigest() == 'ae00fb28a2b234a712e9cb9b0994c1c70e08a7aa92f298d926b65ef1a056336d'

# Initial-display fallback and missing-display error tag.
assert __import__('hashlib').sha256(read(0x100fb9420, 0x48)).hexdigest() == 'c98ff5596d08859a95c6f801203183f4ad07a9521168b7c5b9f078d1efc81422'
