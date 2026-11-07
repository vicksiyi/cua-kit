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

def relative(address):
    value = struct.unpack('<i', read(address, 4))[0]
    return address + value if value else None

def cstring(address):
    return read(address, 256).split(b'\0', 1)[0].decode()

def fields(descriptor):
    field_table = relative(descriptor + 16)
    size, count = struct.unpack('<HI', read(field_table + 10, 6))
    return [cstring(relative(field_table + 16 + i * size + 8)) for i in range(count)]

# The descriptor, not getter names, distinguishes stored and computed properties.
descriptor = 0x1012ccde4
stored = fields(descriptor)
expected_fields = [
    'element', 'role', 'subrole', 'roleDescription', 'title', 'description',
    'value', 'truncationRange', 'valueDescription', 'valueTypeName',
    'placeholderValue', 'help', 'identifier', 'url', 'domClassList',
    'actionDescriptions', 'isSelected', 'isSelectable', 'isFocused',
    'isFocusable', 'isEnabled', 'isDisclosing', 'isDisclosable',
    'isValueSettable', 'attributedString', 'transformedString',
]
assert stored == expected_fields
# Verify the restored Swift owner has exactly the recovered stored field names.
import re
owner = Path(__file__).resolve().parents[1] / 'native/macos/Sources/CuaHelper/TransformedUIElement.swift'
owner_fields = re.findall(r'^    var (\w+):', owner.read_text(), re.MULTILINE)
assert owner_fields == stored
# Swift struct descriptor: kind 17, field-offset vector at metadata word 2.
assert struct.unpack('<I', read(descriptor, 4))[0] & 0x1f == 17
assert struct.unpack('<I', read(descriptor + 24, 4))[0] == 2

def branch(address, target, link=True):
    word = struct.unpack('<I', read(address, 4))[0]
    assert word & 0xfc000000 == (0x94000000 if link else 0x14000000)
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    assert address + 4 * immediate == target
    return dict(instruction=hex(address), target=hex(target), link=link)

calls = [branch(0x10075c570, 0x10075e160, False),
         branch(0x10075e0f8, 0x10076589c),
         branch(0x10075e124, 0x10075e160),
         branch(0x10075debC, 0x10065fb6c)]
# Direct constructor callers in the executable instruction region. This is not
# an assertion that no indirect call exists.
constructor_call_sites = []
code_start = 0x100000000
code = read(code_start, 0x1150000)
for offset in range(0, len(code) - 4, 4):
    word = struct.unpack_from('<I', code, offset)[0]
    if word & 0x7c000000 != 0x14000000:
        continue
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    if code_start + offset + immediate * 4 == 0x10075e160:
        constructor_call_sites.append(code_start + offset)
assert constructor_call_sites == [
    0x10071b0d8, 0x100758a4c, 0x100758c10, 0x10075c570,
    0x10075dfdc, 0x10075e124, 0x100768418, 0x10076879c,
    0x100768f9c, 0x1007696f8, 0x100769f08, 0x10076a7dc,
]
# Traversal 0x100769250 takes the constructor role argument from stack arg 9.
# Its recursive call places the current transformed node's role (+0x20) there.
role_flow_words = {
    0x1007695e0: 0xf9400bb5,  # ldr x21, [x29, #0x10]
    0x1007696e8: 0xaa1503e4,  # mov x4, x21
    0x1007698d0: 0xf9401108,  # ldr x8, [x8, #0x20]
    0x1007698ec: 0xa90027e8,  # stp x8, x9, [sp]
}
role_flow_words.update({
    0x100769114: 0xf9401106,  # generic traversal: node.role -> x6
    0x100769148: 0xd63f0100,  # invoke supplied recursive specialization
    0x10076a0ec: 0xf9401108,  # specialized traversal: node.role -> x8
    0x10076a104: 0xa90027e8,  # role -> stack arg 9 of 0x100769250
    0x10076a9a8: 0xf9401108,  # expanded traversal: node.role -> x8
    0x10076a9b0: 0xf8100128,  # save role in recursion scratch slot
    0x10076aa28: 0xf8500106,  # scratch slot -> x6
    0x10076a33c: 0xf8100106,  # preserve incoming x6
    0x100768b00: 0xf8100106,  # generic traversal preserves incoming x6
    0x100768f8c: 0xaa1a03e4,  # generic traversal forwards saved role to constructor
    0x10076a7cc: 0xaa1503e4,  # expanded traversal forwards saved role to constructor
})
for address, word in role_flow_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word, hex(address)
role_flow_branches = [branch(0x1007696f8, 0x10075e160), branch(0x100769914, 0x100769250),
    branch(0x10076a12c, 0x100769250), branch(0x10076aa38, 0x10076a310)]
value_type_labels = []
for i in range(6):
    first = read(0x1011955f8 + i * 8, 8)
    second = read(0x101195628 + i * 8, 8)
    assert second[7] & 0xf0 == 0xe0
    value_type_labels.append((first + second[:7])[:second[7] & 0xf].decode())
assert value_type_labels == ['float', 'integer', 'boolean', 'string', 'date', 'unknown']
rendering_descriptor = 0x1012c95ac
header = struct.unpack('<6I', read(rendering_descriptor, 24))
assert header[3:5] == (1, 6)
requirement_start = rendering_descriptor + 24 + 12
rendering_flags = [8, 7, 0x13, 0x14, 0x16, 0x13]
for i, flag in enumerate(rendering_flags):
    assert struct.unpack('<II', read(requirement_start + 8 * i, 8)) == (flag, 0)
rendering_witnesses = [0x100758848, 0x100758854, 0x10075885c, 0x100758870]
for i, target in enumerate(rendering_witnesses):
    raw = struct.unpack('<Q', read(0x101574b78 + (i + 3) * 8, 8))[0]
    assert 0x100000000 + (raw & 0xffffffff) == target
# Common and platform transformation inventories/default static arrays.
assert fields(0x1012c9cc8) == ['associateTitleUIElements', 'flattenIntoSelectableAncestor',
    'pruneNonDescriptiveSubtrees', 'pruneEmptyDisabledElements', 'mergeSingleItemGroups',
    'flattenRedundantHierarchy', 'flattenRepetitiveStaticText', 'flattenLinksIntoMarkdownText',
    'mergeTextOnlySiblings']
assert fields(0x1012ccdc8) == ['shared', 'filterActions', 'removeElementsUnderCalendarEvents',
    'retrieveAttributedTextFromTextAreas', 'retrieveAttributedTextFromWebAreas']
for address, tags in [(0x10156b860, bytes(range(9))),
                      (0x1015721c0, bytes([9])), (0x1015721f0, bytes([10, 11, 12]))]:
    assert struct.unpack('<Q', read(address + 16, 8))[0] == len(tags)
    assert read(address + 32, len(tags)) == tags

# Generic tree transformation result cases and recursion edges.
assert fields(0x1012c9ce4) == ['transformed', 'replaced', 'removed', 'unchanged']
branch(0x100651620, 0x100651728)
branch(0x1006516a8, 0x100651398)
branch(0x1006519e0, 0x100651728)

# Resilient Equatable/Hashable witness records and native identity calls.
assert relative(0x1011954dc) == 0x100762784
assert relative(0x101195490) == 0x10076236c
branch(0x1007627b8, 0x1006fb9ac)
branch(0x10076238c, 0x101153a74)

# MutableAccessibilityNode adds seven inherited setter/modify pairs and a
# new transformedString getter/setter/modify, after its base conformance.
assert struct.unpack('<II', read(0x1012c93a0 + 12, 8)) == (1, 18)
mutable_flags = [struct.unpack('<I', read(0x1012c93c4 + i * 8, 4))[0] for i in range(18)]
assert mutable_flags == [0] + [0x14, 0x16] * 7 + [0x13, 0x14, 0x16]
mutable_targets = [0x1007620f8, 0x100762120, 0x100762134, 0x100762168,
    0x10076217c, 0x1007621b0, 0x1007621c4, 0x1007621f8,
    0x10076220c, 0x100762240, 0x100762254, 0x100762260,
    0x100762278, 0x100762284, 0x10076229c, 0x1007622d4, 0x100762310]
for i, target in enumerate(mutable_targets, start=2):
    word = struct.unpack('<Q', read(0x10149db30 + i * 8, 8))[0]
    assert 0x100000000 + (word & 0xffffffff) == target

# Chained witness pointers: address payload is the low 32 bits plus image base.
node_witnesses = {}
for slot, target in [(25, 0x1007afb60), (31, 0x1007afb64)]:
    word = struct.unpack('<Q', read(0x101574c00 + slot * 8, 8))[0]
    assert 0x100000000 + (word & 0xffffffff) == target
    node_witnesses[str(slot)] = hex(target)
assert relative(0x101195514) == 0x1007627e4
assert struct.unpack('<I', read(0x1007627e4, 4))[0] == 0xf9400280
branch(0x1007afb60, 0x1007acee0, link=False)
branch(0x1007afb64, 0x1007ad204, link=False)

# Item-level text predicate: key-path getter witnesses differ from the
# node-level predicate because each field is flattened across the subtree.
item_fields = []
for pattern, getter, slot, name in [
    (0x10118b648, 0x100652500, 9, 'description'),
    (0x10118b678, 0x100652554, 10, 'value'),
    (0x10118b6a8, 0x100652598, 8, 'title'),
    (0x10118b6d8, 0x1006525dc, 27, 'placeholderValue'),
]:
    assert relative(pattern + 0x20) == getter
    # ldr x9, [x1, #slot*8] in each key-path getter.
    assert struct.unpack('<I', read(getter + 24, 4))[0] == 0xf9400029 | (slot << 10)
    item_fields.append(dict(field=name, pattern=hex(pattern), getter=hex(getter), witnessSlot=slot))
for site in [0x10064f7f0, 0x10064f894, 0x10064f930, 0x10064f9cc]:
    branch(site, 0x10064f3d4)
branch(0x10064f4dc, 0x101150c18)  # Sequence.compactMap
branch(0x10064f540, 0x10114dfa8)  # CharacterSet.whitespacesAndNewlines
branch(0x10064f55c, 0x101151da0)  # trimmingCharacters(in:)
branch(0x10064f6ec, 0x10115060c)  # joined(separator:)
assert struct.unpack('<I', read(0x10064f6e0, 4))[0] == 0x52800140  # newline
assert struct.unpack('<I', read(0x10064fa28, 4))[0] == 0xf9401aE9  # own role
assert struct.unpack('<I', read(0x10064fa68, 4))[0] == 0xf9401809  # static image

# Concrete pruning branches, including descendant key paths and enum tags.
assert relative(0x10118bab8 + 32) == 0x10065d578
assert relative(0x10118bae8 + 32) == 0x10065d5c0
branch(0x10065d59c, 0x100624f30)
assert struct.unpack('<I', read(0x10065d5e0, 4))[0] == 0xf9407829
branch(0x100659ac8, 0x100624f30)
branch(0x100659af0, 0x10064f72c)
branch(0x100659b60, 0x100650d50)
branch(0x100659bd4, 0x100650d50)
branch(0x10065a5a0, 0x101151500)
branch(0x10065a5b0, 0x10064f72c)
for address, instruction in [
    (0x10065a530, 0xf94052a8), # isEnabled witness slot 20
    (0x10065a550, 0xf9404aa8), # isFocused witness slot 18
    (0x10065a624, 0x52800062), # Result.unchanged (3)
    (0x10065b078, 0x52800042), # Result.removed (2)
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction

# Single-item group merge: grouping, selectable/focused, node description;
# child availableSubset optional's range pointer 0/1 versus allocated array.
for address, instruction in [
    (0x100659c74, 0xf9401c08),
    (0x100659ca4, 0xf94046c8),
    (0x100659cbc, 0xf9404ac8),
    (0x100659cd4, 0xf94076c8),
    (0x100659d00, 0xf100041f),
    (0x10065be9c, 0xb9802b08),
    (0x10065bea4, 0xf9400508),
    (0x10065bea8, 0xf100051f),
    (0x10065bee0, 0x52800022),
    (0x1000100f0, 0x52800021),
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction
branch(0x100659cfc, 0x101150ef4) # Array.count
branch(0x100659d48, 0x1011514d0) # Collection.first
branch(0x10065bf8c, 0x101151500) # Collection.isEmpty

# Redundant hierarchy: parent guards, reverse child index, child subset,
# string equality and closed-range replacement with child subtree items.
for address, instruction in [
    (0x10065a630, 0xf94046c8),
    (0x10065a658, 0xf9404ac8),
    (0x10065a670, 0xf94076c8),
    (0x10065bb10, 0xd1000739),
    (0x10065bc0c, 0xf100051f),
    (0x10065bca4, 0xa93567b9),
    (0x10065bdfc, 0x52800002),
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction
branch(0x10065ba98, 0x101150ef4)
branch(0x10065bc44, 0x101155184) # child render error released, then continue
branch(0x10065bc90, 0x101152ff4) # String equality fallback
branch(0x10065bd70, 0x1011515fc) # replaceSubrange(_:with:)
branch(0x10065bd80, 0x10064fac4) # items modify completion invalidates caches

# Repetitive static text: descendant canBeUserInteractive key path and
# helper's Foundation substring matching / promotion / repeat pass.
assert relative(0x10118ba80 + 32) == 0x10065d51c
assert struct.unpack('<I', read(0x10065d53c, 4))[0] == 0xf9407029
branch(0x100659e34, 0x100650d50)
branch(0x10065ae84, 0x10065c5ac)
for site in [0x10065c764, 0x10065c888]: branch(site, 0x101151da0)
for site in [0x10065c7e4, 0x10065c8f0]: branch(site, 0x101151e18)
branch(0x10065cae8, 0x1011515fc)
branch(0x10065cb00, 0x10064fac4)
branch(0x10065cb50, 0x10065c5ac)
for address, instruction in [
    (0x100659d8c, 0xf9404f08), # own isFocusable
    (0x100659db4, 0xf9404708), # own isSelectable
    (0x10065ae20, 0xf9402708), # own description
    (0x10065ae3c, 0xf9406b08), # own stringValue (not value)
    (0x10065c840, 0xf9402aa8), # child value
    (0x10065c6f8, 0xd1000739), # descending indices
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction

# Title association investigation: pin identity matching, target dedup,
# first-index lookup and mutation sites without claiming a complete algorithm.
title_calls = [branch(site, target) for site, target in [
    (0x10065d984, 0x10065c154),
    (0x10065c200, 0x10115219c),
    (0x10065c214, 0x10115219c),
    (0x10065c248, 0x101150714),
    (0x10065d9a8, 0x10065c294),
    (0x10065c380, 0x101151344),
    (0x10065d9cc, 0x10065c3c0),
    (0x10065c468, 0x1011514a0),
    (0x10065f7b0, 0x10065da60),
    (0x10065da68, 0x10065da3c),
    (0x10065da50, 0x10065c498),
    (0x10065c524, 0x10115219c),
    (0x10065c558, 0x101150714),
    (0x100658a1c, 0x1011514a0),
    (0x100658b10, 0x10115234c),
    (0x10065954c, 0x101150c18),
    (0x100659658, 0x10064fac4),
    (0x100659758, 0x10064fac4),
    (0x100659868, 0x10064fac4),
]]
assert struct.unpack('<I', read(0x100658a88, 4))[0] == 0xf9406428 # titleTargetIdentities

# Title candidate block branches on Optional presence, never String.isEmpty.
def compare_zero_branch(address, register, target):
    word = struct.unpack('<I', read(address, 4))[0]
    assert word & 0xff000000 == 0xb4000000  # cbz xN
    assert word & 31 == register
    immediate = (word >> 5) & 0x7ffff
    if immediate & 0x40000: immediate -= 0x80000
    assert address + immediate * 4 == target
for site, register, target in [
    (0x100658ce0, 21, 0x100658d34),
    (0x100658cf4, 22, 0x100658d5c),
    (0x100658d40, 22, 0x100658d94),
    (0x100658d50, 20, 0x100658dac),
    (0x100658d6c, 20, 0x100658db4),
    (0x100658da0, 20, 0x100658d80),
]:
    compare_zero_branch(site, register, target)
for site, slot in [(0x100658c84, 10), (0x100658cac, 8), (0x100658ccc, 9)]:
    assert struct.unpack('<I', read(site, 4))[0] == 0xf9400328 | (slot << 10)

# Provider presence is Optional<Bool>: none takes child-array lookup;
# some(true) (nil title) proceeds; some(false) skips candidate assignment.
branch(0x100658ef8, 0x100273bd0)
branch(0x100658fac, 0x101150c6c)
branch(0x10065f798, 0x10065da60)
branch(0x10065900c, 0x1006590e4, link=False)
compare_zero_branch(0x1006590bc, 20, 0x1006590e4)
for address, instruction in [
    (0x10065da18, 0xf100029f), # provider result second word == 0
    (0x10065da1c, 0x1a9f17e8), # cset w8, eq
    (0x100658f1c, 0x7100091f), # Optional<Bool>.none tag 2
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction

# Selectable-ancestor flattening: guard key paths and captured text fields.
selectable_fields = []
for pattern, getter, slot, name in [
    (0x10118bb18, 0x10065d610, 23, 'isValueSettable'),
    (0x10118bb48, 0x10065d660, 17, 'isSelectable'),
    (0x10118bb78, 0x10065d6b0, 9, 'description'),
    (0x10118bbb0, 0x10065d75c, 26, 'stringValue'),
    (0x10118bbe0, 0x10065d7a8, 8, 'title'),
    (0x10118bc18, 0x10065d878, 19, 'isFocusable'),
]:
    assert relative(pattern + 32) == getter
    assert struct.unpack('<I', read(getter + 32, 4))[0] == 0xf9400029 | (slot << 10)
    selectable_fields.append(dict(field=name, pattern=hex(pattern), getter=hex(getter)))
for address, instruction in [
    (0x100659e60, 0xf94046a8), # own selectable
    (0x100659e84, 0xf9404aa8), # own focused
    (0x100659ef0, 0xf9401409), # AccessibilityRole.table static requirement
    (0x100659f54, 0xf94082a8), # own isTableRow
    (0x10065a2a8, 0xf9403268), # mutable isFocusable setter
    (0x10065a2c0, 0xf9402a68), # value setter
    (0x10065a2e0, 0xf9402268), # description setter
    (0x10065a2f8, 0xf9401a68), # title setter
    (0x10065d91c, 0xf9407c29), # boolValue filter getter
    (0x10065d930, 0x7100091f), # Optional<Bool>.none tag 2
    (0x10065d934, 0x1a9f07e0), # keep iff non-nil (false included)
    (0x10065afd4, 0xd63f0320), # rebuild callback
    (0x10065bf40, 0x52800002), # transformed result tag 0
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction
for site, target in [
    (0x100659f24, 0x101150714), # role equality
    (0x100659fd4, 0x100650d50), (0x10065a048, 0x100650d50),
    (0x10065a0fc, 0x10064f3d4), (0x10065a194, 0x10064f3d4),
    (0x10065a22c, 0x10064f3d4), (0x10065a298, 0x100650d50),
    (0x10065a31c, 0x10064dfbc), (0x10065a3cc, 0x101150c78),
    (0x10065a4e4, 0x101150f3c), (0x10065af1c, 0x101150f0c),
]:
    branch(site, target)

# Link-to-text transformation interpolates URL only (not the Markdown-label
# helper), then checks rendered description length before any node setters.
for address, instruction in [
    (0x1006585c8, 0xf9401009), # static link role
    (0x100658630, 0xf9403f09), # node URL getter
    (0x10065a94c, 0xf9400e69), # staticText role
    (0x10065a978, 0xf9400ae8), # role setter
    (0x10065a998, 0xf94012e8), # roleDescription setter
    (0x10065a9b4, 0xf94046f3), # transformedString setter
    (0x10065a9f8, 0xf9402ae8), # value setter
    (0x10065aa44, 0xf9403ae8), # URL setter
    (0x10065aad4, 0x52800002), # transformed result
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction
for site, target in [
    (0x1006585f8, 0x101150714),
    (0x10065a858, 0x100639134), (0x10065a910, 0x100639134),
    (0x10065a8d4, 0x100638d40),
    (0x10065a924, 0x10063b5f8), (0x10065a9dc, 0x10063b5f8),
    (0x10065aa78, 0x101150f3c), (0x10065aa88, 0x10064fac4),
]:
    branch(site, target)
compare_zero_branch(0x10065a948, 8, 0x10065afe8)

# Sibling text candidate helper: static text stringValue, or link Markdown
# restricted to informational context (tag 2). No candidate child mutation.
for address, instruction in [
    (0x10065cd2c, 0xf9401b69), # role getter
    (0x10065cd70, 0xf9400c09), # staticText role
    (0x10065cdc4, 0xf9406b68), # stringValue getter
    (0x10065cec4, 0xf9401329), # link role
    (0x10065cf24, 0xf9401828), # context type getter
    (0x10065cf48, 0x71000a9f), # informationalContext tag 2
    (0x10065cf54, 0xf9403f69), # URL getter
    (0x10065d130, 0xf9406b68), # stringValue
    (0x10065d14c, 0xf9402368), # title
    (0x10065d164, 0xf9402768), # description
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction
branch(0x10065cda4, 0x101150714)
branch(0x10065cef0, 0x101150714)
branch(0x10065d1b8, 0x10063a574) # Markdown label helper, unlike tag 7
compare_zero_branch(0x10065cdd8, 1, 0x10065cec4)

# Complete sibling merge: capture candidates/ranges, discard singleton
# ranges, process reverse indices, use first node's flattened-role descriptor.
for address, instruction in [
    (0x10065a5c8, 0xf9404708), # parent isSelectable
    (0x10065a5f0, 0xf9404f08), # parent isFocusable
    (0x10065b11c, 0xf100051f), # run length compared with 1
    (0x10065b120, 0x54fffead), # skip length <= 1
    (0x10065b1fc, 0xd1000718), # reverse range index decrement
    (0x10065b34c, 0xf9408429), # flattenedRole getter slot 33
    (0x10065b3d8, 0xf9400b28), # role setter
    (0x10065b3f0, 0xf9401333), # roleDescription setter
    (0x10065b86c, 0xf9404735), # transformedString setter
    (0x10065ba64, 0x52800062), # no candidate ranges: unchanged
    (0x10065be68, 0x52800002), # any candidate ranges: transformed
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction
for site, target in [
    (0x10065abf8, 0x10065cb8c), (0x10065b43c, 0x101150f3c),
    (0x10065b664, 0x10114dfa8), (0x10065b680, 0x101151da0),
    (0x10065b82c, 0x100657778), (0x10065b9c4, 0x101150e40),
    (0x10065b9d4, 0x10064fac4),
    # Join specializes the existing structural-empty/plain-tail reducer.
    (0x100657934, 0x10063b5f8), (0x100657940, 0x101150a2c),
    (0x100657984, 0x100639134),
]:
    branch(site, target)
compare_zero_branch(0x10065b370, 8, 0x10065b79c)
compare_zero_branch(0x10065b8bc, 1, 0x10065b8d0)

# Full title mutation paths: setter before source removal; relocation appends
# (or invokes rebuild) before sorting target indices and removing siblings.
for site, target in [
    (0x1006593f0, 0x101151500),
    (0x100659644, 0x101150f0c),
    (0x1006597f0, 0x101150c9c),
    (0x100659850, 0x101150f24),
    (0x1006599e0, 0x101150f24),
    (0x100659a00, 0x10064fac4),
]:
    title_calls.append(branch(site, target))
for address, instruction in [
    (0x10065998c, 0xf9401868), # MutableAccessibilityNode title setter slot 6
    (0x1006599a0, 0xd63f0100), # invoke title setter
    (0x10065973c, 0xd63f0300), # invoke optional rebuild
    (0x100659578, 0xeb08001f), # found-index count equals target count
    (0x10065957c, 0x54000f81), # mismatch skips mutation
]:
    assert struct.unpack('<I', read(address, 4))[0] == instruction

print(json.dumps(dict(binarySHA256=expected, descriptor=hex(descriptor),
    storedFields=stored, verifiedBranches=calls,
    titleAssociationInvestigation=dict(status="extracted complete tag-0 body; production collector integration pending",
        calls=title_calls,
        confirmed=["candidate comparison uses Identifiable.id equality, not node text",
            "target filtering callback inserts IDs into a Set and returns inserted",
            "search helpers use Collection.firstIndex(where:)",
            "subtree items are mutated and their caches invalidated"],
        providerGuard="present provider is authoritative; only absent provider searches original direct children by ID; nil title permits candidate, empty title blocks",
        textCandidate="value/title/description read once in order; exactly one non-nil field; empty and whitespace retained; equal multi-field text still ambiguous",
        mutation="single eligible target: set title then remove source; otherwise empty source: require all targets, rebuild/append in target order, remove descending indices",
        remaining=["integrate native production collector",
            "live application acceptance"]),
    selectableAncestor=dict(entry="0x100659e58", keyPaths=selectable_fields,
        guards="selectable, not focused/table/table-row; no value-settable or selectable descendant",
        mutation="flatten description/stringValue/title; overwrite own focusability with descendant predicate; retain full Boolean-valued items in depth-first order using optional rebuild",
        limitation="extracted body; production integration pending"),
    linksIntoMarkdownText=dict(entry="0x10065856c", mutation="0x10065a7ec",
        guard="link role and non-nil URL; nonempty rendered URL description",
        text="empty literal + URL interpolation with own role/context + empty literal; no node-title link label",
        writes="staticText role, literal roleDescription link, transformedString, value description, nil URL, empty subtree",
        preserves="title, description, focusability and other unmodified fields; context changes survive empty result"),
    siblingTextCandidate=dict(entry="0x10065cb8c",
        staticText="present stringValue becomes one plain span verbatim; no title fallback or old transformedString reuse",
        link="only informationalContext; nil URL returns empty plain span, otherwise Markdown-link interpolation using stringValue/title/description",
        limitation="candidate helper and complete sibling rule implemented; production integration pending"),
    siblingMerge=dict(entry="0x10065a5c8", candidates="0x10065aaec",
        guards="parent not selectable/focusable; absent candidate runs unchanged",
        ranges="all consecutive candidates across roles; only length > 1 rewritten in reverse order",
        replacement="first child identity/subset retained; require first flattenedRole, set captured role and targetDescription, clear subtree",
        text="discard whitespace-only descriptions without trimming retained spans; join with first flattenedRole separator using structural-empty/plain-tail semantics",
        writes="transformedString then value if stringValue is non-nil else description; replace whole run by first-item copy",
        result="transformed when any candidate run exists, even singleton/descriptorless"),
    commonDispatcher=dict(strategies=9, fixture="all nine rules through recursive tree driver", limitation="Mac-specific strategies and production collector still pending"),
    repetitiveText=dict(entry="0x100659d8c", helper="0x10065c5ac",
        guard="not focusable/selectable and no canBeUserInteractive descendant",
        matching="Foundation contains; nonempty trimmed child description in parent description OR child value in parent stringValue",
        mutation="collect matching child indices descending, replace by grandchildren, repeat against same parent strings",
        limitation="no role or subset guard added; full pipeline integration pending"),
    redundantHierarchy=dict(entry="0x10065a630", iteration="0x10065ba78",
        guards="parent not selectable/focused/node-descriptive; parent render succeeds",
        flatten="reverse original child indices; matching role, absent subset ranges, equal rendered text; replace child by its children",
        errors="parent error unchanged; child error skipped; context side effects retained",
        result="transformed even for zero children or no matches"),
    singleItemGroup=dict(entry="0x100659c10", replacement="0x10065be7c",
        guard="role.isGrouping and not selectable/focused/node.hasDescriptiveAttributes",
        action="replace with sole child only if child subset ranges absent; otherwise remove empty or keep",
        limitation="extracted body; production integration pending"),
    pruning=dict(emptyDisabled="remove iff disabled, not focused, no stored children and no item description",
        nonDescriptive="retain own focusability/selectability, interesting actions or item description; then retain descendant focusability/selectability or interesting actions; otherwise remove",
        integration="concrete branches tested through tree driver; full production pipeline remains pending"),
    itemDescriptiveState=dict(fields=item_fields, flatten="self then pre-order descendants; trim whitespacesAndNewlines per string, drop empty, newline join; preserve duplicates", roleFallback="own role equals image only"), valueTypeLabels=value_type_labels,
    constructorDirectCallSites=[hex(x) for x in constructor_call_sites],
    traversalRoleFlow=dict(instructions={hex(k): hex(v) for k, v in role_flow_words.items()},
        branches=role_flow_branches,
        finding="Four inspected traversal variants propagate current transformed role to accepted children",
        limitation="Full traversal filtering, subset handling and transform pipeline remain unimplemented"),
    renderingContext=dict(descriptor=hex(rendering_descriptor), flags=rendering_flags,
        requirements=["Role: AccessibilityRole", "Role", "urlShortener.get",
            "urlShortener.set", "urlShortener.modify", "type.get"],
        concreteWitnesses=[hex(x) for x in rendering_witnesses]),
    nodeWitnesses=node_witnesses,
    mutableNode=dict(requirementFlags=mutable_flags, witnesses=[hex(x) for x in mutable_targets]),
    constructionFindings=[
        'UIElement/context initializer tail-branches into common constructor.',
        'AX/context initializer constructs provider cache before common constructor.',
        'AX-only initializer also initializes a URL shortener before reading current transaction.',
        'actions, cache, axElement, stringValue and interactivity predicates are not stored fields.',
    ],
    limitations=[
        'Stored field discovery does not establish their full initialization semantics.',
        'Common constructor is assembled from recovered components; broader branch and traversal integration remain to verify.',
        'Owner field inventory is verified; downstream transforms and production collector integration are not complete.',
    ]), indent=2))
