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

# Mac-only filterActions; pin context gating, predicate polarity and typed read.
mac_action_filter_words = {
    0x1007597d8: 0x39400308, 0x1007597dc: 0x350058e8,
    0x1007597e8: 0x39400718, 0x100759350: 0x3607fc80,
    0x1007947a4: 0x37000498, 0x100794830: 0x36000734,
    0x100794834: 0x52800014, 0x100794968: 0x52000294,
    0x100794a34: 0x52800001, 0x100794a50: 0x1a9f07f4,
    0x100794c84: 0xf9405c28, 0x100794c94: 0x52000014,
    0x100794cb4: 0x52800034,
}
for address, word in mac_action_filter_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
mac_action_filter_calls = [branch(site, target) for site, target in [
    (0x10075986c, 0x100759294), (0x10075bb58, 0x1007946b0),
    (0x100794a40, 0x1007a7600),
]]

# Mac calendar and non-full leaf pruning before common tag 2.
mac_pruning_words = {
    0x100759934: 0xf94022a1, 0x10075994c: 0xeb02001f,
    0x100759980: 0xf100053f, 0x100759984: 0x54004b61,
    0x1007599e4: 0xb7004860, 0x10075a2a8: 0x36000218,
    0x100759b98: 0x39400308, 0x100759b9c: 0x34000268,
    0x100759bb4: 0xb50001a8, 0x100759bc4: 0xb9805ae8,
    0x100759bd0: 0xb98052e8, 0x100759bdc: 0xb98066e8,
    0x100759be4: 0x36002f48, 0x10075a1ec: 0x52800042,
    0x10075a318: 0x52800062,
}
for address, word in mac_pruning_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
# Metadata field-offset vector starts at 0x10; these loads select captured flags.
assert [stored[(offset - 0x10) // 4] for offset in [0x58, 0x50, 0x64]] == [
    'isFocused', 'isSelected', 'isDisclosing']
mac_pruning_calls = [branch(site, target) for site, target in [
    (0x1007599e0, 0x100751a9c), (0x100759bbc, 0x10075c5ec),
    (0x10075a2d0, 0x10064fb6c), (0x100759c58, 0x100657c10),
]]
mac_calendar_selectors = {}
for address, expected_selector in [
    (0x101542c18, 'runningApplicationWithProcessIdentifier:'),
    (0x101542740, 'bundleIdentifier'),
]:
    pointer = (struct.unpack('<Q', read(address, 8))[0] & 0xfffffffff) + 0x100000000
    assert cstring(pointer) == expected_selector
    mac_calendar_selectors[hex(address)] = expected_selector

# Text-area rich text outer branch: range selection and commit semantics.
text_area_words = {
    0x100759ae4: 0x360040a0, 0x100759b10: 0xb50000a1,
    0x100759b20: 0xb4000261, 0x100759b68: 0x37003c95,
    0x100759b70: 0xb4003c59, 0x100759b78: 0x360011e8,
    0x100759b88: 0xb4004835, 0x100759dbc: 0xeb0002bf,
    0x100759dc0: 0xda9f12b5, 0x10075a48c: 0xb4fff360,
    0x10075a690: 0xb98072f6, 0x10075a6a8: 0xb98076e8,
    0x10075a700: 0xa906e277,
}
for address, word in text_area_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
assert [stored[(offset - 0x10) // 4] for offset in [0x70, 0x74]] == [
    'attributedString', 'transformedString']
text_area_calls = [branch(site, target) for site, target in [
    (0x100759b0c, 0x10075b530), (0x100759b1c, 0x10072bd3c),
    (0x100759b84, 0x10075abf4), (0x100759db8, 0x10114dda4),
    (0x100759e38, 0x1006f6ed4), (0x10075a654, 0x100770530),
    (0x10075a6dc, 0x100638c74),
]]
branch(0x10075a704, 0x10075988c, False)

# Web-area rich-text outer branch: informational-only and marker probe.
web_area_words = {
    0x100759718: 0x7100091f, 0x10075971c: 0x54005ee1,
    0x100759780: 0x36005bc0, 0x1007597a4: 0xb4000081,
    0x1007597b0: 0x36002600, 0x1007597c0: 0x36002740,
    0x100759ca4: 0x370032b4, 0x100759cec: 0xb4003060,
    0x100759d38: 0xb4002460, 0x10075a3bc: 0xb4ffd799,
    0x100759f08: 0xb4ffff1b, 0x10075a104: 0xb98072f6,
    0x10075a11c: 0xb98076e8, 0x10075a174: 0xa906e277,
}
for address, word in web_area_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
web_area_calls = [branch(site, target) for site, target in [
    (0x100759c74, 0x1006f5b8c), (0x100759cd4, 0x10075b440),
    (0x100759d20, 0x10075b440), (0x100759e80, 0x1006f6ed4),
    (0x100759ec4, 0x101153870), (0x100759ed0, 0x10075aed8),
    (0x10075a0cc, 0x100770530), (0x10075a1a8, 0x10064fb6c),
]]

# Rich marker-range reader and options dictionary, with strict decoding.
range_reader_words = {0x10075af78: 0x360000f8, 0x10075b6e8: 0x3901831f,
                      0x10075c85c: 0xb4000297, 0x10075c860: 0x52800020}
for address, word in range_reader_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
range_reader_calls = [branch(site, target) for site, target in [
    (0x10075af00, 0x1006f6a60), (0x10075af88, 0x10075b620),
    (0x10075afd8, 0x10075c780), (0x10075b754, 0x10075c780),
    (0x10075c7f4, 0x1006ea3e4), (0x10075c824, 0x1006f6ed4),
]]
assert cstring(0x101256f30) == 'AXTextMarkerRange'

# Full attributed text: capability branch and UTF-16 fallback.
full_text_words = {0x10075ac94: 0x36000458, 0x10075ad20: 0xb4000981,
                   0x10075ad58: 0xa937d3bf, 0x10075ae24: 0xb4000177,
                   0x10075ae50: 0xd2800014}
for address, word in full_text_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
full_text_calls = [branch(site, target) for site, target in [
    (0x10075ac1c, 0x1006f6a60), (0x10075ace4, 0x1011537e0),
    (0x10075adbc, 0x10076589c), (0x10075ae08, 0x10075c79c),
    (0x10075ae34, 0x10075b620), (0x10075ad28, 0x101150af8),
    (0x10075ad6c, 0x10075c780),
]]

# Textual content uses AXTextualContext, cached String then uncached reader.
assert cstring(0x101257b10) == 'AXTextualContext'
textual_context_calls = [branch(site, target) for site, target in [
    (0x100759b0c, 0x10075b530), (0x100759b1c, 0x10072bd3c),
    (0x10072bda4, 0x10072b068), (0x10072b0d4, 0x1006f5f88),
    (0x10072b20c, 0x100710b44),
]]

# Native small-string initializer spells ChromeAXNodeId (not AXChromeNodeID).
chrome_attribute_words = [0xd28d0860, 0xf2adee40, 0xf2ccada0, 0xf2eb0820,
                          0xd28de9c1, 0xf2acac81, 0xf2cc8921, 0xf2fdc001]
for index, word in enumerate(chrome_attribute_words):
    assert struct.unpack('<I', read(0x10079c8e8 + index * 4, 4))[0] == word
chrome_attribute_name = struct.pack('<QQ', 0x5841656d6f726843, 0xee00644965646f4e)[:14].decode()
assert chrome_attribute_name == 'ChromeAXNodeId'

# Attribute callback extracts attributed substring, then string, then source run.
for address, expected_selector in [(0x101543010, "attributedSubstringFromRange:"),
                                   (0x101543e28, "string")]:
    pointer = (struct.unpack('<Q', read(address, 8))[0] & 0xfffffffff) + 0x100000000
    assert cstring(pointer) == expected_selector
rich_run_calls = [branch(site, target) for site, target in [
    (0x1007704f4, 0x100777ce0), (0x100770508, 0x100770530),
    (0x100777d1c, 0x101150af8),
]]

# Numeric decoration decisions in the rich formatter; NSNumber integer/bool
# selectors differ, so generic truthiness would not reproduce the branches.
for address, expected_selector in [(0x101542ae0, "integerValue"), (0x101543018, "boolValue")]:
    pointer = (struct.unpack('<Q', read(address, 8))[0] & 0xfffffffff) + 0x100000000
    assert cstring(pointer) == expected_selector
numeric_style_words = {0x100770854: 0xf100041f, 0x100770858: 0x5400170b,
    0x100770974: 0x340011a0, 0x100770c48: 0xf100041f, 0x100770c4c: 0x540001eb,
    0x100770c94: 0xb7f898c0, 0x100771fac: 0x528000e8}
for address, word in numeric_style_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word

# Font descriptor construction and CoreText symbolic trait tests.
for address, expected_selector in [(0x101543058, "initWithFontAttributes:"),
                                   (0x101543048, "fontWithDescriptor:size:")]:
    pointer = (struct.unpack('<Q', read(address, 8))[0] & 0xfffffffff) + 0x100000000
    assert cstring(pointer) == expected_selector
font_style_words = {0x100772530: 0x36080160, 0x10077255c: 0x36000100,
    0x100772628: 0x34ff0ca0, 0x100772630: 0x36070c68,
    0x100772594: 0xd28b0820, 0x100772598: 0xf2ade8c0, 0x10077259c: 0xf2ce8dc0,
    0x1007725a0: 0xf2ede840, 0x1007725a4: 0xd28c8d81, 0x1007725a8: 0xf2fd4001}
for address, word in font_style_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
font_trait_call = branch(0x10077252c, 0x101153f6c)
assert struct.pack('<QQ', 0x6f42746e6f465841, 0xea0000000000646c)[:10].decode() == 'AXFontBold'

# AXLink holds an AXUIElement (forced cast); cache URL -> shortener -> mapped
# Markdown wrapper. Text trim helper uses NSString rangeOfString for offsets.
assert cstring(relative(0x1012cc16c + 8)) == 'AXUIElement'
pointer = (struct.unpack('<Q', read(0x1015430b8, 8))[0] & 0xfffffffff) + 0x100000000
assert cstring(pointer) == 'rangeOfString:'
link_words = {0x100770d24: 0x528000e4, 0x100770f20: 0xb4001041,
    0x100770f2c: 0x52800b60, 0x100771000: 0x52850ba8, 0x100771028: 0x52800520}
for address, word in link_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
link_calls = [branch(site, target) for site, target in [
    (0x100770d08, 0x1006e8284), (0x100770ddc, 0x10076589c),
    (0x100770e04, 0x1007bb140), (0x100770f18, 0x10065f7c0),
    (0x100770f7c, 0x100773780), (0x1007737e0, 0x101151da0),
    (0x100773a50, 0x1007a6f04),
]]

# Attachment text classification and rendering. The first scalar is used for
# each Character's newline check; TAB is intentionally excluded.
assert struct.unpack('<Q', read(0x101558068, 8))[0] == 0xfffc
attachment_words = {0x1007712dc: 0xf100041f, 0x10077135c: 0x51003a88,
    0x100771360: 0x3100151f, 0x100771364: 0x540000c8, 0x10077136c: 0x7100091f,
    0x100771370: 0x54000063, 0x100771374: 0x7102169f,
    0x100771378: 0x54fffe01, 0x10077205c: 0x528b6420}
for address, word in attachment_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
attachment_calls = [branch(site, target) for site, target in [
    (0x1007711d0, 0x1006e8284), (0x1007712a0, 0x10076589c),
    (0x10077146c, 0x1007bb140), (0x1007714d8, 0x10065f7c0),
    (0x10077153c, 0x1007c10fc), (0x100771580, 0x1007c10e0),
    (0x100771508, 0x100773780),
]]

# The raw-name table is a static array of (rebased C string, length, flags).
style_names = []
for index in range(8):
    pointer, length, flags = struct.unpack('<QQQ', read(0x1015722d0 + 32 + index * 24, 24))
    assert flags == 2
    style_names.append(read((pointer & 0xfffffffff) + 0x100000000, length).decode())
assert style_names == ['Title', 'Heading', 'Subheading', 'Body', 'Fixed width',
                       'Contains paragraphs', 'Expanded', 'Collapsed']
assert cstring(0x101257010) == '<details><summary>\n'
assert cstring(0x101257030) == '\n</summary>(collapsed content is hidden)</details>'
assert cstring(0x101257070) == 'AXBlockQuoteLevel'
format_words = {0x1007780dc: 0x528001e1, 0x100777f18: 0x71000d1f,
    0x100778090: 0x528007c0, 0x100778024: 0x52800460, 0x100778048: 0xd37ef442}
for address, word in format_words.items():
    assert struct.unpack('<I', read(address, 4))[0] == word
format_calls = [branch(site, target) for site, target in [
    (0x100771964, 0x101151d70), (0x100771a04, 0x100777e18),
    (0x1007780e4, 0x101150a38), (0x1007781c8, 0x101150a2c),
]]

# List prefix classification: first Character.isNumber, exact checklist names,
# NSNumber.stringValue for visible ordered prefix (not integerValue).
assert cstring(0x101256fd0) == 'checklist item, incomplete'
assert cstring(0x101256ff0) == 'checklist item, completed'
selector = struct.unpack('<Q', read(0x101542e18, 8))[0]
assert cstring((selector & 0xfffffffff) + 0x100000000) == 'stringValue'
list_calls = [branch(site, target) for site, target in [
    (0x100771f74, 0x100248674), (0x10024869c, 0x101150b7c),
    (0x100771f94, 0x101150570), (0x100772714, 0x101154ba8),
    (0x100772724, 0x101154ba8), (0x100773350, 0x101154ba8),
    (0x100773384, 0x101150a2c), (0x100772740, 0x100775540),
]]

line_replacement_calls = [branch(site, target) for site, target in [
    (0x100772e10, 0x100773bb0), (0x100773ca0, 0x101150a5c),
    (0x100773cf4, 0x101150a5c), (0x100773d80, 0x101152ff4),
    (0x100773cdc, 0x101150a2c), (0x100773cec, 0x10076d6b8),
    (0x100773dcc, 0x101150a2c), (0x100773e7c, 0x101154b0c),
]]
assert struct.unpack('<I', read(0x100773d74, 4))[0] == 0x52800142  # LF comparison

format_state_calls = [branch(site, target) for site, target in [
    (0x1007727bc, 0x100773a5c), (0x100772800, 0x100773a5c),
    (0x1007784f0, 0x100773ee0), (0x10077850c, 0x100773f8c),
    (0x100772854, 0x1007765f8), (0x1007729c4, 0x1007757e0),
    (0x100778b70, 0x100778500), (0x100778b88, 0x1007784e4),
]]
# The linear search returns Optional<Int>: discriminator 1 = absent, 0 = found.
assert struct.unpack('<I', read(0x100774c6c, 4))[0] == 0x52800021
assert struct.unpack('<I', read(0x100774c74, 4))[0] == 0x52800001

boundary_renderer_calls = [branch(site, target) for site, target in [
    (0x100772a8c, 0x10063a1c8), (0x100772ae0, 0x10063a2f8),
    (0x100772c60, 0x100773aec), (0x100772c78, 0x100777e7c),
    (0x100772d04, 0x100639b70), (0x100772d34, 0x1007742c0),
    (0x100772e10, 0x100773bb0), (0x100772ecc, 0x100777e7c),
    (0x100773088, 0x100777e7c), (0x100773210, 0x10063a38c),
    (0x100773250, 0x10063a2fc),
]]

provider_lookup_calls = [branch(site, target) for site, target in [
    (0x10076abc8, 0x10076ac10), (0x10076ac64, 0x10065030c),
    (0x10076acf4, 0x100650908),
]]
provider_lookup_calls.append(branch(0x10076ac0c, 0x1006501ec, link=False))

render_projection_calls = [branch(site, target) for site, target in [
    (0x10076ad6c, 0x10064e090), (0x10064e1c0, 0x10064c280),
    (0x10064e470, 0x10064e220), (0x10064e380, 0x10064ea74),
    (0x10064e41c, 0x10063e644), (0x10063e6c0, 0x10063e6e8),
]]
compare_zero_branch(0x10064e31c, 8, 0x10064e428)
assert struct.unpack('<I', read(0x10064e400, 4))[0] == 0xd2800001
assert struct.unpack('<I', read(0x10064e404, 4))[0] == 0x52800022

render_tree_calls = [branch(site, target) for site, target in [
    (0x10064c594, 0x10064b0e0), # depthFirstTraversal
    (0x10064c7dc, 0x10114ef38), # IndexPath.dropLast (GOT 0x101463680)
    (0x10064c6f0, 0x101150c18), # final root-path compactMap
    (0x10064cbc4, 0x1011503d8), # parent-path dictionary lookup
    (0x10064e1e0, 0x10064ecc4), # source isFocusTree
    (0x10064e1f4, 0x1000e6d20), # render-tree value constructor
]]
compare_zero_branch(0x10064c890, 0, 0x10064c98c)
compare_zero_branch(0x10064cbcc, 20, 0x10064cc48)

line_options = struct.unpack('<4q', read(0x10118a6f0, 32))
assert line_options == (1, 2, 4, 8)
line_format_calls = [branch(site, target) for site, target in [
    (0x10063e164, 0x101150b64), # String.init(repeating: Character, count: Int)
    (0x10063e1dc, 0x101152ca0), # integer description
    (0x10063e338, 0x101150f00), # append contents of each root's children
]]
for site, reg, bit, target, nonzero in [
    (0x10063e0e0, 23, 1, 0x10063e13c, True),
    (0x10063e170, 23, 0, 0x10063e19c, True),
    (0x10063e278, 0, 0, 0x10063e3a0, False),
    (0x10063e394, 0, 0, 0x10063e3a4, False),
]:
    word = struct.unpack('<I', read(site, 4))[0]
    assert word & 0x7e000000 == 0x36000000
    assert bool(word & 0x01000000) == nonzero
    assert word & 31 == reg
    assert ((word >> 19) & 31) | ((word >> 26) & 32) == bit
    displacement = (word >> 5) & 0x3fff
    if displacement & 0x2000: displacement -= 0x4000
    assert site + displacement * 4 == target

render_output_calls = [branch(site, target) for site, target in [
    (0x10063dd3c, 0x10064b0e0), (0x10063dda4, 0x101150c24),
    (0x10063df28, 0x10063dba0), (0x100645df4, 0x10063e00c),
    (0x10063e074, 0x10064b194), (0x10063e08c, 0x10063e0b0),
    (0x10064b1a8, 0x10114ef14),
]]
assert struct.unpack('<I', read(0x10064b1ac, 4))[0] == 0xf1000400
assert struct.unpack('<I', read(0x10063de78, 4))[0] == 0xf900035b
assert struct.unpack('<I', read(0x10063de7c, 4))[0] == 0x3900235f

next_id_calls = [branch(site, target) for site, target in [
    (0x10063ebe8, 0x10063ec10), (0x10063ec40, 0x10063dba0),
    (0x10063ee14, 0x101150ccc),
]]
assert struct.unpack('<I', read(0x10063ebf4, 4))[0] == 0xb1000440
assert struct.unpack('<I', read(0x10063ec00, 4))[0] == 0x3900629f
# Key path's final class stored-property component is elementID's metadata offset.
assert struct.unpack('<I', read(0x10118b1d0 + 36, 4))[0] == 0x68

readable_protocol = 0x1012ccda8
assert struct.unpack('<II', read(readable_protocol + 12, 8)) == (0, 1)
assert struct.unpack('<I', read(readable_protocol + 24, 4))[0] == 0x11
readable_witness = struct.unpack('<Q', read(0x10149dbd0, 8))[0]
assert (readable_witness & 0xfffffffff) + 0x100000000 == 0x1007627f0
readable_calls = [branch(site, target) for site, target in [
    (0x100762848, 0x100625d58), (0x10075c5d4, 0x100625d58),
    (0x100625ee0, 0x10115060c),
]]
readable_calls.append(branch(0x100625d68, 0x100625d80, link=False))
readable_calls.append(branch(0x100625d7c, 0x100625d80, link=False))
compare_zero_branch(0x100625e20, 9, 0x100625dfc)

compare_zero_branch(0x10062600c, 1, 0x1006260b0)
role_description_calls = [branch(site, target) for site, target in [
    (0x1006261dc, 0x101150714), (0x1006262a4, 0x101152ff4),
]]
for site, word in [(0x100625ffc, 0xf9401ec8), (0x100626018, 0xf9401adb),
                   (0x100626054, 0xf9402008), (0x100626154, 0x7100091f)]:
    assert struct.unpack('<I', read(site, 4))[0] == word

state_witness_reads = {
    0x100627138: (0x88, "isSelectable"), 0x100627148: (0x80, "isSelected"),
    0x1006271dc: (0xa0, "isEnabled"), 0x10062734c: (0xa8, "isDisclosable"),
    0x100627364: (0xb0, "isDisclosing"), 0x1006273ec: (0x60, "valueTypeName"),
    0x10062740c: (0xb8, "isValueSettable"), 0x10062753c: (0xc0, "isSentByCurrentUser"),
}
for site, (offset, name) in state_witness_reads.items():
    word = struct.unpack('<I', read(site, 4))[0]
    assert word & 0xffc00000 == 0xf9400000
    assert (word >> 5) & 31 == 19
    assert ((word >> 10) & 0xfff) * 8 == offset
state_calls = [branch(site, target) for site, target in [
    (0x100627280, 0x101150714), (0x1006272ec, 0x101150714),
    (0x100627454, 0x101152ff4), (0x1006275e4, 0x10115060c),
]]
compare_zero_branch(0x100627400, 1, 0x10062753c)
compare_zero_branch(0x1006275a0, 8, 0x100627640)

index_range_calls = [branch(site, target) for site, target in [
    (0x100626678, 0x100627b88), (0x100627be4, 0x101152ca0),
    (0x100627c0c, 0x101152ca0), (0x100627c44, 0x100628e10),
]]
for site, word in [(0x100627b88, 0x370009e2), (0x100627b8c, 0xb7f809c0),
                   (0x100627b90, 0xeb01001f), (0x100627b94, 0x5400098a)]:
    assert struct.unpack('<I', read(site, 4))[0] == word

content_entry_calls = [branch(site, target) for site, target in [
    (0x100628e78, 0x1011509d8), (0x100628eb0, 0x101151e18),
]]
assert struct.unpack('<I', read(0x100628e6c, 4))[0] == 0x52800ca1 # offsetBy 101
assert struct.unpack('<I', read(0x100628e84, 4))[0] == 0x52800148 # LF
assert struct.unpack('<I', read(0x100628eb8, 4))[0] == 0x52800020 # successful advance -> true

content_accumulator_calls = [branch(site, target) for site, target in [
    (0x100627990, 0x100018c54), (0x1006279d4, 0x1006606ec),
    (0x100018cf4, 0x101152ff4),
]]
# entry.text (+16), not entry.label (+0), supplies both membership and insertion.
assert struct.unpack('<I', read(0x100627970, 4))[0] == 0xa9415ab7

print(json.dumps(dict(contentAccumulator=dict(
    calls=content_accumulator_calls,
    behavior="ordered entries plus separate Swift String set; appendUnique preserves first label by text equality; no trimming/casefold; range helper bypasses set",
    limitation="full content call ordering, formatting and production integration pending"), contentEntryConstructor=dict(
    calls=content_entry_calls,
    layout="optional label, original text, Bool",
    flag="true if index(startIndex, offsetBy:101, limitedBy:endIndex) succeeds, otherwise Foundation contains LF",
    limitation="descriptive flag name reconstructed; accumulator and final formatting integration remain pending"), contentIndexRange=dict(
    calls=index_range_calls,
    behavior="nil/negative lower/equal bounds omitted; otherwise lower-upper decimal payload; no one-based conversion or upper-bound adjustment",
    limitation="payload restored only; labeled-entry constructor and full content accumulation pending"), stateDescriptionComponent=dict(
    entry="0x100627090", calls=state_calls,
    witnesses={hex(site): name for site, (_, name) in state_witness_reads.items()},
    order="selectable (full UI and not selected), selected, disabled (not informational/group/staticText), expanded/collapsed, settable with optional type, sent by me",
    formatting="empty if no parts; otherwise parentheses and comma-space join; nil type suppresses settable, empty type preserved",
    limitation="state component only; content component/composition and production integration pending"), roleDescriptionComponent=dict(
    entry="0x100625f1c", calls=role_description_calls,
    present="suppress menuBarItem/menuItem/radioGroup; row literal; generic empty becomes element; other group becomes container; otherwise preserve",
    missing="menu/menu bar literals; suppress menuBarItem/menuItem/radioGroup; otherwise informational empty, other contexts unknown",
    limitation="one component only; complete node renderer and collector integration pending"), readableRenderingRoute=dict(
    descriptor=hex(readable_protocol), requirementCount=1,
    witness="0x1007627f0", calls=readable_calls,
    composition="outer helpers 0x100625d6c and 0x100625f1c; inner helpers 0x100626300 and 0x100627090; each pair evaluated first then second but joined second then first; omit empty strings only; separator space",
    limitation="generic accessibilityDescription helper bodies not yet restored; existing node projection is not an end-to-end node renderer"), nextAvailableElementID=dict(
    calls=next_id_calls,
    behavior="capture tree; lazy first maximum of present node IDs; missing maximum defaults to zero; add one and cache; subsequent calls increment cached value; checked overflow",
    limitation="ID supplier only; incremental difference matching/application not yet restored"), renderOutput=dict(
    calls=render_output_calls,
    ids="unconditional zero-based depth-first offsets; duplicate references receive last occurrence offset; no identity deduplication",
    lines="depth-first rendered nodes; render-path depth count minus one; options forwarded to node.line; no automatic ID assignment",
    limitation="production collector and incremental ID reuse remain separate"), renderLineAndSelection=dict(
    flags=line_options, calls=line_format_calls,
    line="repeat supplied Character; optional integer and space; text; optional space plus detail including present empty detail; no per-line indentation",
    selection="only focus trees; concatenate immediate root children preserving references/order/duplicates; nil if empty; resulting isFocus false",
    limitation="these presentation methods are not yet wired to production collection"), renderTreeAssembly=dict(
    calls=render_tree_calls,
    behavior="depth-first source paths; nonnil node maps path to itself; nil node inherits surviving ancestor path; attach to mapped ancestor or retain root path; preserve source isFocus; errors propagate",
    limitation="render-specific assembly restored; generic traversable protocol and iterator internals are not exported; line formatting and production collection remain pending"), renderNodeProjection=dict(
    calls=render_projection_calls,
    behavior="invoke supplied renderer; propagate errors; empty string returns nil; preserve whitespace; identity, subset detail and source cursor path; elementID nil; children initially empty",
    limitation="compactTreeMap empty-parent behavior and whole-tree assembly not reconstructed by this callback"), providerTreeLookup=dict(
    calls=provider_lookup_calls,
    behavior="extract provider AX handle; use identity ID/path table; return captured tree node; focus lookup misses clear focus",
    limitation="UIElementProtocol-constrained overloads only; complete native traversal and production integration pending"), attributedRendering=dict(
    entry="0x100770530", traversal="0x10077045c",
    composition="font trait bold then italic then additive AXFontBold; numeric styles; link followed by attachment; quote/style names then list; mapped boundary rendering including terminal empty run",
    limitation="composed formatter uses cached element factory and shared URL context; production collector not yet wired; vendor runtime not executed"), attributedBoundaryRenderer=dict(
    calls=boundary_renderer_calls,
    behavior="move trailing output LF to incoming unmapped prefix; remove leading LF only if more than one Character; block runs reopen marks across interior LF; preserve trailing LF as generated; apply old/new or delta boundaries; append mapped run",
    limitation="composition tail recovered; input attribute assembly and production collector integration pending"), attributedFormatState=dict(
    calls=format_state_calls,
    behavior="ordered old-minus-new closing and new-minus-old opening; remove closing then append opening; retain surviving old order and full list identity",
    dependency="Apple swift-collections OrderedSet; local resolved version 1.6.0, vendor library version not established",
    limitation="format membership state only; full newline/render state machine remains pending"), attributedLineReplacement=dict(
    calls=line_replacement_calls,
    behavior="iterate Character; replace exact LF with caller text and source offsets; retain other Character UTF16 slices including CRLF; replacement is not recursively scanned",
    limitation="state-machine primitive only; full line-boundary handling pending"), attributedListFormat=dict(
    calls=list_calls,
    behavior="require NSNumber level/index and NSAttributedString prefix; exact checklist markers; first Character.isNumber chooses index.stringValue plus period, otherwise star; integerValue identity retained without clamping",
    limitation="list extraction only; formatter state transitions and collector integration pending"), attributedFormatBoundaries=dict(
    rawStyleNames=style_names, instructions={hex(k): hex(v) for k, v in format_words.items()}, calls=format_calls,
    behavior="caller-ordered closing marks; block opening prefixes inserted at front; inline opening marks appended; exact comma-space named style split and deduplication",
    limitation="does not compute state differences, line restarts, or collector integration"), attributedAttachment=dict(
    instructions={hex(k): hex(v) for k, v in attachment_words.items()}, calls=attachment_calls,
    behavior="AX element attachment; empty/object replacement placeholders; cached roleDescription/description; generic caption or image Markdown; multiline original appended with mappings",
    limitation="run transformation; default shortener suppresses image URLs; full formatter integration pending"), attributedLink=dict(
    instructions={hex(k): hex(v) for k, v in link_words.items()}, calls=link_calls,
    behavior="AXLink AXUIElement reference; transaction-backed cached URL/role; shared shortener; trimmed label; generated wrapper has nil offsets",
    limitation="run transformation only; full rich formatter/collector integration pending"), attributedFontStyles=dict(
    instructions={hex(k): hex(v) for k, v in font_style_words.items()},
    coreTextCall=font_trait_call,
    behavior="AXFont String/Any dictionary; String name plus Double size; optional uncast family; NSFontDescriptor/NSFont; CTFont traits bold bit1 italic bit0; additive Bool AXFontBold",
    limitation="font predicates only, not full formatter transitions or collector integration"), attributedNumericStyles=dict(
    instructions={hex(k): hex(v) for k, v in numeric_style_words.items()},
    behavior="NSNumber casts; underline integerValue > 0; strikethrough boolValue; superscript integerValue sign",
    limitation="only numeric attribute extraction, not the full style set or formatter"), attributedRunTraversal=dict(
    callback="0x10077045c", sourceRun="0x100777ce0", calls=rich_run_calls,
    behavior="enumerate all attributes; attributed substring string; UTF16 source offsets; empty terminal run with empty attributes",
    limitation="formatter state machine at 0x100770530 still pending; callback is required"), macDispatch=dict(
    entry="0x1007595fc", shared="0x100759c58 -> 0x100657c10",
    behavior="13-case default pipeline; native action/calendar/rich-text cases and non-full leaf override; remaining shared cases delegate to common dispatcher",
    requiredDependencies=["traversal rebuild", "provider title", "owning bundle lookup", "node renderer", "attributed renderer", "attribute logger", "unexpected-next-line diagnostic"],
    validation="all 13 rules visited in order through recursive tree driver; Mac override and action filter dispatched",
    limitation="test renderer/rebuild fixtures do not prove native formatting or production collector integration"), webTextProvider=dict(
    chromeAttribute=chrome_attribute_name, initializer="0x10079c8e0",
    attributePolicy="cached support unless explicit transaction set excludes attribute, then fresh support",
    markerReads="cached typed marker then strict uncached fallback; errors logged -> nil",
    nextLine="encode raw end marker, parameterized read, strict marker decode; outer probe suppresses errors",
    integration="web-area overload now uses provider-backed support/marker/probe/range readers; formatter remains explicit"), textualContext=dict(
    attribute="AXTextualContext", initializer="0x10079c6e0", calls=textual_context_calls,
    behavior="cached string first, uncached strict string read on nil; known unsupported skips AX; uncached read/decode errors reported then converted to nil",
    integration="text-area overload now composes contextual guard plus full/range reads; attributed formatter remains explicit"), fullAttributedText=dict(
    instructions={hex(k): hex(v) for k, v in full_text_words.items()}, calls=full_text_calls,
    options="construct UIElement using current transaction, read AXTextMarkerRangeForUIElement, strict marker decode, direct WithOptions read without second support probe",
    fallback="captured value nil -> nil; otherwise AXAttributedStringForRange with CFRange(0, value.utf16.count)",
    lengthImport="0x101150af8 -> GOT 0x101466458 -> libswiftCore String.UTF16View.count",
    integration="concrete TransformedUIElement.fullAttributedText uses existing provider constructor and AX reads; formatter and complete pipeline pending"), attributedRangeReader=dict(
    instructions={hex(k): hex(v) for k, v in range_reader_words.items()}, calls=range_reader_calls,
    selection="fresh supportedParameterizedAttributes chooses WithOptions, otherwise plain marker range",
    options={"AXTextMarkerRange": "raw CF marker range", "AXSpellCheck": False},
    decoding="encode parameter, provider read, nil passthrough, strict NSAttributedString decoding; no fallback/retry",
    integration="TransformedUIElement concrete reader uses existing AX provider dispatch; outer pipeline and formatter remain pending"), webAreaRichText=dict(
    instructions={hex(k): hex(v) for k, v in web_area_words.items()}, calls=web_area_calls,
    guards="informationalContext + webArea + no chromeNodeID support + start/end markers present",
    probe="nextLineEndTextMarkerForTextMarker(end); nonnil -> diagnostic and unchanged; nil/error -> original marker range",
    commit="read/format range, assign attributedString/transformedString/value, clear subtree; read nil/error leaves item unchanged",
    limitations="provider-backed readers composed; attributed-run formatter and production collector integration still pending"), textAreaRichText=dict(
    instructions={hex(k): hex(v) for k, v in text_area_words.items()},
    calls=text_area_calls,
    guards="textArea, textualContent != AXTextualContextSourceCode, captured value present",
    read="captured truncationRange -> parameterized range read (NSNotFound -> -1), otherwise full-text helper; nil/error -> unchanged",
    commit="store attributedString and formatted TransformedUIString, replace value with description, preserve subtree and truncationRange",
    integration="provider-backed text-area overload composes full/range reads and strict decode; textual-context read is provider-backed; attributed formatter remains explicit",
    limitations="Mac dispatcher composed; production collector integration pending"), macTreePruning=dict(
    instructions={hex(k): hex(v) for k, v in mac_pruning_words.items()},
    calls=mac_pruning_calls, selectors=mac_calendar_selectors,
    calendar="staticText role + Event roleDescription + exactly one staticText child + owning com.apple.iCal; clear child items, retain owner",
    leafOverride="non-full context, leaf, no own description/focus/selection/disclosure -> removed; otherwise common pruning",
    limitation="extracted branches; Mac dispatcher composed; production collector wiring pending"), macActionFilter=dict(
    entry="0x1007597d0", predicate="0x1007946b0",
    instructions={hex(k): hex(v) for k, v in mac_action_filter_words.items()},
    calls=mac_action_filter_calls,
    context="fullUIContext only; capture transformed node and isCatalyst",
    rules=["drop showAlternateUI and showDefaultUI",
           "drop cancel for Catalyst, menuBar or menuItem",
           "drop pick for menuItem; drop confirm for textField",
           "retain horizontal/vertical page scroll only with typed corresponding scrollBar element",
           "drop increment/decrement when isValueSettable; retain other actions"],
    result="stable filter preserves descriptions and duplicates; full context returns transformed even without changes",
    limitation="extracted typed-reader seam; Mac dispatcher and production collector integration pending"), binarySHA256=expected, descriptor=hex(descriptor),
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
