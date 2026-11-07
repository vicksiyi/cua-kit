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

def protocol(name, address, table, flags, witness_addresses):
    header = struct.unpack('<6I', read(address, 24))
    signature_count, count = header[3:5]
    if signature_count != 4 or count != len(flags) or count != len(witness_addresses):
        raise SystemExit("Protocol dimensions changed")
    start = address + 24 + signature_count * 12
    requirements = []
    for i in range(count):
        entry = start + i * 8
        kind, relative_default = struct.unpack('<Ii', read(entry, 8))
        if kind != flags[i] or relative_default != 0:
            raise SystemExit('Protocol requirement changed at ' + hex(entry))
        # These exact pinned table slots are rebases, except zero dynamic bases.
        raw = struct.unpack('<Q', read(table + (i + 1) * 8, 8))[0]
        target = None if raw == 0 else 0x100000000 + (raw & 0xffffffff)
        if target != witness_addresses[i]:
            raise SystemExit('Witness target changed at ' + hex(table + (i + 1) * 8))
        requirements.append(dict(index=i, descriptor=hex(entry), flags=hex(kind),
                                 defaultImplementation=None,
                                 witness=hex(target) if target else None))
    return dict(name=name, descriptor=hex(address), signatureRequirements=signature_count,
                requirementCount=count, witnessTable=hex(table), requirements=requirements)

ui = protocol('AccessibilitySupport.UIElementProtocol', 0x1012cd46c, 0x10149ed40,
    [0, 0, 3, 0x13, 0x13, 2, 0x13, 0x13, 0x13, 0x13, 0x11, 0x11],
    [None, None, 0x10078fbf4, 0x10078fbfc, 0x10078fc04, 0x10078fc50,
     0x1007aff6c, 0x1007aff74, 0x1007925f4, 0x100792600, 0x1007b8a04, 0x100792670])
transformed_ui = protocol('TransformedUIElement.UIElementProtocol witness', 0x1012cd46c, 0x10149dac8,
    [0, 0, 3, 0x13, 0x13, 2, 0x13, 0x13, 0x13, 0x13, 0x11, 0x11],
    [None, None, 0x100762060, 0x100762068, 0x100762070, 0x1007620bc,
     0x1007620c0, 0x1007afad0, 0x1007925dc, 0x1007620ec, 0x1007afad4, 0x1007925e0])
direct_names = ['AccessibilityNode', 'Hashable', 'static role', 'axElement', 'cache',
                'init(element:)', 'subrole', 'isInsideWebView', 'actions',
                'actionDescriptions', 'setValue(_:forAttribute:)', 'perform(action:)']
for entry, name in zip(ui['requirements'], direct_names):
    entry['meaning'] = name
    entry['meaningStatus'] = 'mapped; actions uses nonoptional default witness, distinct from transformed concrete optional property'
# Cross-conformer table: names come from transformed stored fields / named getters,
# not from generic UIElement's shared false/nil bodies.
node_names = ['role', 'roleDescription', 'title', 'description', 'value',
    'valueDescription', 'valueTypeName', 'help', 'identifier', 'url',
    'isSelected', 'isSelectable', 'isFocused', 'isFocusable', 'isEnabled',
    'isDisclosable', 'isDisclosing', 'isValueSettable', 'isSentByCurrentUser',
    'titleTargetIdentities', 'stringValue', 'placeholderValue', 'canBeUserInteractive',
    'hasDescriptiveAttributes', 'hasInterestingActions', 'boolValue', 'isTableRow',
    'flattenedRole', 'rowIndexRange', 'columnIndexRange', 'presentationActions']
transformed_targets = [0x1007623fc,0x100762408,0x100762434,0x100762460,0x10076248c,
    0x1007624b8,0x1007624e4,0x100762510,0x10076253c,0x100762568,
    0x100762578,0x100762584,0x100762590,0x10076259c,0x1007625a8,
    0x1007625b4,0x1007625c0,0x1007625cc,0x1007625d8,0x1007afb60,
    0x100762670,0x100762674,0x1007626a0,0x1007626a4,0x1007626a8,
    0x1007afb64,0x1007626ac,0x1007626fc,0x100762738,0x100762750,0x100762768]
a = 0x1012c9238
h = struct.unpack('<6I', read(a, 24))
if h[3:5] != (4, 36): raise SystemExit('Inherited protocol dimensions changed')
getters = []
for i, (name, target) in enumerate(zip(node_names, transformed_targets)):
    descriptor = 0x1012c92a8 + i * 8
    if struct.unpack('<II', read(descriptor, 8)) != (0x13, 0):
        raise SystemExit('Inherited getter descriptor changed')
    transformed_slot = 0x101574c30 + i * 8
    raw = struct.unpack('<Q', read(transformed_slot, 8))[0]
    if 0x100000000 + (raw & 0xffffffff) != target:
        raise SystemExit('Transformed witness changed')
    concrete_slot = 0x101575698 + i * 8
    concrete = struct.unpack('<Q', read(concrete_slot, 8))[0]
    getters.append(dict(name=name, descriptor=hex(descriptor),
        transformedSlot=hex(transformed_slot), transformedWitness=hex(target),
        elementSlot=hex(concrete_slot), elementWitness=hex(0x100000000 + (concrete & 0xffffffff))))
# Pin the concrete/default getter distinction, beyond descriptor slot counts.
for site, target in [(0x1007925fc, 0x100790b88), (0x100792624, 0x100790b88),
                     (0x100792648, 0x100790690), (0x1007925dc, 0x1007907fc),
                     (0x1007afb00, 0x1006ea3e4), (0x1007afb30, 0x1006f74e4),
                     (0x10073492c, 0x1007465fc), (0x10074667c, 0x1006ea3e4),
                     (0x1007466ac, 0x1006f74e4), (0x1007349dc, 0x100728f34),
                     (0x100734a04, 0x1006f9a40), (0x100734a20, 0x100740134),
                     (0x1007aaef0, 0x1006fa49c), (0x1007aaf28, 0x101150b34)]:
    word = struct.unpack('<I', read(site, 4))[0]
    assert word & 0x7c000000 == 0x14000000
    displacement = word & 0x3ffffff
    if displacement & 0x2000000: displacement -= 0x4000000
    assert site + displacement * 4 == target
assert struct.unpack('<I', read(0x10079258c, 4))[0] == 0xf9402428

print(json.dumps(dict(binarySHA256=expected, protocol=ui, transformedProtocol=transformed_ui,
    transformedWebView=dict(entry='0x1007aac98', behavior='including-self parent chain maxDepth 300; dynamic role equals webArea; fallback original AX bundleIdentifier prefix com.openai.atlas'),
    transformedPerform=dict(entry='0x10073440c', behavior='prepare menu ancestors then dispatch self; captured disclosure; scrollbar page button press with raw AX fallback'),
    transformedDisclosure=dict(entry='0x1007465fc', caller='0x10073492c', flags='metadata +0x68 isDisclosable and +0x64 isDisclosing', behavior='unsupported no-op; write inverse captured disclosing; preserve captured fields'),
    transformedSetValue=dict(witness='0x1007afad4', encodeCall='0x1007afb00 -> 0x1006ea3e4', writeCall='0x1007afb30 -> 0x1006f74e4', behavior='encode before AX identity resolution; single provider write; no captured field mutation'),
    actionBoundary=dict(
        transformedActions='0x10075d2f8 returns Optional<Array<UIElementAction>> from captured actionDescriptions',
        protocolExtensionActions='0x1007916b0 returns Array<UIElementAction>',
        protocolExtensionActionDescriptions='0x100792570 is named _actionDescriptions and calls witness +0x48',
        concreteWitnessRoutes={'0x1007925f4': '0x100790b88', '0x100792600': '0x100790b88 then 0x100790690'},
        resolution='Transformed witness +0x48 routes to 0x1007907fc, not optional concrete getter 0x10075d2f8; restore protocol default action getter separately.'),
    inherited=dict(name='ComputerUseCore.AccessibilityNode', descriptor=hex(a),
                   signatureRequirements=4, requirementCount=36, getters=getters),
    limitations=['Member mapping is static evidence, not complete conformer implementation.',
                 'Zero base-conformance slots require runtime instantiation; they are not missing inheritance.',
                 'Full protocol type constraints, implementations and transaction wiring require separate validation.']), indent=2))
