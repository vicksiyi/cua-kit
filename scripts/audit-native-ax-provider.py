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


# Witness targets and their decoded thunk calls. No vendor execution required.
names = ['Hashable', 'supportedAttributes', 'value(for:)', 'values(for:)',
 'arrayValue(for:index:maxValues:countIfKnown:)', 'arrayCount(for:)',
 'isAttributeSettable(_:)', 'setValue(_:forAttribute:)',
 'supportedParameterizedAttributes', 'parameterizedValue(for:parameter:)',
 'element(at:)', 'actions', 'description(for:)', 'perform(_:)',
 'pid', 'actualPID', 'windowID', 'bundleIdentifier', 'isEqual(to:)']
targets = [None,0x1006fa8ec,0x1006fa8f0,0x1006fa944,0x1006fa958,
 0x1006fa9b0,0x1006fa9b4,0x1006fa9cc,0x1006fa9e0,0x1006fa9e4,
 0x1006faa30,0x1006faa58,0x1006faa6c,0x1006faa80,0x1006faa94,
 0x1006faaa8,0x1006faabc,0x1006faad0,0x1006faad4]
flags=[0,0x13,0x11,0x11,0x11,0x11,0x11,0x11,0x13,0x11,0x11,0x13,0x11,0x11,0x13,0x13,0x13,0x13,0x11]
header=struct.unpack('<6I',read(0x1012cc520,24))
assert header[0]==0x43 and header[3:5]==(2,19)
entries=[]
for i,(name,target,flag) in enumerate(zip(names,targets,flags)):
 descriptor=0x1012cc550+i*8
 assert struct.unpack('<II',read(descriptor,8))==(flag,0)
 slot=0x10149b1b8+(i+1)*8
 raw=struct.unpack('<Q',read(slot,8))[0]
 actual=0x100000000+(raw&0xffffffff) if raw else None
 assert actual==target
 entries.append(dict(index=i,name=name,descriptor=hex(descriptor),witness=hex(target) if target else None, throwingGetter=name in ['pid','actualPID','windowID','actions']))
mock=struct.unpack('<6I',read(0x1012cc62c,24))
assert mock[3:5]==(0,1)
assert struct.unpack('<II',read(0x1012cc644,8))==(0x11,0)
# Nil initialization stores 40 zero bytes, not a TaskLocal object.
init=read(0x1006fab7c,24)
assert init.hex()=='8876009008a11d911f1100f900e4006f000100adc0035fd6'
# Pin the single-attribute routing instructions as well as protocol metadata.
for address, expected_word in {
 0x1006f5fe4: 0xb40004e8, # optional provider absent -> system branch
 0x1006f6018: 0xd63f0100, # provider lookup witness call
 0x1006f603c: 0xf9400ee9, # resolved object's value(for:) slot +0x18
 0x1006f6050: 0xd63f0120, # invoke that method
 0x1006f5c14: 0xd63f0100, # supported-attributes provider lookup
 0x1006f5c34: 0xf9400a68, # supportedAttributes slot +0x10
 0x1006f5c3c: 0xd63f0100,
 0x1006f7848: 0xd63f0100, # batch provider lookup
 0x1006f786c: 0xf9401308, # values(for:) slot +0x20
 0x1006f787c: 0xd63f0100,
 0x1006f9458: 0xf9403308, # actions slot +0x60
 0x1006f9468: 0xd63f0100,
 0x1006f98b4: 0xf9403748, # description slot +0x68
 0x1006f98cc: 0xd63f0100,
 0x1006f73ec: 0xf9401f28, # settable slot +0x38
 0x1006f7400: 0xd63f0100,
 0x1006f759c: 0xf94022e8, # setter slot +0x40
 0x1006f75b0: 0xd63f0100,
 0x1006f9af8: 0xf9403ac8, # perform slot +0x70
 0x1006f9b0c: 0xd63f0100,
 0x1006f6380: 0xf9401729, # array subset slot +0x28
 0x1006f63a4: 0xd63f0120,
 0x1006f6734: 0xf9401ac8, # array count slot +0x30
 0x1006f6744: 0xd63f0100,
 0x1006f6b08: 0xf9402668, # supported parameterized slot +0x48
 0x1006f6b10: 0xd63f0100,
 0x1006f6f94: 0xf9402b29, # parameterized value slot +0x50
 0x1006f6fb0: 0xd63f0120,
 0x1006f7b48: 0xf9402ee8, # element-at-point slot +0x58
 0x1006f7b60: 0xd63f0100,
}.items():
 assert struct.unpack('<I',read(address,4))[0]==expected_word, hex(address)
print(json.dumps(dict(binarySHA256=expected,protocol=dict(name='AXUIElementProtocol',
 descriptor='0x1012cc520',classBound=True,requirements=entries),
 arraySubsetSystem=dict(entry='0x1006f63ec',endExclusive='0x1006f6648',
 machineCodeSHA256=hashlib.sha256(read(0x1006f63ec,0x1006f6648-0x1006f63ec)).hexdigest(),
 knownCount='skip count query; forward signed count unchanged',
 unknownCount='arrayCount(for:) at 0x1006f63f8; non-success immediately returns error/nil',
 copy='AXUIElementCopyAttributeValues at 0x1006f64c8; status and returned array independent',
 descriptor='count remains total; availableRanges is [index..<index+actual] only if actual < total, otherwise nil',
 checkedRange='checked addition at 0x1006f65e0, overflow/invalid bounds trap; no clamping'),
 identityGetters=dict(
 pid=dict(entry='0x1006f9d8c',mockSlot='0x78',systemCall='AXUIElementGetPid',errorRegister='x21',throwCall='0x1006f9ed0'),
 actualPID=dict(entry='0x1006f9f30',mockSlot='0x80',systemCall='AccessibilitySPI.getActualPID',errorRegister='x21',throwCall='0x1006fa074'),
 windowID=dict(entry='0x1006fa28c',mockSlot='0x88',systemCall='AccessibilitySPI.getWindowID',errorRegister='x21',throwCall='0x1006fa3cc'),
 bundleIdentifier=dict(entry='0x1006fa49c',mockSlot='0x90',pidFailureReturnsNil=True,
 fallback='PID getter followed by NSRunningApplication(processIdentifier:).bundleIdentifier')),
 mockProvider=dict(descriptor='0x1012cc62c',requirementCount=1,
 storage='0x1015ca768',initialization='0x1006fab7c',
 storageKind='static optional existential, nil by default; not TaskLocal',
 initializerSHA256=hashlib.sha256(init).hexdigest(),
 dispatch='provider lookup at witness +8 with AX reference; nil result uses system path; nonnil result calls AXUIElementProtocol method',
 valueDispatch=dict(lookupCall='0x1006f6018',nilFallback='0x1006f602c',methodSlot='0x18',methodCall='0x1006f6050'),
 limitation='MockProvider lookup/storage use documented reconstructed names; source setter synchronization remains unverified. Attribute, identity and operation front doors restored; concrete AXUIElement conformance and remaining operation routing incomplete'),
 ),indent=2))
