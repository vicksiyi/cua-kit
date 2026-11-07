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

print(json.dumps(dict(binarySHA256=expected, descriptor=hex(descriptor),
    storedFields=stored, verifiedBranches=calls,
    titleAssociationInvestigation=dict(status="partial evidence, not an implemented rule",
        calls=title_calls,
        confirmed=["candidate comparison uses Identifiable.id equality, not node text",
            "target filtering callback inserts IDs into a Set and returns inserted",
            "search helpers use Collection.firstIndex(where:)",
            "subtree items are mutated and their caches invalidated"],
        remaining=["recover complete optional working-item flow",
            "map title/value/description fallback and providerTitle precedence",
            "recover target relocation/removal and rebuild callback branches",
            "only then implement dispatcher branch and fixture acceptance"]),
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
        limitation="extracted body; complete transform dispatcher and production integration pending"),
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
