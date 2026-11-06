#!/usr/bin/env python3
"""Static Swift symbols and bounded ARM64 evidence; never launches the service."""
import argparse
import hashlib
import json
import os
import re
import struct
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
root = Path(os.environ.get('CUA_VENDOR_ROOT', '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai'))
relative = 'sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'
artifact = root / relative
sha = hashlib.sha256(artifact.read_bytes()).hexdigest()
expected = 'b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'
if sha != expected:
    raise SystemExit('Native service changed; re-audit the symbol selection before updating evidence')
raw = subprocess.check_output(['nm', '-g', str(artifact)], text=True)
selected = [line for line in raw.splitlines() if ' T ' in line and any(word in line for word in (
    'disableAXDiffing', 'UIElementTreeRevision', 'RefetchableSkyshotAXTree',
    'SkyshotOperation', 'UIElementRenderTree', 'isAXTreeDiffingEnabled',
    'AccessibilityDifferenceLineBudgetExceeded', 'SystemSelection', 'AccessibilityTreePresentation',
    'selectedTextSSSgvg', 'selectedTextMarkerRange', 'cachedValue', 'UITextMarkerRange',
    'AXPartialValue', 'AXEncodedValue', 'UIElementError', 'actualPID', 'UIElementTreeTransaction', 'FrequencyTable',
))]
result = subprocess.run(['xcrun', 'swift-demangle'], input='\n'.join(selected)+'\n', text=True, capture_output=True, check=True)
rows = []
decoded_lines = result.stdout.splitlines()
if len(selected) != len(decoded_lines):
    raise SystemExit('Swift demangler changed the number of symbol lines')
for raw_line, decoded in zip(selected, decoded_lines):
    address, kind, mangled = raw_line.split(maxsplit=2)
    signature = decoded.split(maxsplit=2)[2]
    if signature.startswith('_$s'):
        raise SystemExit('Swift demangling failed')
    if signature.startswith(('type metadata', 'method descriptor', 'async function pointer')):
        continue
    rows.append({'address':address,'mangled':mangled,'signature':signature})
required = ['updateSkyshot(treeCache:', 'captureAXTree(treeCache:', 'differenceLines(from:', 'lineageRootRevision.getter', 'previousRevision.getter', '.appending(tree:']
for term in required:
    if not any(term in row['signature'] for row in rows):
        raise SystemExit('Missing expected native boundary: '+term)
# Use LC_FUNCTION_STARTS rather than the next exported symbol: private functions
# can occur between exports. Generic objdump's nearest-symbol labels are not
# reliable for this stripped Mach-O, so retain only addresses and instructions.
starts_text = subprocess.check_output(['xcrun', 'llvm-objdump', '--macho', '--function-starts=addrs', str(artifact)], text=True)
starts = sorted(int(line.strip(), 16) for line in starts_text.splitlines() if re.fullmatch(r'[0-9a-fA-F]{16}', line.strip()))
diff = next(row for row in rows if '.differenceLines(from:' in row['signature'])
start = int(diff['address'], 16)
if start not in starts:
    raise SystemExit('Diff entry missing from LC_FUNCTION_STARTS')
end = starts[starts.index(start)+1]
disassembly = subprocess.check_output(['xcrun', 'llvm-objdump', '--disassemble', '--start-address='+hex(start), '--stop-address='+hex(end), str(artifact)], text=True)
instructions = {}
for line in disassembly.splitlines():
    match = re.match(r'^([0-9a-f]+):\s+([0-9a-f]{8})\s+(.+)', line)
    if match:
        address = int(match[1],16)
        instructions[address] = {'word':match[2], 'instruction':re.sub(r'\s+', ' ', match[3].split(' <')[0].split(';')[0].strip())}
if len(instructions)*4 != end-start or sorted(instructions) != list(range(start,end,4)):
    raise SystemExit('Incomplete bounded ARM64 disassembly')
# Resolve virtual addresses through Mach-O segments, never treating them as file offsets.
data = artifact.read_bytes()
if data[:4] != bytes.fromhex('cffaedfe'):
    raise SystemExit('Expected little-endian 64-bit Mach-O')
segments = []
offset = 32
for _ in range(struct.unpack_from('<I',data,16)[0]):
    command,size = struct.unpack_from('<II',data,offset)
    if command == 0x19:
        _,address,_,file_offset,file_size = struct.unpack_from('<16sQQQQ',data,offset+8)
        segments.append((address,address+file_size,file_offset))
    offset += size
def read_virtual(address,size):
    for low,high,file_offset in segments:
        if low <= address and address+size <= high:
            return data[file_offset+address-low:file_offset+address-low+size]
    raise SystemExit('Virtual address not backed by file data')
body = read_virtual(start,end-start)
for address,instruction in instructions.items():
    if int(instruction['word'],16) != struct.unpack_from('<I',body,address-start)[0]:
        raise SystemExit('Disassembler words differ from executable bytes')
snapshot = next(row for row in rows if '.renderTreeSnapshot()' in row['signature'])
snapshot_address = int(snapshot['address'],16)
calls = []
for address,instruction in instructions.items():
    word = int(instruction['word'],16)
    if word >> 26 == 0b100101: # ARM64 BL, signed 26-bit PC-relative immediate
        immediate = word & 0x3ffffff
        if immediate & 0x2000000: immediate -= 0x4000000
        if address+immediate*4 == snapshot_address:
            calls.append(hex(address))
if calls != ['0x1006298a8','0x1006298fc']:
    raise SystemExit('Snapshot call sites changed')
prefix_address = 0x101255a30
prefix = read_virtual(prefix_address,22)
if prefix != b'Removed element IDs: \x00':
    raise SystemExit('Removed-element prefix changed')
# These are reviewed basic blocks, not a decompilation of the entire function.
excerpts = []
for low,high in [(0x1006298a8,0x1006298bc),(0x1006298fc,0x10062993c),(0x10062b6ec,0x10062b708),(0x10062a34c,0x10062a38c),(0x10062ad18,0x10062ad54),(0x10062b7a8,0x10062b7c4),(0x10062b7dc,0x10062b7fc)]:
    excerpts.append([{'address':hex(address), **instructions[address]} for address in range(low,high,4)])
# Swift enum field reflection identifies the two callback payloads. This is
# stronger evidence than guessing names from integer discriminants in ARM64.
def relative_address(address):
    displacement = struct.unpack('<i',read_virtual(address,4))[0]
    return address+displacement if displacement else None
def c_string(address):
    result = bytearray()
    for i in range(1024):
        byte = read_virtual(address+i,1)
        if byte == b'\x00': return result.decode('utf-8')
        result.extend(byte)
    raise SystemExit('Unterminated Swift reflection string')
nominal = 0x1012c94fc
name = c_string(relative_address(nominal+8))
fields = relative_address(nominal+16)
_,_,kind,record_size,count = struct.unpack('<iiHHI',read_virtual(fields,16))
if name != 'AccessibilityDifferenceLineBudgetExceeded' or (kind,record_size,count) != (3,12,2):
    raise SystemExit('Unexpected budget enum reflection layout')
cases = []
for i in range(count):
    field = fields+16+i*record_size
    cases.append({'name':c_string(relative_address(field+8)), 'payloadTypeMangled':c_string(relative_address(field+4))})
if cases != [
    {'name':'difference','payloadTypeMangled':'Si17fullTreeLineCount_t'},
    {'name':'removedElementSummary','payloadTypeMangled':'Si17fullTreeLineCount_t'},
]:
    raise SystemExit('Budget callback payload changed')
enum_evidence = {'name':name,'nominalDescriptor':hex(nominal),'fieldDescriptor':hex(fields),'cases':cases}
# Follow the caller as well: Optional.none is a request to render the full
# tree, not an empty diff. Resolve mode names from reflection before naming ABI tags.
def enum_case_names(nominal):
    fields = relative_address(nominal+16)
    _,_,kind,size,count = struct.unpack('<iiHHI',read_virtual(fields,16))
    if kind != 2 or size != 12:
        raise SystemExit('Unexpected no-payload/single-payload enum reflection')
    return fields,[c_string(relative_address(fields+16+i*size+8)) for i in range(count)]
mode_fields,mode_cases = enum_case_names(0x1012c17ec)
baseline_fields,baseline_cases = enum_case_names(0x1012c1808)
if mode_cases != ['difference','fullTree'] or baseline_cases != ['initial','previous']:
    raise SystemExit('Description modes changed')
mode_payload = relative_address(mode_fields+20)
# A symbolic typeref contains embedded zero bytes; it is NOT a C string.
if read_virtual(mode_payload,1) != b'\x01' or relative_address(mode_payload+1) != 0x1012c1808 or c_string(mode_payload+5) != '4from_t':
    raise SystemExit('Description difference payload changed')
caller_start = 0x100238b88
caller_end = starts[starts.index(caller_start)+1]
caller_raw = subprocess.check_output(['xcrun','llvm-objdump','--disassemble','--start-address='+hex(caller_start),'--stop-address='+hex(caller_end),str(artifact)],text=True)
caller_instructions = {}
for line in caller_raw.splitlines():
    match = re.match(r'^([0-9a-f]+):\s+([0-9a-f]{8})\s+(.+)',line)
    if match:
        address = int(match[1],16)
        word = int(match[2],16)
        if word != struct.unpack('<I',read_virtual(address,4))[0]:
            raise SystemExit('Caller machine code mismatch')
        caller_instructions[address] = {'word':match[2],'instruction':re.sub(r'\s+',' ',match[3].split(' <')[0].split(';')[0].strip())}
if sorted(caller_instructions) != list(range(caller_start,caller_end,4)):
    raise SystemExit('Incomplete caller disassembly')
def require_bl(address,target):
    word = int(caller_instructions[address]['word'],16)
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    if word >> 26 != 0b100101 or address+immediate*4 != target:
        raise SystemExit('Caller target changed')
require_bl(0x100238fe0,start)
require_bl(0x10023926c,0x10063deec)
if caller_instructions[0x100239004]['word'] != 'b4000fba':
    raise SystemExit('Expected nil-result CBZ branch changed')
caller_excerpts=[]
for low,high in [(0x100238ed4,0x100238ee0),(0x100238f3c,0x100238fe8),(0x100238ffc,0x100239030),(0x1002391f8,0x10023921c),(0x10023924c,0x100239274)]:
    caller_excerpts.append([{'address':hex(a),**caller_instructions[a]} for a in range(low,high,4)])
getter_address = 0x100654a6c
getter_words = [hex(struct.unpack('<I',read_virtual(getter_address+i*4,4))[0]) for i in range(4)]
if getter_words != ['0xf9400288','0xf9404d08','0xf8686a80','0x142c026e']:
    raise SystemExit('Previous revision getter changed')
caller_evidence = {
    'function':'ComputerUse.SystemSelection.llmDescription(_:lineOptions:)',
    'start':hex(caller_start),'endExclusive':hex(caller_end),
    'machineCodeSha256':hashlib.sha256(read_virtual(caller_start,caller_end-caller_start)).hexdigest(),
    'modeCases':mode_cases,'baselineCases':baseline_cases,
    'modeFieldDescriptor':hex(mode_fields),'baselineFieldDescriptor':hex(baseline_fields),
    'differencePayload':'(from: SystemSelection.DifferenceBaseline)',
    'previousRevisionGetter':{'address':hex(getter_address),'words':getter_words,'metadataOffset':'0x98'},
    'differenceCall':'0x100238fe0','nilBranch':'0x100239004',
    'fullTreeFallbackEntry':'0x1002391f8','fullTreeLinesCall':'0x10023926c',
    'reviewedInstructionExcerpts':caller_excerpts,
    'limitations':'Static caller control flow; no native service execution or complete rendering implementation.',
}
implementation_evidence = {
    'function':diff['signature'], 'start':hex(start), 'endExclusive':hex(end),
    'boundarySource':'LC_FUNCTION_STARTS', 'instructionCount':len(instructions),
    'machineCodeSha256':hashlib.sha256(body).hexdigest(),
    'renderTreeSnapshotCalls':calls,
    'budgetCallbackEnum':enum_evidence,
    'removedElementPrefix':{'address':hex(prefix_address),'text':prefix[:-1].decode()},
    'reviewedInstructionExcerpts':excerpts,
    'scope':'Static call sites and basic blocks only; traversal, budget and identity rules remain unrecovered.',
}
presentation_functions = []
for address,name in [(0x100637128,'init(body:focusedElement:selectedText:selectedElements:)'),(0x100637170,'init(windowTitle:applicationName:treeLines:focusedElement:selectedText:selectedElements:)'),(0x100637438,'shared initializer implementation')]:
    boundary = starts[starts.index(address)+1]
    presentation_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
presentation_literals = [{'address':hex(a),'text':c_string(a)} for a in [0x101255c90,0x101255c70,0x101255b60]]
if presentation_literals[0]['text'] != '\nSelected text: ```\n' or presentation_literals[1]['text'] != '\nThe focused UI element is ':
    raise SystemExit('Presentation literal changed')
presentation_evidence = {
    'functions':presentation_functions,'literals':presentation_literals,
    'selectedTextPresenceBranch':'0x10063747c',
    'selectedElementsEmptyBranch':'0x1006374ec',
    'focusedElementPresenceBranch':'0x1006375e0',
    'scope':'Recovered constructor formatting from static ARM64; not a live native-service oracle.',
}
selection_functions = []
for address,name in [(0x10078e7f0,'UIElementProtocol.selectedText.getter'),(0x10078e994,'UIElementProtocol.selectedTextMarkerRange.getter'),(0x100799654,'AXSelectedText attribute initialization'),(0x10079c54c,'string-for-marker-range parameterized attribute initialization')]:
    boundary = starts[starts.index(address)+1]
    selection_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
marker_attribute = c_string(0x1012579e0)
if marker_attribute != 'AXStringForTextMarkerRange':
    raise SystemExit('Marker range parameterized attribute changed')
selection_evidence = {
    'functions':selection_functions,
    'parameterizedAttribute':{'address':'0x1012579e0','text':marker_attribute},
    'directTextEmptyCheck':'0x10078e854..0x10078e864',
    'markerRangeCall':'0x10078e878',
    'parameterizedReadCall':'0x10078e8d4',
    'errorBranch':'0x10078e8d8..0x10078e8f8',
    'fallbackEmptyCheck':'0x10078e92c..0x10078e94c',
    'scope':'Getter fallback logic only; original typed AX element/marker wrappers remain unrestored.',
}
attribute_functions = []
for address,name in [(0x1007a7600,'typed attribute dispatch'),(0x1007aeea4,'cachedValue(for:)'),(0x1007ae414,'uncachedValue(for:ignoringTypeMismatch:)'),(0x1007aecec,'typed parameterized value dispatch'),(0x1007c1c54,'UITextMarkerRange.init(start:end:)')]:
    boundary = starts[starts.index(address)+1]
    attribute_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
attribute_evidence = {
    'functions':attribute_functions,
    'cachedValueCall':'0x1007a7684',
    'optionalTagBranch':'0x1007a76a0..0x1007a76a4',
    'uncachedValueCall':'0x1007a76c4',
    'ignoreTypeMismatchForwarding':'0x1007a76a8..0x1007a76ac',
    'markerWrapperInitializer':{'address':'0x100009888','instructionWord':hex(struct.unpack('<I',read_virtual(0x100009888,4))[0])},
    'scope':'Cache/fallback dispatch only; underlying cache, AX decoding and marker validation are not recovered.',
}
# Imported C calls are in the indirect symbol table, not the Swift export
# table. Resolve exact stub addresses rather than nearest-symbol annotations.
indirect_text = subprocess.check_output(['xcrun','llvm-objdump','--macho','--indirect-symbols',str(artifact)],text=True)
indirect = {}
for line in indirect_text.splitlines():
    match = re.match(r'0x([0-9a-fA-F]+)\s+\d+\s+(.*)',line)
    if match: indirect[int(match[1],16)] = match[2]
decode_functions = []
for address,name in [(0x1006fac18,'AXPartialValue decoded dispatch'),(0x1006e8fc8,'AXEncodedValue.unwrapped()'),(0x1006e9044,'AXEncodedValue.unwrappedThrowing(_:)'),(0x1007ae414,'UIElementProtocol.uncachedValue(for:ignoringTypeMismatch:)')]:
    boundary = starts[starts.index(address)+1]
    decode_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
type_calls=[]
for address in range(0x1006e9044,0x1006e9d38,4):
    word = struct.unpack('<I',read_virtual(address,4))[0]
    if word >> 26 != 0b100101: continue
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    destination = address+immediate*4
    symbol = indirect.get(destination,'')
    if symbol in ['_CFGetTypeID','_AXUIElementGetTypeID','_AXTextMarkerGetTypeID','_AXTextMarkerRangeGetTypeID','_AXValueGetTypeID','_CFArrayGetTypeID']:
        type_calls.append({'address':hex(address),'stub':hex(destination),'symbol':symbol})
if {row['symbol'] for row in type_calls} != {'_CFGetTypeID','_AXUIElementGetTypeID','_AXTextMarkerGetTypeID','_AXTextMarkerRangeGetTypeID','_AXValueGetTypeID','_CFArrayGetTypeID'}:
    raise SystemExit('Native typed decoding dispatch changed')
decoding_evidence = {
    'functions':decode_functions,'resolvedTypeCalls':type_calls,
    'symbolResolution':'Mach-O indirect symbol table + decoded ARM64 BL immediate',
    'nonthrowingWrapper':{'argumentFlagZero':'0x1006e8fe8','throwingCall':'0x1006e8ff4','errorCheck':'0x1006e8ff8','nilAssignment':'0x1006e9004..0x1006e9018'},
    'limitations':'Confirms type dispatch and wrapper error handling, not the complete conversion/error algorithm.',
}
# Marker wrappers are distinct Swift value types, not arbitrary CF objects.
marker_calls = []
for address, expected_symbol in [
    (0x1006e9248, '_AXTextMarkerGetTypeID'),
    (0x1006e9270, '_swift_dynamicCastUnknownClassUnconditional'),
    (0x1006e929c, '_swift_dynamicCast'),
    (0x1006e930c, '_AXTextMarkerRangeGetTypeID'),
    (0x1006e9334, '_swift_dynamicCastUnknownClassUnconditional'),
    (0x1006e9360, '_swift_dynamicCast'),
    (0x1007c1c78, '_AXTextMarkerRangeCreate'),
]:
    word = struct.unpack('<I', read_virtual(address, 4))[0]
    if word >> 26 != 0b100101: raise SystemExit('Marker direct call changed')
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    destination = address + immediate * 4
    if indirect.get(destination) != expected_symbol: raise SystemExit('Marker call target changed')
    marker_calls.append({'address':hex(address),'stub':hex(destination),'symbol':expected_symbol})
marker_words = {
    0x1006e9250:0x540005e1, 0x1006e9284:0x913a0042,
    0x1006e92a0:0x34000f60, 0x1006e9314:0x54000fe1,
    0x1006e9348:0x913aa042, 0x1006e9364:0x340014c0,
    0x1006e94dc:0x52800048, 0x1006e94e8:0x12000101,
    0x1006e964c:0x52800048, 0x1006e9658:0x12000101,
    0x1007c1c6c:0xd2800000, 0x1007c1c70:0xaa1403e1,
    0x1007c1c74:0xaa1303e2, 0x1007c1c90:0xaa1503e0,
}
for address, expected_word in marker_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != expected_word:
        raise SystemExit('Marker conversion or constructor branch changed')
for address in [0x1006e94f4, 0x1006e9664]:
    word = struct.unpack('<I',read_virtual(address,4))[0]
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    if word >> 26 != 0b100101 or address + immediate * 4 != 0x1006e9d38:
        raise SystemExit('Marker shared failure policy call changed')
marker_evidence = {
    'resolvedCalls':marker_calls,
    'instructionWords':{hex(a):hex(w) for a,w in marker_words.items()},
    'wrapperMetadata':{'UITextMarker':'0x10149fe80','UITextMarkerRange':'0x10149fea8'},
    'failurePolicyCalls':{'marker':'0x1006e94f4','range':'0x1006e9664','sharedTarget':'0x1006e9d38'},
    'constructor':{'start':'0x1007c1c54','endExclusive':'0x1007c1ca4',
        'machineCodeSha256':hashlib.sha256(read_virtual(0x1007c1c54,0x50)).hexdigest()},
    'interpretation':'CF type-ID guards precede forced C-reference casts; distinct Swift wrappers are dynamically cast to the requested generic type. Failed wrapper conversion constructs failedToUnwrapAttributeValue(requestedType) and forwards the throwing flag to shared failure handling. Range construction calls AXTextMarkerRangeCreate(nil,start,end) and returns its result without a local null/error branch.',
    'limitations':'Static evidence only. Does not establish private C declarations, marker validation outside this branch, marker byte layout, or full typed parameter encoding. Native marker wrappers and observation integration remain unrestored.',
}
parameter_functions = []
for address, name in [(0x1006ea3e4,'parameter encoding'), (0x1007aecec,'typed parameterized read')]:
    boundary = starts[starts.index(address)+1]
    parameter_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
parameter_calls = []
for address, destination in [(0x1007aed3c,0x1006ea3e4),(0x1007aed78,0x1006f6ed4),(0x1007aedf8,0x1006fac24),
                             (0x1006ea518,0x101153954),(0x1006ea5f0,0x101153954)]:
    word = struct.unpack('<I',read_virtual(address,4))[0]
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    if word >> 26 != 0b100101 or address + immediate*4 != destination:
        raise SystemExit('Typed parameter encoding/read call changed')
    parameter_calls.append({'address':hex(address),'destination':hex(destination)})
if indirect.get(0x101153954) != '_AXValueCreate': raise SystemExit('Parameter AXValueCreate stub changed')
parameter_words = {
    0x1006ea464:0x913a0063, 0x1006ea484:0x913aa063, 0x1006ea4a0:0xf94013f4,
    0x1006ea514:0x52800080, 0x1006ea57c:0x52800020,
    0x1006ea5b4:0x52800060, 0x1006ea5ec:0x52800040,
    0x1006ea51c:0xb50006e0, 0x1006ea5f4:0xb4000060,
    0x1006ea624:0x52800088, 0x1007aed50:0xb5000233,
    0x1007aed80:0xb40001d5, 0x1007aedc4:0xb40003e8,
}
for address, word in parameter_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word:
        raise SystemExit('Parameter conversion/error branch changed')
parameter_evidence = {
    'functions':parameter_functions, 'calls':parameter_calls,
    'instructionWords':{hex(a):hex(w) for a,w in parameter_words.items()},
    'interpretation':'Typed parameterized access encodes before system read, then uses decodedThrowing for a present result. Encoding extracts marker/range references; CFRange/CGPoint/CGRect/CGSize use AXValueCreate types 4/1/3/2 and failure case failedToWrapAXValue.',
    'limitations':'Concrete marker/geometry/range branches only. UIElement wrapper extraction, generic fallback, typed attribute protocol dispatch and complete output decoding remain separate.',
}
ordinary_words = {0x1006e968c:0x540009e1,0x1006e97ec:0x528000c4,
    0x1006e97fc:0x34000b20,0x1006e9804:0x52800001,
    0x1006e99a8:0x52800048,0x1006e99b4:0x12000101}
for address, word in ordinary_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word:
        raise SystemExit('Ordinary AX value conversion branch changed')
ordinary_calls = []
for address, destination in [(0x1006e97f0,0x101155118),(0x1006e9ae8,0x1006e9d38)]:
    word = struct.unpack('<I',read_virtual(address,4))[0]
    immediate = word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    if word >> 26 != 0b100101 or address + immediate*4 != destination:
        raise SystemExit('Ordinary AX value conversion call changed')
    ordinary_calls.append({'address':hex(address),'destination':hex(destination)})
if indirect.get(0x101155118) != '_swift_dynamicCast': raise SystemExit('Ordinary cast stub changed')
ordinary_evidence = {
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1006e97c8,0x1006e9854),(0x1006e9960,0x1006e99c4)]],
    'instructionWords':{hex(a):hex(w) for a,w in ordinary_words.items()},'calls':ordinary_calls,
    'interpretation':'After specialized CF branches, dynamically cast the original object to the requested type. Failure constructs failedToUnwrapAttributeValue(requestedType) and forwards the original throwing flag to shared failure handling.',
    'limitations':'Ordinary-object branch only, not a replacement for UIElement/marker/AXValue/array dispatch or complete typed output decoding.',
}
# The concrete AXValue reader is a separate helper, not the outer decoder.
unpack_start = 0x1006ea098
unpack_end = starts[starts.index(unpack_start)+1]
if unpack_end != 0x1006ea28c: raise SystemExit('AXValue unpacker boundary changed')
unpack_calls=[]
for address in range(unpack_start,unpack_end,4):
    word=struct.unpack('<I',read_virtual(address,4))[0]
    if word >> 26 != 0b100101: continue
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    destination=address+immediate*4
    symbol=indirect.get(destination,'')
    if symbol in ['_AXValueGetType','_AXValueGetValue']:
        unpack_calls.append({'address':hex(address),'stub':hex(destination),'symbol':symbol})
if [(row['address'],row['symbol']) for row in unpack_calls] != [
    ('0x1006ea0d0','_AXValueGetType'),
    ('0x1006ea104','_AXValueGetValue'),
    ('0x1006ea144','_AXValueGetValue'),
    ('0x1006ea170','_AXValueGetValue'),
    ('0x1006ea1b8','_AXValueGetValue'),
    ('0x1006ea1e8','_AXValueGetValue'),
]: raise SystemExit('AXValue unpacker system calls changed')
unpack_evidence={
    'start':hex(unpack_start),'endExclusive':hex(unpack_end),
    'machineCodeSha256':hashlib.sha256(read_virtual(unpack_start,unpack_end-unpack_start)).hexdigest(),
    'resolvedCalls':unpack_calls,
    'valueTypes':{'1':'CGPoint','2':'CGSize','3':'CGRect','4':'CFRange','5':'AXError'},
    'readFailureNil':'0x1006ea208',
    'unsupportedTypeError':'0x1006ea214',
    'limitations':'Concrete AXValue unpacking only; noValue policy belongs to outer AXEncodedValue decoding.',
}
# AXValue decoding first dynamically casts Optional<Any> to the requested
# generic type. Only a failed cast enters AXError/noValue handling.
cast_descriptor = 0x101193410
cast_displacement,cast_length=struct.unpack('<ii',read_virtual(cast_descriptor,8))
cast_typeref=read_virtual(cast_descriptor+cast_displacement,cast_length)
if cast_typeref != b'ypSg': raise SystemExit('AXValue cast source is no longer Optional<Any>')
if indirect.get(0x101155118) != '_swift_dynamicCast': raise SystemExit('Swift dynamic cast stub changed')
axvalue_decode_words={
    0x1006e9548:0x940002d4, # call unpacker
    0x1006e9550:0xb4001835, # no lower error -> cast; error bypasses flag helper
    0x1006e9890:0x9429ae22, # dynamicCast Optional<Any> -> requested type
    0x1006e9894:0x34000be0, # failed cast -> AXError fallback
    0x1006e9a74:0x9429ada9, # dynamicCast Any -> AXError
    0x1006e9a80:0x128c4f68, # -25212
    0x1006e9a88:0x54000861, # other AXError -> error construction
    0x1006e9bb8:0x3900403f, # enum case 0: axError
    0x1006e9b60:0x39004028, # store case 2: failedToUnwrapAttributeValue
    0x1006e9d44:0x360000e1, # false flag -> nil; true -> throw
}
for address,word in axvalue_decode_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word:
        raise SystemExit('AXValue decoded-result branch changed at '+hex(address))
axvalue_decode_evidence={
    'castSourceDescriptor':hex(cast_descriptor),'castSourceType':cast_typeref.decode(),
    'dynamicCastStub':'0x101155118',
    'verifiedInstructions':{hex(address):hex(word) for address,word in axvalue_decode_words.items()},
    'order':['try concrete unpacker (errors propagate)', 'cast Optional<Any> to requested type', 'on cast failure, inspect AXError', 'noValue returns nil; other AXError uses conditional failure', 'non-AXError mismatch uses failedToUnwrapAttributeValue(requested type)'],
    'scope':'AXValue branch only, not the full generic decoder.',
}
element_start=0x1006e9d90
element_end=starts[starts.index(element_start)+1]
if element_end != 0x1006e9e50: raise SystemExit('AXUIElement decoder boundary changed')
element_calls=[]
for address in range(element_start,element_end,4):
    word=struct.unpack('<I',read_virtual(address,4))[0]
    if word >> 26 != 0b100101: continue
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    destination=address+immediate*4
    symbol=indirect.get(destination,'')
    if symbol in ['_CFGetTypeID','_AXUIElementGetTypeID','_swift_dynamicCastUnknownClassUnconditional']:
        element_calls.append({'address':hex(address),'symbol':symbol})
if element_calls != [
    {'address':'0x1006e9db8','symbol':'_CFGetTypeID'},
    {'address':'0x1006e9dc0','symbol':'_AXUIElementGetTypeID'},
    {'address':'0x1006e9de8','symbol':'_swift_dynamicCastUnknownClassUnconditional'},
]: raise SystemExit('AXUIElement checked-cast sequence changed')
element_evidence={
    'start':hex(element_start),'endExclusive':hex(element_end),
    'machineCodeSha256':hashlib.sha256(read_virtual(element_start,element_end-element_start)).hexdigest(),
    'resolvedCalls':element_calls,
    'typeMismatchBranch':'0x1006e9dc8',
    'falseFlagReturnsNil':'0x1006e9df8..0x1006e9dfc',
    'errorCase2':'0x1006e9e28..0x1006e9e30',
    'scope':'Raw AXUIElement decoder only; generic UIElementProtocol wrapper construction is separate.',
}
# Raw attribute readers have different result/error contracts, and an optional
# MockProvider path precedes the system API. Do not conflate this with a backend.
mock_descriptor=0x1012cc62c
mock_name=c_string(relative_address(mock_descriptor+8))
if mock_name != 'MockProvider': raise SystemExit('Attribute mock provider changed')
read_functions=[]
for address,name in [(0x1006f5f88,'AXUIElement.value(for:)'),(0x1006f6ed4,'AXUIElement.parameterizedValue(for:parameter:)')]:
    boundary=starts[starts.index(address)+1]
    read_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
raw_calls=[]
for low,high in [(0x1006f5f88,0x1006f629c),(0x1006f6ed4,0x1006f7278)]:
    for address in range(low,high,4):
        word=struct.unpack('<I',read_virtual(address,4))[0]
        if word >> 26 != 0b100101: continue
        immediate=word & 0x3ffffff
        if immediate & 0x2000000: immediate -= 0x4000000
        symbol=indirect.get(address+immediate*4,'')
        if symbol in ['_AXUIElementCopyAttributeValue','_AXUIElementCopyParameterizedAttributeValue','_getpid']:
            raw_calls.append({'address':hex(address),'symbol':symbol})
if raw_calls != [
    {'address':'0x1006f60f0','symbol':'_getpid'},
    {'address':'0x1006f6144','symbol':'_AXUIElementCopyAttributeValue'},
    {'address':'0x1006f7040','symbol':'_getpid'},
    {'address':'0x1006f7098','symbol':'_AXUIElementCopyParameterizedAttributeValue'},
]: raise SystemExit('Raw attribute system calls changed')
raw_attribute_evidence={
    'functions':read_functions,'resolvedCalls':raw_calls,
    'mockProviderDescriptor':hex(mock_descriptor),'mockProviderName':mock_name,
    'plainStatusStored':'0x1006f6254',
    'plainValuePresenceCheck':'0x1006f6214',
    'parameterizedNonzeroStatusThrows':'0x1006f70a8..0x1006f70dc',
    'parameterizedSuccessValuePresenceCheck':'0x1006f71e8',
    'limitations':'Direct system-call branches only. Same-process dispatch, mock hooks and AXPartialValue metadata require further restoration.',
}
pid_functions=[]
for address in [0x1006f9f30,0x1006fa0d4,0x100256028]:
    boundary=starts[starts.index(address)+1]
    pid_functions.append({'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
pid_words={0x1006fa02c:0x12800008,0x1006fa030:0xb90033e8,0x1006fa03c:0x97ed6ffb,
           0x1006fa040:0x340001e0,0x1006fa07c:0xb94033f4,0x1006fa258:0xf10002bf,
           0x1006fa25c:0x1a9f07e8,0x1006fa26c:0xaa088120}
for address,word in pid_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word: raise SystemExit('PID result handling changed')
raw_attribute_evidence['processIdentity']={
    'exportedGetter':next(row for row in rows if '.actualPID.getter' in row['signature']),
    'functions':pid_functions,'resultWords':{hex(a):hex(w) for a,w in pid_words.items()},
    'interpretation':'Direct actualPID path initializes Int32 output to -1, calls an indirect query wrapper, throws axError on nonzero status, otherwise returns the output. The caller encodes thrown failure as optional nil after logging.',
    'limitations':'MockProvider, obfuscated function resolution and log emission are not reconstructed. The inspected wrapper initialization is not evidence of a per-element PID result cache.',
}
descriptor_records=[]
for nominal,expected_name,expected_fields in [
    (0x1012c9454,'AXArraySubsetDescriptor',[('count','Si'),('availableRanges','SaySnySiGGSg')]),
    (0x1012cc604,'AXTruncationDescriptor',[('count','Si'),('availableRange','SnySiGSg')]),
]:
    name=c_string(relative_address(nominal+8))
    fields=relative_address(nominal+16)
    _,_,kind,size,count=struct.unpack('<iiHHI',read_virtual(fields,16))
    if name != expected_name or (kind,size,count) != (0,12,2): raise SystemExit('AX descriptor layout changed')
    recovered=[]
    for i in range(count):
        field=fields+16+i*size
        recovered.append((c_string(relative_address(field+8)),c_string(relative_address(field+4))))
    if recovered != expected_fields: raise SystemExit('AX descriptor field types changed')
    descriptor_records.append({'name':name,'nominalDescriptor':hex(nominal),'fields':recovered})
complete_address=0x10045f8b4
complete_end=starts[starts.index(complete_address)+1]
complete_words=list(struct.unpack('<III',read_virtual(complete_address,12)))
if complete_end != 0x10045f8c0 or complete_words != [0xf100003f,0x1a9f17e0,0xd65f03c0]:
    raise SystemExit('AX subset isComplete no longer compares only its optional ranges pointer')
value_descriptor_evidence={
    'descriptors':descriptor_records,
    'isComplete':{'start':hex(complete_address),'endExclusive':hex(complete_end),'instructionWords':[hex(word) for word in complete_words],'semantics':'availableRanges == nil; count and range coverage are not inspected'},
    'limitations':'Value metadata only; truncation generation and subset selection algorithms remain separate.',
}
partial_array_start=0x1006fac44
partial_array_end=starts[starts.index(partial_array_start)+1]
if partial_array_end != 0x1006facb8: raise SystemExit('Partial array decoder boundary changed')
partial_array_words={
    0x1006fac68:0xf9400280, # encoded value field
    0x1006fac70:0x97ffb8d6, # call nonthrowing unwrapped
    0x1006fac78:0xb40000d3, # nil array -> nil result
    0x1006fac7c:0xa940d295, # preserve stored subset descriptor
    0x1006fac90:0xd2800015,
    0x1006fac94:0xd2800014,
    0x1006fac34:0x52800020, # separate decodedThrowing passes true
    0x1006fac38:0x97ffb903,
}
for address,word in partial_array_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word:
        raise SystemExit('Partial-value decoding dispatch changed at '+hex(address))
partial_array_evidence={
    'start':hex(partial_array_start),'endExclusive':hex(partial_array_end),
    'machineCodeSha256':hashlib.sha256(read_virtual(partial_array_start,partial_array_end-partial_array_start)).hexdigest(),
    'verifiedInstructions':{hex(address):hex(word) for address,word in partial_array_words.items()},
    'semantics':'Nonthrowing array decode; nil fails, empty array succeeds; subset metadata forwarded without count/range reconciliation.',
    'limitations':'Underlying generic CFArray decoding and full AXPartialValue storage are not implemented by this helper.',
}
# Some Swift stubs appear as LOCAL ABSOLUTE in the indirect-symbol table.
# Resolve their GOT binding through dyld fixups instead of guessing from labels.
fixups=subprocess.check_output(['xcrun','dyld_info','-fixups',str(artifact)],text=True)
# Resolve the same-process read scheduling branch to actual framework symbols.
thread_bindings = {}
for slot, expected_binding in [
    ('0x10151ed40', 'Foundation/_OBJC_CLASS_$_NSThread'),
    ('0x101469058', 'libswiftDispatch/_$sSo17OS_dispatch_queueC8DispatchE4mainABvgZ'),
    ('0x101469068', 'libswiftDispatch/_$sSo17OS_dispatch_queueC8DispatchE4sync7executexxyKXE_tKlF'),
]:
    line = next((line for line in fixups.splitlines() if slot in line.lower()), '')
    if expected_binding not in line: raise SystemExit('AX read scheduling binding changed: '+slot)
    thread_bindings[slot] = expected_binding
if c_string(0x10136b018) != 'isMainThread': raise SystemExit('AX read thread selector changed')
thread_words = {0x1006f60fc:0xb7000140,0x1006f6100:0x6b00033f,0x1006f6104:0x54000101,
                0x1006f6120:0x36000240,0x1006f704c:0xb7000140,0x1006f7050:0x6b00039f,
                0x1006f7054:0x54000101,0x1006f7070:0x36000480}
for address, expected_word in thread_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != expected_word:
        raise SystemExit('AX read scheduling branch changed')
raw_attribute_evidence['sameProcessScheduling'] = {
    'bindings':thread_bindings, 'selector':{'address':'0x10136b018','value':'isMainThread'},
    'branchWords':{hex(address):hex(word) for address,word in thread_words.items()},
    'mainQueueSyncCalls':['0x1006f61d8','0x1006f7168'],
    'interpretation':'When resolved PID equals getpid and NSThread.isMainThread is false, both direct system-read branches synchronously use DispatchQueue.main; missing/different PID or main thread stays direct.',
    'limitations':'Static branch and symbol evidence. PID helper failure handling and MockProvider dispatch remain separate; no per-element PID cache established.',
}
compact_symbol='_$sSTsE10compactMapySayqd__Gqd__Sg7ElementQzKXEKlF'
compact_line=next((line for line in fixups.splitlines() if '0x1014665a8' in line.lower()),'')
if 'libswiftCore/'+compact_symbol not in compact_line:
    raise SystemExit('Array transform Swift binding changed')
if c_string(relative_address(0x1012cc42c+8)) != 'TypeErasedArray':
    raise SystemExit('Array conversion protocol changed')
array_transform_functions=[]
for address,boundary in [(0x1006ea28c,0x1006ea328),(0x1006ea758,0x1006ea7b4)]:
    if starts[starts.index(address)+1] != boundary: raise SystemExit('Array transform boundary changed')
    array_transform_functions.append({'start':hex(address),'endExclusive':hex(boundary),'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
array_transform_words={0x1006ea310:0x94299a42,0x101150c18:0xd00018b0,0x101150c1c:0xf942d610,0x101150c20:0xd61f0200,0x1006ea79c:0x97fffa0b}
for address,word in array_transform_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word: raise SystemExit('Array compactMap call chain changed')
array_transform_evidence={
    'functions':array_transform_functions,'protocolDescriptor':'0x1012cc42c','protocolName':'TypeErasedArray',
    'compactMapStub':'0x101150c18','gotSlot':'0x1014665a8','boundSymbol':compact_symbol,
    'resolution':'dyld_info -fixups + verified ARM64 stub GOT load',
    'callbackNonthrowingDecodeCall':'0x1006ea79c',
    'semantics':'compactMap removes nil element decodes, preserving successful element order and duplicates.',
    'limitations':'CFArray bridging, target protocol conformance and final array cast remain separate parts of the full decoder.',
}
array_protocol=0x1012cc42c
if struct.unpack('<II',read_virtual(array_protocol+12,8)) != (0,1):
    raise SystemExit('TypeErasedArray protocol requirements changed')
if c_string(relative_address(array_protocol+20)) != 'ElementType':
    raise SystemExit('TypeErasedArray associated type changed')
if struct.unpack('<II',read_virtual(array_protocol+24,8)) != (7,0):
    raise SystemExit('Expected associated-type requirement without default implementation')
array_conformance=0x101193450
if relative_address(array_conformance) != array_protocol or relative_address(array_conformance+4) != 0x1014667e8:
    raise SystemExit('Array protocol conformance descriptor changed')
flags=struct.unpack('<I',read_virtual(array_conformance+12,4))[0]
if (flags >> 3) & 7 != 1: raise SystemExit('Expected indirect nominal type descriptor')
for slot,symbol in [('0x1014667e8','_$sSaMn'),('0x101467748','_$ss15_arrayForceCastySayq_GSayxGr0_lF')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if 'libswiftCore/'+symbol not in line: raise SystemExit('Array target binding changed')
array_type_refs=[]
for address, expected, name in [(0x101193d10,b'SayyXlG','bridge target [AnyObject]'),(0x101193400,b'SayypG','eligibility error expected [Any]')]:
    displacement,length=struct.unpack('<iI',read_virtual(address,8))
    value=read_virtual(address+displacement,length)
    if value != expected: raise SystemExit('Array bridge/error target type changed')
    array_type_refs.append({'descriptor':hex(address),'mangled':value.decode(),'meaning':name})
array_initial_words={0x1006e96a4:0xb4001900,0x1006e96dc:0x528000c4,
    0x1006e96e4:0x34001e20,0x1006e9a04:0xa9005c34,0x1006e9a08:0x52800028}
for address,word in array_initial_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word:
        raise SystemExit('Array eligibility/bridge branch changed')
word=struct.unpack('<I',read_virtual(0x1006e96e0,4))[0]
immediate=word & 0x3ffffff
if immediate & 0x2000000: immediate -= 0x4000000
if word >> 26 != 0b100101 or indirect.get(0x1006e96e0+immediate*4) != '_swift_dynamicCast':
    raise SystemExit('Array bridge dynamic cast changed')
array_target_evidence={
    'protocolDescriptor':hex(array_protocol),'associatedType':'ElementType','methodRequirementCount':0,
    'bridgeAndEligibilityTypes':array_type_refs,
    'initialBranchWords':{hex(a):hex(w) for a,w in array_initial_words.items()},
    'bridgeDynamicCast':'0x1006e96e0',
    'initialFailureError':'unexpectedAttributeValueType(expected: [Any], actual: requestedType)',
    'arrayConformanceDescriptor':hex(array_conformance),'conformingTypeGotSlot':'0x1014667e8','conformingTypeSymbol':'_$sSaMn',
    'arrayForceCastGotSlot':'0x101467748','arrayForceCastCall':'0x1006e9c38',
    'finalDynamicCast':'0x1006e9c78',
    'finalFailureError':'unexpectedAttributeValueType(expected: target, actual: target)',
    'finalFailureConstruction':'0x1006e9d28..0x1006e9d30',
    'limitations':'Protocol, bridge and conversion evidence; the complete generic element decoder and dynamic dispatch are not yet connected.',
}
element_storage=[]
for nominal, name, expected_names in [
    (0x1012cd398,'UIElement',['axElement','cache']),
    (0x1012cce40,'UIElementCache',['supportedAttributes','attributes','transactionAttributes']),
]:
    fields=relative_address(nominal+16)
    _,_,kind,size,count=struct.unpack('<iiHHI',read_virtual(fields,16))
    names=[c_string(relative_address(fields+16+i*size+8)) for i in range(count)]
    if kind != 0 or size != 12 or names != expected_names:
        raise SystemExit('UIElement/cache storage layout changed')
    element_storage.append({'name':name,'nominalDescriptor':hex(nominal),'fieldDescriptor':hex(fields),
        'fields':names,'fieldRecordsSha256':hashlib.sha256(read_virtual(fields,16+size*count)).hexdigest()})
context_slot='0x1014698a8'
context_binding=next((line for line in fixups.splitlines() if context_slot in line.lower()),'')
if 'libswift_Concurrency/_$ss9TaskLocalC3getxyF' not in context_binding:
    raise SystemExit('UIElement cache context getter changed')
element_init_functions=[]
for address,name in [(0x1007213dc,'UIElement.init(element:) entry'),(0x10072187c,'shared element initializer'),
                     (0x1007645a4,'UIElementCache.init'),(0x10076589c,'cache construction helper')]:
    boundary=starts[starts.index(address)+1]
    element_init_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
context_words={0x1007213dc:0x14000128,0x1011537e0:0xd00018b0,
    0x1011537e4:0xf9445610,0x1011537e8:0xd61f0200,
    0x1007218c0:0xb4000188,0x1007218f8:0xd2800014,
    0x1007218fc:0xd2800015,0x100721900:0xd2800016}
for address,word in context_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word:
        raise SystemExit('UIElement context initialization branch changed')
for address,destination in [(0x1007218b8,0x1011537e0),(0x1007645dc,0x1011537e0),(0x100721914,0x10076589c)]:
    word=struct.unpack('<I',read_virtual(address,4))[0]
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate -= 0x4000000
    if word >> 26 != 0b100101 or address+immediate*4 != destination:
        raise SystemExit('UIElement cache initialization call changed')
element_storage_evidence={
    'layouts':element_storage,'functions':element_init_functions,
    'contextGetter':{'stub':'0x1011537e0','got':context_slot,'binding':'libswift_Concurrency/_$ss9TaskLocalC3getxyF'},
    'instructionWords':{hex(a):hex(w) for a,w in context_words.items()},
    'interpretation':'UIElement stores an AX reference plus UIElementCache. The shared initializer and cache initializer read TaskLocal context. The element initializer forwards context components or absent-context zeros to the cache construction helper.',
    'limitations':'TaskLocal payload layout and synchronous scope are statically established; explicit cache construction is restored. Complete transaction assembly, invalidation and production lifetime remain pending. An AX reference alone cannot stand in for the complete UIElement.',
}
element_protocol=0x1012cd46c
protocol_header=read_virtual(element_protocol,24)
if protocol_header.hex()!='43000100e8eefffffc95ecff040000000c00000000000000':
    raise SystemExit('UIElementProtocol descriptor changed')
protocol_signature=read_virtual(element_protocol+24,48)
if protocol_signature.hex()!='80000000a422fdff75231d00800000009822fdff71231d00010000003e23fdffe00dfdff010000003e23fdff5213fdff':
    raise SystemExit('UIElementProtocol inherited/associated requirements changed')
protocol_flags=[0,0,3,0x13,0x13,2,0x13,0x13,0x13,0x13,0x11,0x11]
for index,flag in enumerate(protocol_flags):
    if struct.unpack('<II',read_virtual(0x1012cd4b4+index*8,8))!=(flag,0):
        raise SystemExit('UIElementProtocol witness requirement changed')
for slot,binding in [('0x10149f800','0x1012c9238'),('0x10149f808','libswiftCore/_$sSHMp'),('0x101462198','0x1012cc16c'),('0x101460d50','0x1012cd598')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if binding.lower() not in line.lower(): raise SystemExit('UIElementProtocol constraint binding changed')
if c_string(relative_address(0x1012cc16c+8))!='AXUIElement':
    raise SystemExit('UIElementProtocol ID type changed')
element_storage_evidence['protocolContract']={
    'descriptor':hex(element_protocol),'headerBytes':protocol_header.hex(),
    'signatureRequirementBytes':protocol_signature.hex(),
    'signatureRequirementCount':4,'witnessRequirementCount':12,
    'inherits':['ComputerUseCore.AccessibilityNode','Swift.Hashable'],
    'sameTypes':{'ID':'AXUIElement','Role':'UIElementRole'},
    'associatedTypeRefs':{'ID':'0x10129e284','Role':'0x10129e802'},
    'witnessRequirements':[{'descriptor':hex(0x1012cd4b4+i*8),'flags':hex(flag),'defaultImplementation':None} for i,flag in enumerate(protocol_flags)],
    'elementWitnessTable':'0x10149ed40',
    'confirmedElementWitnesses':[
        {'slot':'0x10149ed58','target':'0x10078fbf4','meaning':'static role returns nil for generic UIElement'},
        {'slot':'0x10149ed60','target':'0x10078fbfc','meaning':'axElement getter'},
        {'slot':'0x10149ed68','target':'0x10078fc04','meaning':'cache getter'},
        {'slot':'0x10149ed70','target':'0x10078fc50','meaning':'element initializer forwards to 0x10072187c'},
    ],
    'interpretation':'Two inherited witness requirements plus ten direct requirements; inherited AccessibilityNode identity is AXUIElement and Role is UIElementRole. UI snapshot labels/UUIDs cannot substitute for native element identity. Extensions are not all direct protocol requirements.',
    'limitations':'Six remaining direct witness names/semantics and inherited AccessibilityNode contract still need recovery before declaring the complete protocol. No empty marker protocol or Any root is substituted.',
}
node_descriptor=0x1012c9238
node_header=read_virtual(node_descriptor,24)
if node_header.hex()!='430001001cffffff300decff0400000024000000440decff':
    raise SystemExit('AccessibilityNode protocol descriptor changed')
node_signature=read_virtual(node_descriptor+24,48)
if node_signature.hex()!='800000004c26fdffc9a81c00800000004020fdffc5a81c0080000000f82bfdff2cffffff010000004620fdfff01ffdff':
    raise SystemExit('AccessibilityNode signature constraints changed')
node_flags=[0,8,8,7,7]+[0x13]*31
for index,flag in enumerate(node_flags):
    if struct.unpack('<II',read_virtual(0x1012c9280+index*8,8))!=(flag,0):
        raise SystemExit('AccessibilityNode witness requirement changed')
for slot,binding in [('0x101493b20','libswiftCore/_$ss12IdentifiableMp'),('0x101493b28','libswiftCore/_$sSTMp')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if binding not in line: raise SystemExit('AccessibilityNode inherited constraint changed')
node_targets=[0x1007aff80,0x1007affa8,0x1007affb0,0x1007affb8,0x1007affc0,0x1007affc8,
    0x10078fd5c,0x1007affd0,0x1007affd8,0x1007affe0,0x1007affec,0x1007afff8,0x1007b0004,
    0x1007b0038,0x1007b0044,0x1007b004c,0x1007b88d0,0x1007b0070,0x10078fd68,0x1007b0108,
    0x10078fd70,0x1007b0138,0x10079068c,0x10078fd7c,0x100790688,0x1007b0140,0x10078fe30,
    0x10078fe38,0x10078fe74,0x10078fe84,0x10078fe94]
node_slots=[]
for index,target in enumerate(node_targets):
    slot=0x101575698+index*8
    line=next((line for line in fixups.splitlines() if hex(slot) in line.lower()),'')
    if hex(target) not in line.lower(): raise SystemExit('AccessibilityNode concrete getter witness changed')
    node_slots.append({'slot':hex(slot),'target':hex(target),'requirementDescriptor':hex(0x1012c92a8+index*8)})
element_storage_evidence['accessibilityNodeContract']={
    'descriptor':hex(node_descriptor),'headerBytes':node_header.hex(),'signatureBytes':node_signature.hex(),
    'inherits':['Swift.Identifiable'],
    'associatedTypes':{'Role':'ComputerUseCore.AccessibilityRole','PresentationActions':'Swift.Sequence'},
    'sameTypes':{'PresentationActions.Element':'ComputerUseCore.AccessibilityPresentationAction'},
    'sameTypeNominal':'symbolic reference 0x10129b26c -> 0x1012c9200 (AccessibilityPresentationAction)',
    'witnessRequirementCount':36,
    'breakdown':{'baseConformance':1,'associatedConformance':2,'associatedType':2,'instanceGetter':31},
    'concreteElementWitnessTable':'0x101575668','concreteGetterSlots':node_slots,
    'interpretation':'UIElementProtocol inherits this entire contract. Its ten direct requirements are not the whole node interface. Identifiable supplies ID; Role and PresentationActions are separately constrained.',
    'limitations':'Getter slot addresses fixed, but not all 31 names/semantics mapped. Shared nil/false witness bodies do not uniquely identify property names. Full protocol and production conformances remain pending.',
}
node_string_sources={
    '0x1015756a0':('AXRoleDescription','0x1007c10fc'),
    '0x1015756a8':('AXTitle','0x1007803f4'),
    '0x1015756b0':('AXDescription','0x1007c10e0'),
    '0x1015756b8':('AXValue','0x1007c116c'),
    '0x1015756c0':('AXValueDescription','0x1007c10c4'),
    '0x1015756d0':('AXHelp','0x1007c108c'),
    '0x1015756d8':('AXIdentifier','0x1007c1070'),
    '0x101575738':('AXValue','0x1007c116c'),
    '0x101575740':('AXPlaceholderValue','0x1007c10a8'),
}
for entry in node_slots:
    if entry['slot'] in node_string_sources:
        attribute,reader=node_string_sources[entry['slot']]
        entry.update({'attributeSource':attribute,'reader':reader,'decodedType':'Swift.String?',
            'readPolicy':'cached partial only; throwingOnFailure:false; no uncached read'})
element_storage_evidence['accessibilityNodeCachedStrings']={
    'slots':list(node_string_sources),
    'sharedReader':'0x1007c1188 cached dictionary lookup; String decoder 0x100710b44 at 0x1007c120c; missing/failed decode -> nil',
    'titleReader':'0x1007803f4 separately performs same cache-only String decode for AXTitle',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007c1070,0x1007c1314),(0x1007803f4,0x10078051c),(0x1007aff80,0x1007affe0),(0x10078fd70,0x10078fd78)]],
    'implementationReuse':'UIElement.cachedStringValue(for:) already supplies the observed decoder/cache-only policy; do not replace with stringValue(for:) which may read uncached attributes.',
    'limitations':'Attribute source and return decoding established for nine slots; original protocol property names are not inferred merely from AX constants, especially the two distinct AXValue slots. Remaining getter mapping and protocol wiring pending.',
}
node_state_names={
    '0x1015756f0':'isSelectable', '0x1015756f8':'isFocused',
    '0x101575700':'isFocusable','0x101575710':'isDisclosable','0x101575718':'isDisclosing',
}
for entry in node_slots:
    if entry['slot'] in node_state_names: entry['meaning']=node_state_names[entry['slot']]
for slot,target in [('0x10149f848','0x1007baf90'),('0x101466228','libswiftCore/_$sSQ2eeoiySbx_xtFZTj')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if target.lower() not in line.lower(): raise SystemExit('Descriptive role comparison witness changed')
for entry in node_slots:
    if entry['slot']=='0x101575750': entry['meaning']='hasDescriptiveAttributes'
element_storage_evidence['descriptiveAttributes']={
    'entry':'AccessibilityNode.hasDescriptiveAttributes at 0x100624fec..<0x100625204',
    'orderedWitnessOffsets':['0x40','0x48','0x50','0xd8'],
    'concreteSources':['AXTitle','AXDescription','AXValue','AXPlaceholderValue'],
    'predicate':'nil or empty string continues; first nonempty string returns true; whitespace is not trimmed; later getters remain unevaluated',
    'fallback':'role witness +0x30 compared using Equatable.== to AccessibilityRole witness +0x30; UIElementRole table 0x10149f818 slot 0x10149f848 -> 0x1007baf90 loads static image',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100624fec,0x100625204),(0x1007baf90,0x1007baff8),(0x10078fd7c,0x10078fd80)]],
    'implementation':['native/macos/Sources/CuaHelper/UIElementDescriptiveAttributes.swift','native/macos/Sources/CuaHelper/UIElementCachedDescription.swift'],
    'limitations':'Concrete UIElement cached fields composed; no claim to full generic AccessibilityNode conformance or production transform/filter integration.',
}
flattened_constants=read_virtual(0x101189ce0,32)
if flattened_constants.hex()!='200000000000000000000000000000e1746578740000000000000000000000e4':
    raise SystemExit('Flattened role small-string constants changed')
if read_virtual(0x10132122c,16).hex()!='fea0f7ff0000000000000c0003000000':
    raise SystemExit('Flattened role field descriptor changed')
for address in [0x10132123c,0x101321248,0x101321254]:
    if struct.unpack('<I',read_virtual(address,4))[0]!=0:
        raise SystemExit('Flattened role fields are no longer immutable')
line=next((line for line in fixups.splitlines() if '0x10149f830' in line.lower()),'')
if '0x1007baf3c' not in line.lower(): raise SystemExit('Static text role witness changed')
for entry in node_slots:
    if entry['slot']=='0x101575770': entry['meaning']='flattenedRole'
element_storage_evidence['flattenedRole']={
    'entry':'AccessibilityNode.flattenedRole at 0x10062520c..<0x100625368',
    'role':'Read node role once, compare to AccessibilityRole witness +0x18 -> UIElementRole.staticText at 0x10149f830 -> 0x1007baf3c',
    'result':'AXStaticText -> separator space, description text, targetDescription text; all other roles nil',
    'constants':{'address':'0x101189ce0','hex':flattened_constants.hex()},
    'layout':{'nominal':'0x1012c9470','fieldDescriptor':'0x10132122c','immutableStrings':['separator','description','targetDescription'],'offsets':[0,16,32],'conformance':'Equatable'},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10062520c,0x100625368),(0x1007baf3c,0x1007baf58),(0x1000bd498,0x1000bd4a8)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementFlattenedRole.swift',
    'limitations':'Default node getter and concrete cached UIElement composition only. TransformedUIElement override and complete production rendering remain pending.',
}
if struct.unpack('<QQ',read_virtual(0x10115afb0,16))!=(3,6):
    raise SystemExit('Transformed flattened-role initializer array count changed')
element_storage_evidence['transformedFlattenedRole']={
    'getter':'0x10075dd48..<0x10075de70',
    'initializer':'0x100761364..<0x100761544',
    'roleSource':'stored transformed role at +0x20; verified role getter 0x10075cd40; not original backing element role',
    'lookup':'swift_once initializes mutable dictionary; read access, role-key lookup, copy all three strings if found, nil if empty or missing; no default-getter fallback',
    'entries':[
        {'role':'AXStaticText','separator':' ','description':'text','targetDescription':'text'},
        {'role':'AXRadioButton','separator':'; ','description':'radio button','targetDescription':'radio buttons'},
        {'role':'AXRow','separator':'; ','description':'outline row','targetDescription':'rows'},
    ],
    'arrayHeader':{'address':'0x10115afb0','count':3,'capacityAndFlags':6},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10075dd48,0x10075de70),(0x100761364,0x100761544),(0x10075cd40,0x10075cd48)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIElementFlattenedRole.swift',
    'limitations':'Mutable map initializer and lookup restored under local reconstruction names. Full transformed element storage, transform pipeline, and production rendering integration remain pending.',
}
transformed_descriptor=0x1012ccde4
transformed_header=read_virtual(transformed_descriptor,28)
if transformed_header.hex()!='5100010070f5ffff5487ecff643149ff706b05001a00000002000000':
    raise SystemExit('TransformedUIElement nominal descriptor changed')
transformed_fields_address=0x101323964
if read_virtual(transformed_fields_address,16).hex()!='f2b6f7ff0000000000000c001a000000':
    raise SystemExit('TransformedUIElement field descriptor changed')
transformed_field_specs=[
    ('element','UIElement',0x10129e6b6),('role','UIElementRole',0x10129e802),
    ('subrole','String?',0x10129eede),('roleDescription','String?',0x10129eede),
    ('title','String?',0x10129eede),('description','String?',0x10129eede),
    ('value','String?',0x10129eede),('truncationRange','NSRange?',0x10129f064),
    ('valueDescription','String?',0x10129eede),('valueTypeName','String?',0x10129eede),
    ('placeholderValue','String?',0x10129eede),('help','String?',0x10129eede),
    ('identifier','String?',0x10129eede),('url','Foundation.URL?',0x10129e8b2),
    ('domClassList','[String]?',0x10129f06c),('actionDescriptions','[UIElementActionDescription]',0x10129f076),
    ('isSelected','Bool',0x10129e60c),('isSelectable','Bool',0x10129e60c),
    ('isFocused','Bool',0x10129e60c),('isFocusable','Bool',0x10129e60c),
    ('isEnabled','Bool',0x10129e60c),('isDisclosing','Bool',0x10129e60c),
    ('isDisclosable','Bool',0x10129e60c),('isValueSettable','Bool',0x10129e60c),
    ('attributedString','NSAttributedString?',0x10129f080),('transformedString','TransformedUIString?',0x10129f09a),
]
transformed_field_records=[]
for index,(name,type_name,type_address) in enumerate(transformed_field_specs):
    address=transformed_fields_address+16+12*index
    flags,type_relative,name_relative=struct.unpack('<Iii',read_virtual(address,12))
    if flags!=2 or address+4+type_relative!=type_address:
        raise SystemExit('TransformedUIElement field mutability/type changed: '+name)
    if read_virtual(address+8+name_relative,len(name)+1)!=name.encode()+b'\0':
        raise SystemExit('TransformedUIElement field name changed: '+name)
    transformed_field_records.append({'index':index,'name':name,'type':type_name,'mutable':True,
        'record':hex(address),'typeReference':hex(type_address)})
for slot,binding in [('0x101460eb0','0x1012cd398'),('0x101460d50','0x1012cd598'),
    ('0x101462148','0x1012cbfcc'),('0x1014630f8','Foundation/_$s10Foundation3URLVMn'),
    ('0x101460e68','0x1012cd3d0'),('0x101460828','0x1012c9600')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if binding.lower() not in line.lower(): raise SystemExit('TransformedUIElement symbolic field type changed')
element_storage_evidence['transformedElementStorage']={
    'nominal':hex(transformed_descriptor),'headerBytes':transformed_header.hex(),
    'fieldDescriptor':hex(transformed_fields_address),'fieldCount':26,'fields':transformed_field_records,
    'constructors':{'fromUIElementAndContext':'0x10075c568','fromAXElementAndContext':'0x10075e040','fromAXElement':'0x10075de70'},
    'interpretation':'Struct with 26 mutable stored fields; element is concrete UIElement, not AXUIElement or Any. Role is stored independently; eight Bool fields follow actionDescriptions. NSAttributedString and TransformedUIString are distinct optional types, not plain String substitutes.',
    'limitations':'Storage/type contract recovered. Physical offsets other than separately audited role, initializer transformation semantics, TransformedUIString, full protocol conformance and production integration remain pending; no partial same-name TransformedUIElement substitute is introduced.',
}
for address,expected in [
    (0x101321390,'0aa4f7ff0000000000000c0001000000'),
    (0x1013213ac,'12a3f7ff0000000000000c0002000000'),
    (0x1013213d4,'74a4f7ff0000000002000c0002000000')]:
    if read_virtual(address,16).hex()!=expected:
        raise SystemExit('TransformedUIString field descriptor changed')
if struct.unpack('<QQ',read_virtual(0x101159560,16))!=(1,2):
    raise SystemExit('TransformedUIString empty constructor span count changed')
line=next((line for line in fixups.splitlines() if '0x101466148' in line.lower()),'')
if 'libswiftCore/_$sSKsSS7ElementRtzrlE6joined9separatorS2S_tF' not in line:
    raise SystemExit('TransformedUIString description join changed')
element_storage_evidence['transformedStringStorage']={
    'outer':{'nominal':'0x1012c9600','fields':[{'name':'stringInterpolation','type':'StringInterpolation','mutable':True}]},
    'interpolation':{'nominal':'0x1012c961c','fields':[{'name':'spans','type':'[Span]','mutable':True},{'name':'sourceOffsets','type':'[Int?]?','mutable':True}]},
    'span':{'nominal':'0x1012c9640','kind':'enum with two payload cases','cases':['string(String)','url(String, url: Foundation.URL, isImage: Bool)']},
    'constructors':{'empty':'0x10063a084 creates one string-empty span and nil offsets; not zero spans',
        'literal':'0x10063a11c creates one string span and nil offsets',
        'capacity':'0x100638c78 checks signed overflow for literalCapacity + interpolationCount, clamps negative sum to zero, reserves spans with nil offsets'},
    'description':'0x100638c74 -> 0x10063b5f8: collect first String payload from each span, join with empty separator; URL and image metadata do not regenerate text; sourceOffsets not used',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100638c74,0x100638cb0),(0x10063a084,0x10063a1c4),(0x10063b5f8,0x10063b808),(0x10063cc34,0x10063cc3c)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringSpan.swift restores enum under a local name and shared description body',
    'limitations':'Full interpolation append/merge, mapped-string offsets and source-range methods, URL shortening and renderer context remain pending. No partial same-name TransformedUIString is substituted.',
}
line=next((line for line in fixups.splitlines() if '0x101466458' in line.lower()),'')
if 'libswiftCore/_$sSS9UTF16ViewV5countSivg' not in line:
    raise SystemExit('Transformed string offset unit changed')
element_storage_evidence['transformedStringAppend']={
    'plain':'0x100639134..<0x1006394cc',
    'mapped':'0x10063a2fc -> 0x100639bec..<0x100639f08',
    'unit':'UTF16View.count via stub 0x101150af8 / GOT 0x101466458',
    'merge':'Only adjacent string/string spans coalesce; URL spans retain boundaries and metadata; empty text is not skipped',
    'plainOffsets':'nil remains nil; nonnil array receives nil entries equal to incoming span text UTF16 length',
    'mappedOffsets':'precondition incoming offsets count equals text UTF16 length before mutation; compute old description length; append text; initialize nil map with old-length nil entries; append supplied offsets unchanged',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100639134,0x1006394cc),(0x100639bec,0x100639f08)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringAppending.swift',
    'limitations':'Single-span and mapped-text mutation restored as composable helpers; interpolation-to-interpolation merging, removeLast, range lookup, and full type/production pipeline remain pending.',
}
line=next((line for line in fixups.splitlines() if '0x1014624e8' in line.lower()),'')
if 'Foundation/_$s10Foundation10NSNotFoundSivg' not in line:
    raise SystemExit('Source-range NSNotFound lookup changed')
element_storage_evidence['transformedStringSourceRange']={
    'entry':'0x10063a300 -> 0x10063bba0..<0x10063bd5c',
    'validation':'nil sourceOffsets -> nil before checks; negative location, NSNotFound or negative length -> nil; checked location+length; end greater than offsets count -> nil',
    'mapping':'compactMap nonnil offsets in the requested half-open slice; empty result -> nil; otherwise NSRange(first, last-first+1) using checked arithmetic',
    'semantics':'Does not sort, use min/max, enforce continuity, reject negative source offsets, or clamp negative resulting lengths. Range is indexed in the existing UTF16 mapping.',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10063a300,0x10063a31c),(0x10063bba0,0x10063bd5c)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringSourceRange.swift',
    'limitations':'Direct range mapping restored; substring occurrence search and prefix/suffix disambiguation remain pending, as does full transformed type integration.',
}
element_storage_evidence['transformedStringMerge']={
    'entry':'appendInterpolation(TransformedUIString) 0x100639544..<0x1006395d4; offset reconciliation 0x1006395d4..<0x100639834',
    'order':'Read old description UTF16 length; append each incoming span using ordinary append; if both incoming and resulting offsets are nil, return',
    'prefix':'If destination offsets exist, Array(prefix(oldLength)) after ordinary append; otherwise oldLength nil entries. Prefix helper 0x10064e604 uses min(count,oldLength).',
    'suffix':'Incoming offsets unchanged when nonnil; otherwise nil entries equal to new description UTF16 length minus oldLength; assign prefix + suffix',
    'semantics':'No rebasing of source coordinates; empty-but-nonnil mapping activates mapping; does not validate incoming mapping length; retains ordinary span coalescing and URL boundaries',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100639544,0x100639834),(0x10064e604,0x10064e63c)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringMerging.swift',
    'limitations':'Interpolation-to-interpolation merge restored; full type construction, removeLast, substring search, URL rendering and production wiring remain pending.',
}
element_storage_evidence['transformedStringRemoval']={
    'entry':'removeLast 0x10063a2f8 -> 0x100639834..<0x100639bec',
    'scope':'Empty spans no-op. Only final span is inspected; empty final String traps and does not scan earlier spans.',
    'mutation':'Measure last Character UTF16 length, remove one Character, replace same span case preserving URL/isImage; retain span even when its text becomes empty',
    'offsets':'After replacing span, if removed UTF16 length > 0 and offsets nonnil, remove that many mapping entries; too-short map traps; nil remains nil',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100639834,0x100639bec),(0x1006394cc,0x100639544)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringRemoval.swift',
    'limitations':'Deletion and map trimming restored as a helper; full transformed string type, substring matching, URL rendering and production integration remain pending.',
}
element_storage_evidence['transformedStringState']={
    'isEmpty':'0x10063b87c..<0x10063bb5c: zero spans true; one span tests String payload emptiness for both cases; more than one false even if all payloads empty',
    'last':'0x10063a1c8..<0x10063a2f8: final span String.last only; empty spans or empty final payload nil; does not scan earlier spans or join text',
    'mapping':'Neither getter reads sourceOffsets; URL metadata does not affect result',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10063b87c,0x10063bb5c),(0x10063a1c8,0x10063a2f8),(0x1006394cc,0x100639544)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringState.swift',
    'limitations':'Standalone getters restored; full transformed string type and production integration remain pending.',
}
element_storage_evidence['transformedStringSubstring']={
    'entry':'0x10063a31c..<0x10063a380: find contextual occurrences; require exactly one before mapping via sourceRange(forMarkdownRange:)',
    'search':'0x10063bd5c..<0x10063c0ac: bridge description to NSString; empty needle returns []; rangeOfString options 0; advance by matched location + 1 UTF16 unit, retaining overlaps',
    'context':'Optional prefix/suffix match immediately adjacent UTF16 substrings with Swift String equality; reject out-of-bounds context; empty context accepted',
    'selectors':{'0x101543da8':'length','0x101542ff8':'rangeOfString:options:range:','0x101542e20':'substringWithRange:'},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10063a31c,0x10063a380),(0x10063bd5c,0x10063c0ac)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringSubstring.swift',
    'limitations':'Contextual lookup restored as helpers; full transformed type, URL rendering and production integration remain pending.',
}
element_storage_evidence['transformedStringURLRefresh']={
    'entry':'trimURLs 0x10063aea8 branches to 0x10063ab88..<0x10063aea8',
    'iteration':'Ordered span traversal; plain String skipped; every URL invokes context shortener trim(url:isImage:) at 0x10065f7c0 through mutable context witness +0x28',
    'replacement':'nil shortener result becomes empty String; Swift String equality skips unchanged text; changed URL span retains original URL and isImage; return whether any replacement occurred',
    'mapping':'Body neither reads nor writes sourceOffsets, even when replacement text length changes',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10063ab88,0x10063aeac)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringURLRefresh.swift',
    'limitations':'Span refresh restored with explicit shortener callback; actual mutable shortener/context, Markdown link generation and production integration remain pending.',
}
element_storage_evidence['transformedStringMarkdownLink']={
    'entry':'appendMarkdownLink 0x10063a574..<0x10063ab88',
    'label':'First nonnil nonempty stringValue/title/description BEFORE trimming; replace [ with backslash+[ then ] with backslash+]; trim whitespacesAndNewlines',
    'format':'Selected label yields [label](URL-span); no selected label yields <URL-span>; no image exclamation prefix; URL interpolation calls shortener once with image classification, nil result -> empty payload',
    'mapping':'Build temporary interpolation with nil mapping, then merge into destination via ordinary span append and mapping reconciliation 0x1006395d4',
    'bindings':{'0x1014626f8':'Foundation.CharacterSet.whitespacesAndNewlines','0x1014639c0':'Foundation.trimmingCharacters(in:)','0x101469a78':'Swift StringProcessing replacing(_:with:maxReplacements:)'},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10063a574,0x10063ab88),(0x100638d40,0x100639134)]],
    'implementation':'native/macos/Sources/CuaHelper/TransformedUIStringMarkdownLink.swift',
    'limitations':'Label and span construction restored; role classification is passed as isImage, shortener is callback; full context and production integration remain pending.',
}
element_storage_evidence['urlShortenerStorage']={
    'nominal':'0x1012c9d20',
    'fields':{'descriptor':'0x101321a00','header':'7aa5f7ff0000000000000c0004000000','mutable':['configuration: Configuration','accumulated: Int','domains: [String:Int]','urls: Set<URL>']},
    'configuration':{'nominal':'0x1012c9d3c','descriptor':'0x101321a40','header':'40a5f7ff0000000000000c0004000000','mutable':['individualLimit: Int?','totalLimit: Int?','includeQuery: Bool','includeFragment: Bool']},
    'constructor':'0x10065fae0..<0x10065fb6c: stores supplied optional limits and Bool flags unchanged; releases baseHost without retaining or storing it',
    'stateOffsets':'configuration at 0; accumulated +0x20; domains +0x28; urls +0x30, confirmed by init and reset stores',
    'trimEntry':'0x10065f7c0 first inserts URL into urls, then calls 0x10065fde4 with configuration and accumulated address; returned domain, when present with rendered text, increments domains count',
    'reset':'0x1006604c8..<0x100660588: accumulated=0, clears urls and domains; configuration untouched',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10065fae0,0x10065fbfc),(0x1006604c8,0x100660588),(0x101321a00,0x101321a80)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementURLShortenerConfiguration.swift',
    'limitations':'Only configuration restored. Stateful trim core 0x10065fde4 and compaction algorithm require further audit before full shortener or rendering context integration.',
}
element_storage_evidence['urlShortenerCore']={
    'entry':'0x10065fde4..<0x1006603ec returns optional domain and optional rendered text',
    'gates':'Missing scheme, lowercased webdoc/data, or isImage -> nil pair; file URL -> absoluteString without accumulation or budget checks',
    'format':'URLComponents resolvingAgainstBaseURL=false; remove exact http/https scheme; remove www. host prefix; validate string; clear query/fragment by flags; serialize and strip leading //',
    'individual':'If index(start, offsetBy: limit+1, limitedBy:end) exists, take prefix(limit-1) and append ellipsis; Swift Character indexing and checked arithmetic',
    'total':'Count rendered String Characters; if accumulated+count > totalLimit return domain and ellipsis, increment accumulated by 1; otherwise increment by count even with nil totalLimit',
    'bindings':{'0x1014630c0':'URL.scheme','0x101462fd8':'URL.isFileURL','0x101463010':'URL.absoluteString','0x101462810':'URLComponents.init(url:resolvingAgainstBaseURL:)','0x101466370':'String.count','0x101466388':'String.index(_:offsetBy:limitedBy:)'},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10065fde4,0x1006603ec),(0x10009e2fc,0x10009e384)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementURLShortenerCore.swift',
    'limitations':'Formatting and accumulated accounting restored; enclosing URL/domain storage, compaction and production context still pending.',
}
element_storage_evidence['urlShortenerStateful']={
    'trim':'Insert URL before core call; count returned nonnil domain when text nonnil, including ellipsis; repeated calls still increment accumulated/domain count',
    'reset':'Clear accumulated, domains, urls; preserve configuration',
    'compaction':'0x10065fbfc..<0x10065fde4: set nil totalLimit to 4000; measure unique URL Set using core isImage=false and local zero counter; do not update accumulated/domains; if over total limit, compact once and repeat',
    'compactStep':'0x1006603ec..<0x1006604c8 called with (120,20,10): disable fragment first, then query; otherwise choose first candidate 120...20 by -10 strictly below existing individualLimit (nil accepts 120); no candidate -> stop',
    'return':'Last locally measured total, even when over budget and no further compaction possible',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10065f7c0,0x10065fa58),(0x10065fb6c,0x10065fde4),(0x1006603ec,0x100660588)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementURLShortener.swift',
    'limitations':'Stateful component composed and tested with URL span refresh; rendering context witness and production transformation pipeline still pending. Configuration default arguments not inferred.',
}
element_storage_evidence['urlRenderingPass']={
    'contextStorage':{'nominal':'0x1012ccd8c','descriptor':'0x1013238b0','header':'9cb6f7ff0000000000000c0006000000','mutable':['type','isCatalyst','isWebShaped','isChromium','windowFrame','urlShortener']},
    'entry':'UIElementTransformationContext.shortenURLsIfNeeded 0x1007587b4..<0x100758848',
    'success':'Reset context shortener at +0x30; call body once; compactConfigurationIfNeeded; checked-add measured total to caller totalLength; reset shortener; return original body result',
    'error':'Body throw jumps to return before compaction/add/reset; preserve mutations performed by body; no defer cleanup or automatic second render',
    'witness':'AccessibilityRenderingContext table 0x101574b78 getter/setter/modify at +0x18/+0x20/+0x28 address context shortener +0x30; final getter +0x30 reads context type byte',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007587b4,0x100758878),(0x1013238b0,0x101323908)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementURLRenderingPass.swift',
    'limitations':'Generic key-path helper preserves full caller context; original complete context constructors, role protocol and production rendering pipeline are not yet restored.',
}
element_storage_evidence['contextType']={
    'nominal':'0x1012c9590','descriptor':'0x10132134c','header':'50a3f7ff0000000002000c0003000000',
    'cases':['fullUIContext','eventStreamContext','informationalContext'],
    'allCases':'Static array 0x10156b800 count=3 capacity word=6, payload bytes 00 01 02',
    'includesMenuBar':'0x100638a74 tag != 2',
    'includesActionDescriptions':'0x10048177c tag == 0',
    'infersInteractionCapabilitiesFromCachedState':'0x100638a84 tag == 1',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100638a74,0x100638ac0),(0x10048177c,0x100481788),(0x10132134c,0x101321380),(0x10156b800,0x10156b823)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementContextType.swift',
    'limitations':'Enum and mode properties restored; downstream observation/render consumers still pending.',
}
element_storage_evidence['chromiumWindowProbe']={
    'entry':'0x100758cb4..<0x100758e90',
    'read':'Raw AXChildren arrayValue index=0 maxValues=1 countIfKnown=nil; decode optional array; missing/failed/empty -> false',
    'probe':'Only first child supportedAttributes contains chromeNodeID; no recursive search or role predicate',
    'constant':'0x10079c8e0..<0x10079c91c materializes ChromeAXNodeId',
    'contextGate':'Context initializer calls this window probe only when its second application web-shaped check succeeds and a window exists',
    'applicationEvidence':'0x10071e484..<0x10071e608 resolves pid -> running app -> bundle, then supportsHTTPScheme || isElectronApp || isChromiumApp; resolution errors -> false; individual bundle predicates still pending audit',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x100758cb4,0x100758e90),(0x10079c8e0,0x10079c91c),(0x10071e484,0x10071e608)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementChromiumWindow.swift',
    'limitations':'Window probe is a dependency-injected helper. Original raw array decoding and full application/context composition not wired here.',
}
element_storage_evidence['bundleWebClassification']={
    'http':'0x1002561f0..<0x10025644c: objectForInfoDictionaryKey CFBundleURLTypes cast as [[String:Any]], each CFBundleURLSchemes cast as [String], contains exact http; no lowercasing or https alternative',
    'types':{'0x1012939dc':'SaySDySSypGG = [[String:Any]]','0x1012939ea':'SaySSG = [String]'},
    'electron':'0x100256494..<0x1002565d0: NSPrincipalClass as? String == AtomApplication',
    'chromium':'0x1002565d0..<0x100256708: NSPrincipalClass as? String == BrowserCrApplication',
    'composition':'Application classifier short circuits HTTP, Electron, Chromium in that order',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x1002561f0,0x10025644c),(0x100256494,0x100256708),(0x100256a00,0x100256a54)]],
    'implementation':'native/macos/Sources/CuaHelper/BundleWebClassification.swift',
    'limitations':'Bundle predicates and combination restored. AX PID/running-app resolution and full context constructor integration still pending.',
}
element_storage_evidence['applicationWebShape']={
    'entry':'0x10071e484..<0x10071e608',
    'resolution':'Throwing AX PID query caught -> false; NSRunningApplication(processIdentifier:) then bundleURL then Bundle(url:); missing at any step -> false',
    'selectors':{'0x101542c18':'runningApplicationWithProcessIdentifier:','0x1015421e8':'bundleURL','0x101542ad0':'initWithURL:'},
    'evaluation':'supportsHTTPScheme || isElectronApp || isChromiumApp, preserving lazy order and repeated invocations; no bundle-ID fallback or app launch',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x10071e484,0x10071e608)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementApplicationWebShape.swift',
    'limitations':'Concrete adapter composes direct OS PID read; original MockProvider PID dispatch remains absent. Full transformation context and production observation integration pending.',
}
element_storage_evidence['applicationCatalyst']={
    'entry':'ApplicationUIElement.isCatalystApp 0x100715974..<0x100715d4c',
    'attribute':'_AXExhibitsMacCatalystBehavior, initializer 0x10079cab8..<0x10079caec',
    'evaluation':'Cached lenient Bool, including false, wins; missing/malformed cache falls back to known-unsupported gate then provider value read and strict Bool decode. Missing -> false; thrown read/decode reported once -> false.',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x100715974,0x100715d4c),(0x10079cab8,0x10079caec)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementCatalyst.swift',
    'limitations':'Composed on concrete UIElement with injected provider read; ApplicationUIElement wrapper and full context constructor remain pending.',
}
element_storage_evidence['transformationContextConstruction']={
    'entry':'0x100758398..<0x10075875c',
    'storage':'Six mutable fields: type, isCatalyst, isWebShaped, isChromium, windowFrame, urlShortener; descriptor 0x1013238b0',
    'order':'Application present: Catalyst once, web-shaped twice. First web result stored; second gates optional window Chrome-node probe. Window frame read independently of application presence or web shape.',
    'urlDefault':'Absent configuration -> individualLimit=nil,totalLimit=nil,includeQuery=true,includeFragment=true; supplied configuration preserved; new shortener initialized',
    'frameEvidence':'0x1007575ac..<0x100757a50 first tries frame attribute with cached/fresh typed reading; absent result enters position then size fallback at 0x10075791c. Concrete dependency implementation remains pending.',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x100758398,0x10075875c),(0x1007575ac,0x100757a50)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementTransformationContext.swift',
    'limitations':'Full field storage and constructor branches restored using explicit application/window getter dependencies. Native wrappers, rendering protocol conformance, frame provider and production observation wiring remain incomplete.',
}
element_storage_evidence['windowFrame']={
    'entry':'Window frame specialization 0x1007575ac..<0x100757a50',
    'attribute':'AXFrame, initializer 0x10079c218..<0x10079c248',
    'decode':'CGRect specialization 0x100712830..<0x100712f00; CF type dispatch before ordinary cast, AXValue unpack then CGRect cast before AXError handling',
    'fallback':'Valid cached CGRect wins; otherwise support gate and fresh strict read. Missing/failed frame -> position; missing position skips size; otherwise size and CGRect(origin:size:). No positivity validation or retry.',
    'position':'Window specialization 0x10079d594 -> shared body 0x10079d5c4 references UIElementAttribute.position at 0x10079d650',
    'size':'Window specialization 0x10079da24 references UIElementAttribute.size at 0x10079daa0',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x1007575ac,0x100757a50),(0x100712830,0x100712f00),(0x10079c218,0x10079c248)]],
    'implementation':['native/macos/Sources/CuaHelper/AXRectDecoding.swift','native/macos/Sources/CuaHelper/UIElementFrame.swift'],
    'limitations':'Concrete UIElement composition uses injected provider read and typed position/size getters. Those getter implementations, WindowUIElement wrapper and production observation wiring remain pending.',
}
element_storage_evidence['positionSize']={
    'position':'Window entry 0x10079d594, shared reader 0x10079d5c4..<0x10079da00; CGPoint decoder 0x100712814 -> 0x100712178',
    'size':'Window reader 0x10079da24..<0x10079de18; CGSize decoder 0x10071215c -> 0x100712178',
    'attributes':{'position':'AXPosition, initializer 0x100799170','size':'AXSize, initializer 0x100799200'},
    'toleratedStatusData':{'position':'0x101571610: -25212, -25205','size':'0x101571640: -25212, -25205'},
    'evaluation':'Cached lenient typed decode wins; otherwise known-unsupported gate then fresh strict read. Invalid or failed fresh values log once and return nil. No coordinate normalization or geometry-type reinterpretation.',
    'composition':'UIElement.frameValue(readAttribute:reportError:) composes AXFrame then position and size against the same cache and provider.',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x10079d594,0x10079da00),(0x10079da24,0x10079de18),(0x10071215c,0x100712830),(0x100799170,0x1007991a4),(0x100799200,0x10079922c)]],
    'implementation':['native/macos/Sources/CuaHelper/AXPointDecoding.swift','native/macos/Sources/CuaHelper/AXSizeDecoding.swift','native/macos/Sources/CuaHelper/UIElementGeometry.swift'],
    'limitations':'Provider remains injected; native wrapper types and production observation integration remain incomplete.',
}
element_storage_evidence['singleAttributeSystemIntegration']={
    'entry':'AXUIElementRef.value(for:) 0x1006f5f88..<0x1006f629c',
    'systemWrapping':'0x1006f61f8..<0x1006f6268 preserves status, wraps non-nil raw object with both descriptors absent; nil output remains nil independently of status',
    'descriptorConstant':'0x101159da0: 00000000000000000100000000000000; system present-value descriptor nil representation',
    'production':'WindowSelection.axElementFrame now constructs the recovered system UIElement cache and calls systemFrameValue, preferring AXFrame before position/size.',
    'consumerBoundary':'Existing finite/positive geometry check retained for capture/input consumers; not claimed as original frame-getter behavior.',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x1006f5f88,0x1006f629c)]],
    'implementation':['native/macos/Sources/CuaHelper/AXSingleAttributeReading.swift','native/macos/Sources/CuaHelper/WindowSelection.swift'],
    'limitations':'System path integrated; original TaskLocal MockProvider and transaction acquisition absent. Native live acceptance remains unverified because required macOS permissions are not granted.',
}
element_storage_evidence['cachedTextProduction']={
    'sharedGetter':'0x1007ab5dc..<0x1007ab724, cache witness then lenient String specialization 0x100710b44; no uncached fallback',
    'entries':{'title':'0x1007ab72c','description':'0x1007ab750','value':'0x1007ab774','valueDescription':'0x1007ab798'},
    'semantics':'Cached String optional preserved, including empty/whitespace. Missing or decoding error -> nil. No numeric stringification.',
    'production':'Target.collect constructs one system UIElement per node and shares its cache for role, subrole, title, description and frame. Secure-subrole export guard retained.',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()} for a,b in [(0x1007ab5dc,0x1007ab7bc)]],
    'implementation':['native/macos/Sources/CuaHelper/UIElementCachedText.swift','native/macos/Sources/CuaHelper/main.swift','native/macos/Sources/CuaHelper/WindowSelection.swift'],
    'limitations':'Collector value/scalar properties and child traversal still use older paths; full transformation rendering and transaction-prefetched observation remain incomplete.',
}
element_storage_evidence['selectionCapability']={
    'slot':'0x1015756f0 -> 0x1007afff8 -> 0x10078ec70',
    'generic':'UIElementProtocol.isSelectable at 0x1007abdfc..<0x1007abf94',
    'roleGate':'read role once; menuItem or menuBarItem -> false without support/settable queries',
    'otherwise':'isAttributeSupportedAndSettable(AXSelected); not the current AXSelected value',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10078ec70,0x10078ee4c),(0x1007abdfc,0x1007abf94),(0x1007b0004,0x1007b0038)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementSelectionCapability.swift',
    'limitations':'Role-gated capability helper restored; support/settable callback remains explicit. Focusability has additional role/error branches and is not collapsed to the same helper. Full node protocol pending.',
}
for entry in node_slots:
    if entry['slot']=='0x101575708': entry['meaning']='isEnabled'
element_storage_evidence['focusCapability']={
    'entry':'UIElementProtocol.isFocusable at 0x1007abfbc..<0x1007ac238',
    'gate':'isAttributeSupported(AXFocused) first; false skips role and settable reads',
    'role':'role read once after support; textArea, textField and dateTimeArea use special throwing query branch',
    'fallback':'successful settable Bool returned unchanged, including false; only a thrown query falls back to isEnabled for the three special roles',
    'otherRoles':'isAttributeSettable wrapper returns false on query error; no isEnabled lookup',
    'enabledWitness':'error branch 0x1007ac140 reads inherited witness +0xa0 -> concrete table 0x101575708 -> 0x1007b0044 -> 0x1007902dc',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007abfbc,0x1007ac238)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementFocusCapability.swift',
    'limitations':'Original protocol support/role/settable/enabled boundaries remain explicit. Concrete protocol conformance and production observation wiring pending.',
}
element_storage_evidence['cachedEnabled']={
    'generic':'UIElementProtocol.isEnabled at 0x1007ac240..<0x1007ac394',
    'concrete':'0x1007902dc..<0x100790408',
    'source':'cache.attributes[AXEnabled] only; no fresh AX read or support gate',
    'decode':'Bool specialization 0x10070fc2c, throwingOnFailure false',
    'default':'Missing partial, decoder nil or caught error -> true; decoded false remains false',
    'optionalCollapse':'generic 0x1007ac340 and concrete 0x1007903d8 compare optional Bool tag with 2, OR equality into result then mask bit 0',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007ac240,0x1007ac394),(0x1007902dc,0x100790408)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementEnabled.swift',
    'limitations':'Concrete cached getter and focus-capability composition restored. Full AccessibilityNode protocol and production observation integration remain pending; enabled is not an app policy or permission decision.',
}
element_storage_evidence['attributeSupport']={
    'symbol':'UIElementProtocol.attributeIsKnownUnsupported',
    'start':'0x1007b0854','endExclusive':'0x1007b0958',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x1007b0854,0x104)).hexdigest(),
    'cacheWitnessOffset':'0x28',
    'membershipThunk':['0x1007209a4','0x100716c64','0x100716c68'],
    'branches':[
        'Read cache.transactionAttributes first. If nonnil and missing target, return false without reading supportedAttributes.',
        'If transactionAttributes is nil, read cache again; empty supportedAttributes returns false (unknown).',
        'Otherwise read cache again and return NOT supportedAttributes.contains(target).',
    ],
    'interpretation':'Missing data is not sufficient evidence that an attribute is unsupported. Preserve nil versus empty transaction set and repeated lazy cache getter calls.',
    'limitations':'Recovered helper and concrete UIElement extension only; full protocol, decoder dispatch and production collector integration remain pending.',
}
# Concrete witness specialization and generic subrole extension converge on
# the same cached attribute and decoder; this is not an uncached AX read.
subrole_fixup=next((line for line in fixups.splitlines() if '0x10149ed78' in line.lower()),'')
if '0x1007aff6c' not in subrole_fixup.lower():
    raise SystemExit('UIElement subrole witness target changed')
element_storage_evidence['protocolContract']['confirmedElementWitnesses'].append({
    'slot':'0x10149ed78','target':'0x1007aff6c',
    'meaning':'subrole getter: cached AXSubrole decoded as optional String, failure returns nil',
})
element_storage_evidence['protocolContract']['limitations']='Five remaining direct witness names/semantics and inherited AccessibilityNode contract still need recovery before declaring the complete protocol. No empty marker protocol or Any root is substituted.'
element_storage_evidence['cachedSubrole']={
    'witness':'0x1007aff6c','specialization':'0x1007289b0',
    'extension':'0x1007a8690','sharedCachedStringGetter':'0x1007ab5dc',
    'attributeStorage':'0x1015ca8e8','attribute':'AXSubrole',
    'decoder':'0x100710b44','throwingOnFailure':False,
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
              for a,b in [(0x1007aff6c,0x1007aff74),(0x1007289b0,0x100728ae0),(0x1007a8690,0x1007a86ac),(0x1007ab5dc,0x1007ab714)]],
    'branches':[
        'Concrete witness loads cache.attributes from element offset 0x10; generic extension obtains cache through witness offset 0x28.',
        'Empty dictionary or missing AXSubrole returns nil; neither path invokes an AX read.',
        'Present entry passes its encoded AnyObject to specialized decoder 0x100710b44 with throwingOnFailure=false; decoder errors are swallowed and return nil.',
        'String decoder still performs CF type dispatch before conversion; ordinary String casting alone is not a faithful replacement.',
    ],
    'limitations':'Decoder specialization remains unimplemented; do not wire a plain as? String substitute or trigger fresh AX reads from this cached getter.',
}
string_binding=next((line for line in fixups.splitlines() if '0x1014664b8' in line.lower()),'')
if 'libswiftCore/_$sSSN' not in string_binding:
    raise SystemExit('Specialized AX decoder target is no longer Swift.String')
element_storage_evidence['cachedSubrole']['limitations']='String specialization and cached concrete subrole are implemented; full generic decoder, UIElementProtocol and production collector integration remain pending.'
element_storage_evidence['stringDecoder']={
    'start':'0x100710b44','endExclusive':'0x1007111c8',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x100710b44,0x684)).hexdigest(),
    'targetMetadata':'0x1014664b8 = libswiftCore/_$sSSN',
    'dispatchOrder':['AXUIElement','AXTextMarker','AXTextMarkerRange','AXValue','CFArray','ordinary object'],
    'branches':[
        'String cannot conform to UIElementProtocol or be an AXUIElement class; element target mismatch returns nil or failedToUnwrapAttributeValue(String).',
        'Marker and marker-range wrappers cannot convert to String; preserve nil versus throwing policy.',
        'AXValue unpacks via 0x1006ea098 before requested-type cast and AXError handling. noValue becomes nil; other AX errors honor throwingOnFailure.',
        'CFArray target rejection is unexpectedAttributeValueType(expected: [Any], actual: String).',
        'Ordinary objects use Foundation dynamic cast to String, with no description/stringification fallback.',
    ],
    'implementation':'native/macos/Sources/CuaHelper/AXStringDecoding.swift',
    'limitations':'Concrete String specialization only. Original executable was not run; static branch evidence plus local Swift boundary tests.',
}
element_storage_evidence['cachedValueLookup']={
    'rawLookup':'0x1007af0d0','typedLookup':'0x1007aeea4','partialDecoder':'0x1006fac18',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007af0d0,0x1007af1e0),(0x1007aeea4,0x1007af014)]],
    'branches':[
        'Read cache once via witness offset 0x28, then dictionary lookup. Empty/missing key returns nil without decoding.',
        'Copy the complete 56-byte AXPartialValue including both descriptors; typed lookup calls AXPartialValue.decoded.',
        'Preserve Optional<Value> nesting: a decoded some(nil) for an Optional target remains a hit, while decoder none allows the outer value(for:) fallback.',
    ],
    'implementation':'native/macos/Sources/CuaHelper/UIElementCachedValue.swift',
    'limitations':'Generic decoder is an explicit dependency; concrete String decoder is connected. Full generic decoder and production observation integration remain incomplete.',
}
if struct.unpack('<ii',read_virtual(0x101570d18,8)) != (-25212,-25205):
    raise SystemExit('Uncached attribute tolerated status constants changed')
element_storage_evidence['uncachedValueRead']={
    'start':'0x1007ad658','endExclusive':'0x1007ad938',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x1007ad658,0x2e0)).hexdigest(),
    'supportGate':'0x1007ad69c -> 0x1007b0854',
    'elementGetterWitnessOffset':'0x20','read':'0x1007ad6e4 -> 0x1006f5f88',
    'toleratedStatusStorage':'0x101570d18','toleratedStatuses':[0,-25212,-25205],
    'lenientDecode':'0x1007ad7e0 -> 0x1006fac18',
    'strictDecode':'0x1007ad884 -> 0x1006fac24',
    'interpretation':'Known-unsupported exits before AX reference acquisition/read. Reject other status codes before examining optional data. On tolerated status, absent data returns nil; present data chooses nonthrowing decode when ignoringTypeMismatch, otherwise throwing decode. Preserve descriptors.',
    'limitations':'Provider read and generic partial decoders remain explicit dependencies. Outer catch and concrete String composition are restored; logger backend and production integration remain separate.',
}
element_storage_evidence['uncachedValueErrorBoundary']={
    'start':'0x1007ae414','endExclusive':'0x1007ae5f8',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x1007ae414,0x1e4)).hexdigest(),
    'throwingReadCall':'0x1007ae4a0','errorBranch':'0x1007ae4a4',
    'logger':'0x1007ae4b0 -> 0x100622d48',
    'logCall':'0x1007ae54c','nilResult':'0x1007ae5bc..0x1007ae5d8',
    'interpretation':'Success returns directly. Errors enter the logger path then return nil; reporting does not retry reading or decoding.',
    'limitations':'reportError is an explicit logger dependency, not a claim that original OS log category, level and formatting are restored.',
}
element_storage_evidence['cachedRole']={
    'getter':'0x1007a80f0','endExclusive':'0x1007a8298',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x1007a80f0,0x1a8)).hexdigest(),
    'attribute':'AXRole','attributeStorage':'0x1015ca8e0',
    'decoderCall':'0x1007a819c -> 0x100710b44',
    'fallback':'AXUnknown','fallbackInitializer':'0x1007b9798',
    'fallbackInitializerSha256':hashlib.sha256(read_virtual(0x1007b9798,0x34)).hexdigest(),
    'interpretation':'Read cache once; decode cached AXRole as String with throwing disabled. Non-nil string bridges into UIElementRole; missing/failed decoding uses AXUnknown. Empty and custom strings are not replaced. No uncached read or static role witness lookup.',
    'limitations':'Concrete UIElement getter restored; full role catalog, presentation mapping and production tree integration remain pending.',
}
for slot,target in [('0x10149ed88','0x1007925f4'),('0x10149ed90','0x100792600')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if target not in line.lower(): raise SystemExit('UIElement action witness changed')
element_storage_evidence['protocolContract']['confirmedElementWitnesses'].extend([
    {'slot':'0x10149ed88','target':'0x1007925f4','meaning':'actions getter specialization calls 0x100790b88'},
    {'slot':'0x10149ed90','target':'0x100792600','meaning':'action-description getter specialization maps the composed action list'},
])
element_storage_evidence['protocolContract']['limitations']='Three remaining direct witness semantics and inherited AccessibilityNode contract still need recovery; complete action descriptor mapping is not implemented.'
for slot,target,meaning in [
    ('0x10149ed80','0x1007aff74','isInsideWebView getter specialization -> 0x1007aaf9c; generic getter 0x1007ab2c4'),
    ('0x10149ed98','0x1007b8a04','setValue(_:forAttribute:) throws; witness +0x58 -> 0x1007ad94c'),
    ('0x10149eda0','0x100792670','perform(action:) throws; witness +0x60 -> 0x1007343b8'),
]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if target not in line.lower(): raise SystemExit('UIElement remaining direct witness changed')
    element_storage_evidence['protocolContract']['confirmedElementWitnesses'].append({
        'slot':slot,'target':target,'meaning':meaning})
element_storage_evidence['protocolContract']['limitations']='All ten direct witness meanings identified; inherited AccessibilityNode contract, complete conformer implementations, provider/TaskLocal and production integration remain incomplete. No partial same-name protocol is substituted.'
line=next((line for line in fixups.splitlines() if '0x101466488' in line.lower()),'')
if 'libswiftCore/_$sSS9hasPrefixySbSSF' not in line:
    raise SystemExit('Web-view bundle identifier predicate changed')
element_storage_evidence['insideWebViewContract']={
    'witness':'0x10149ed80 -> 0x1007aff74 -> 0x1007aaf9c',
    'genericGetter':'0x1007ab2c4',
    'ancestors':'parentChain(maxDepth:300, includingSelf:true); first AXWebArea role returns true',
    'fallback':'when no web-area ancestor matches, original element bundleIdentifier must have prefix com.openai.atlas; nil returns false',
    'stringPredicate':{'stub':'0x101150b34','got':'0x101466488','binding':'libswiftCore/_$sSS9hasPrefixySbSSF'},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007aff74,0x1007aff80),(0x1007aaf9c,0x1007ab2c4),(0x1007ab2c4,0x1007ab548),(0x1007b8a04,0x1007b8a18),(0x100792670,0x10079268c)]],
    'implementation':['native/macos/Sources/CuaHelper/UIElementInsideWebView.swift','native/macos/Sources/CuaHelper/UIElementWebViewValue.swift'],
    'limitsAndOrder':'Self at depth zero; inclusive depth 300; parent lookahead before role check; stop at first WebArea; no cycle deduplication. Bundle lookup runs once on the original element only after no match.',
    'limitations':'Generic traversal and concrete cache/parent composition restored. Bundle identifier/provider remain injected; inherited AccessibilityNode and production integration pending. Prefix semantics are not an app-policy allowlist or permission grant.',
}
element_storage_evidence['actionWitnesses']={
    'actions':'0x100790b88','nativeActionsCall':'0x100790bf4 -> 0x1006f93a0',
    'supplementalActionsCall':'0x100790d70 -> 0x100793f94',
    'arrayCombination':'0x100790d7c -> 0x10076d304',
    'descriptionWitness':'0x100792600','descriptionMap':'0x100790690',
    'descriptionCallback':'0x1007975a8 -> 0x10079716c',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007925f4,0x100792670),(0x100793f94,0x1007941e0)]],
    'disclosurePolicy':[
        'Check AXDisclosing support against cached supported attributes when transactionAttributes is nil or includes the key; otherwise enumerate fresh supported attributes.',
        'Only if supported, call isAttributeSettable; false or error yields no supplemental disclosure action.',
        'Decode cached AXDisclosing with Bool specialization 0x10070fc2c; true selects collapse, false or missing selects expand.',
    ],
    'interpretation':'Action witnesses are not raw AX action-name lists. The successful native action read is combined with computed disclosure actions before description mapping.',
    'limitations':'Bool decoder, action constants, supplemental selection, array composition and description policy are restored. Original provider dispatch and full production action/description integration remain pending.',
}
bool_binding=next((line for line in fixups.splitlines() if '0x101466880' in line.lower()),'')
if 'libswiftCore/_$sSbN' not in bool_binding: raise SystemExit('Bool specialization target changed')
element_storage_evidence['boolDecoder']={
    'start':'0x10070fc2c','endExclusive':'0x1007102c8',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x10070fc2c,0x69c)).hexdigest(),
    'targetMetadata':'0x101466880 = libswiftCore/_$sSbN',
    'dispatchOrder':['AXUIElement','AXTextMarker','AXTextMarkerRange','AXValue','CFArray','ordinary object'],
    'ordinaryCast':'0x10070ffe0','optionalNilTag':2,
    'interpretation':'Concrete Bool specialization retains CF dispatch, AXValue error interpretation and Foundation conditional Bool conversion. Do not replace dynamic casting with NSNumber.boolValue or string truthiness.',
    'implementation':'native/macos/Sources/CuaHelper/AXBoolDecoding.swift',
    'limitations':'Decoder restored and reused by disclosure state and action selection. Full provider/protocol dispatch and production synthetic action integration remain pending.',
}
element_storage_evidence['actionArrayComposition']={
    'start':'0x10076d304','endExclusive':'0x10076d3f4',
    'machineCodeSha256':hashlib.sha256(read_virtual(0x10076d304,0xf0)).hexdigest(),
    'elementMetadata':'0x10149ef08 = UIElementAction','elementStride':16,
    'copyCall':'0x10076d37c -> swift_arrayInitWithCopy',
    'caller':'0x100790d5c saves native array; 0x100790d70 computes supplemental; 0x100790d7c appends',
    'semantics':'Append supplemental after native actions, preserve order and duplicates at this boundary; native failure reports error and skips supplemental computation.',
    'implementation':'native/macos/Sources/CuaHelper/UIElementActions.swift',
    'limitations':'Original native action reader includes separate conversion/uniquing and provider dispatch; these are not replaced by array concatenation. Original logging category/format and production action-description wiring remain pending.',
}
action_array_class=next((line for line in fixups.splitlines() if '0x10151ef98' in line.lower()),'')
if '_OBJC_CLASS_$_NSArray' not in action_array_class: raise SystemExit('Action-name array class changed')
element_storage_evidence['systemActionReader']={
    'copyCall':'0x1006f94a8 -> AXUIElementCopyActionNames',
    'statusGate':'0x1006f94ac: only success continues; other statuses throw UIElementError.axError',
    'arrayClass':'0x10151ef98 = NSArray','elementType':'0x1014664b8 = Swift.String',
    'uniquedIterator':'0x1006f9694 -> Algorithms.UniquedSequence.Iterator.init',
    'identityProjection':'0x1006fb4d8..0x1006fb4e4 copies String words and retains its object',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1006f949c,0x1006f9590),(0x1006f95e4,0x1006f97ec),(0x1006fb4d8,0x1006fb4e4)]],
    'implementation':'native/macos/Sources/CuaHelper/AXActionReading.swift',
    'dependency':'swift-algorithms 1.2.1 selected and pinned; original linked version is not established',
    'limitations':'System branch only; original TaskLocal MockProvider selection and complete production action wiring remain pending.',
}
description_class=next((line for line in fixups.splitlines() if '0x10151efe8' in line.lower()),'')
if '_OBJC_CLASS_$_NSString' not in description_class: raise SystemExit('Action-description string class changed')
element_storage_evidence['systemActionDescriptionReader']={
    'copyCall':'0x1006f9924 -> AXUIElementCopyActionDescription',
    'statusGate':'0x1006f9934: only success continues; all other statuses throw UIElementError.axError',
    'stringClass':'0x10151efe8 = NSString',
    'nilGate':'0x1006f997c; nil output remains nil, empty string remains present',
    'block':{'start':'0x1006f9904','endExclusive':'0x1006f99e4',
        'machineCodeSha256':hashlib.sha256(read_virtual(0x1006f9904,0x1006f99e4-0x1006f9904)).hexdigest()},
    'implementation':'native/macos/Sources/CuaHelper/AXActionDescriptionReading.swift',
    'limitations':'System branch and custom description policy are restored separately. TaskLocal MockProvider dispatch and production descriptor wiring remain pending. Typed CFString output follows the system API contract.',
}
action_description_imports={
    '0x101466488':'hasPrefix', '0x101463988':'scanString',
    '0x101463990':'scanUpToString', '0x10151f068':'NSScanner',
}
for address,symbol in action_description_imports.items():
    line=next((line for line in fixups.splitlines() if address in line.lower()),'')
    if symbol not in line: raise SystemExit('Action description dependency changed: '+symbol)
if read_virtual(0x101367513,16)!=b'initWithString:\0': raise SystemExit('Scanner initializer changed')
element_storage_evidence['customActionDescriptions']={
    'orderedCases':['Press','Pick','Increment','Decrement','Confirm','Cancel','Show Default UI',
        'Show Alternate UI','Raise','Show Menu','Scroll to Visible','Scroll Left','Scroll Right',
        'Scroll Up','Scroll Down','Delete','Expand','Collapse'],
    'imports':action_description_imports,
    'scanner':'Name: prefix gate -> Scanner(string:) -> scanString(Name:) -> scanUpToString(newline); default whitespace settings',
    'precedence':'mutable static comparison in source order; custom first, native next, name fallback only for nil or logged error',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100794cec,0x1007953b4),(0x1007953b4,0x100795494),(0x100793768,0x100793c0c),(0x10079716c,0x10079720c)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementActionDescription.swift',
    'limitations':'Description policy restored with injected provider/error reporting; original role-aware logger, provider dispatch and production state integration remain pending.',
}
description_fields=relative_address(0x1012cd3d0+16)
_,_,description_kind,description_record_size,description_count=struct.unpack('<iiHHI',read_virtual(description_fields,16))
if (description_kind,description_record_size,description_count)!=(0,12,2): raise SystemExit('Action description field layout changed')
for index,name in enumerate(['action','description']):
    record=description_fields+16+12*index
    if struct.unpack('<I',read_virtual(record,4))[0]!=0: raise SystemExit('Action description field mutability changed')
    if read_virtual(relative_address(record+8),len(name)+1)!=name.encode()+b'\0': raise SystemExit('Action description field name changed')
description_action_type=relative_address(description_fields+20)
if read_virtual(description_action_type,1)!=b'\x02' or relative_address(description_action_type+1)!=0x101460d90:
    raise SystemExit('Action description action type changed')
if '0x1012cd3b4' not in next((line.lower() for line in fixups.splitlines() if '0x101460d90' in line.lower()),''):
    raise SystemExit('Action description action type target changed')
if read_virtual(relative_address(description_fields+32),3)!=b'SS\0': raise SystemExit('Action description text type changed')
element_storage_evidence['actionDescriptionList']={
    'descriptor':'0x1012cd3d0','fields':['let action: UIElementAction','let description: Swift.String'],
    'getter':'0x10079258c reads actions witness at +0x48 once; 0x1007925b4 maps result',
    'map':'0x100790690..0x1007907c8 reads each 16-byte action and appends one 32-byte description in original order',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100790690,0x1007907c8),(0x100792570,0x1007925dc)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementActionDescription.swift',
    'limitations':'Typed descriptions and ordered composition restored; production UIElementProtocol dispatch and page-state integration remain pending.',
}
element_storage_evidence['systemAttributeSettable']={
    'call':'0x1006f7444 -> AXUIElementIsAttributeSettable',
    'initialOutput':'0x1006f7434 writes zero byte',
    'status':'0x1006f7448 only success continues; non-success throws UIElementError.axError',
    'bool':'0x1006f7484..0x1006f748c converts nonzero output byte to true',
    'block':{'start':'0x1006f7434','endExclusive':'0x1006f7490',
        'machineCodeSha256':hashlib.sha256(read_virtual(0x1006f7434,0x1006f7490-0x1006f7434)).hexdigest()},
    'implementation':'native/macos/Sources/CuaHelper/AXAttributeSettable.swift',
    'productionUse':'Target.action setValue uses this system adapter; existing caller rejection policy retained',
    'limitations':'Original preceding TaskLocal MockProvider selection and full disclosure-action wiring remain pending.',
}
if struct.unpack('<ii',read_virtual(0x101570e00,8))!=(-25204,-25205):
    raise SystemExit('Native tolerated action errors changed')
element_storage_evidence['systemActionPerforming']={
    'call':'0x1006f9bb8 -> AXUIElementPerformAction',
    'toleratedErrors':{'address':'0x101570e00','rawValues':[-25204,-25205],
        'names':['cannotComplete','attributeUnsupported']},
    'status':'success and two tolerated errors return; other errors throw UIElementError.axError; no retry',
    'thread':'0x1006f9b6c..0x1006f9b9c resolves PID and checks current main thread before direct call or synchronous main-queue closure',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1006f9b38,0x1006f9cd0),(0x100791d78,0x100791e14),(0x1007b0148,0x1007b0214)]],
    'disclosureFinding':'both expand and collapse enter toggleDisclosure at 0x100791e0c; toggle uses protocol getters then negates current Bool and writes AXDisclosing',
    'implementation':'native/macos/Sources/CuaHelper/AXActionPerforming.swift',
    'limitations':'Explicit system adapter only; not yet wired into production action outcome mapping. Post-menu dispatch and disclosure getter helpers are restored separately; concrete parent-chain traversal, protocol integration and MockProvider dispatch remain incomplete; menu preparation and scrollbar composition are restored separately.',
}
element_storage_evidence['systemArrayCount']={
    'entry':'AXUIElement.arrayCount(for:) 0x1006f6688..<0x1006f6930',
    'provider':'TaskLocal provider branch calls witness +0x30 at 0x1006f6744 before system path; not implemented by system-only adapter',
    'system':'out-count initialized to zero at 0x1006f6790; AXUIElementGetAttributeValueCount at 0x1006f6820; status and out-count both returned without filtering',
    'thread':'0x1006f67cc..0x1006f67fc checks current PID, optional target PID and main thread; same-process off-main uses synchronous main queue, other cases direct',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1006f6688,0x1006f6930)]],
    'implementation':'native/macos/Sources/CuaHelper/AXArrayCount.swift',
    'limitations':'Explicit system-only adapter; TaskLocal provider selection and original PID failure logging remain pending. No live AX acceptance.',
}
element_storage_evidence['elementArrayCount']={
    'entry':'0x1007b06a0..<0x1007b0828',
    'support':'attributeIsKnownUnsupported checked before cached value; known unsupported returns nil',
    'cache':'0x1007b06f0 calls cache-only partial lookup 0x1007af0d0; descriptor exists -> descriptor.count, otherwise CFArrayGetCount; non-array cached value returns some(0), not nil',
    'uncached':'0x1007b077c calls AXUIElement.arrayCount(for:); only AXError.success accepted, all other statuses throw axError',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007b06a0,0x1007b0828),(0x1007af0d0,0x1007af1c4)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementCount.swift',
    'limitations':'Concrete cache/count/visible-selection composition restored; system array-count adapter and thread dispatch are restored separately; original provider/protocol/TaskLocal and production traversal remain pending.',
}
element_storage_evidence['childrenPreferringVisible']={
    'entry':'0x1007a3fd0..<0x1007a409c',
    'freshSupport':'0x1007a4514 calls uncachedSupportedAttributes once before candidate selection',
    'priority':'0x1007a4574 constructs ordered [visibleRows, visibleChildren]; 0x100717068 returns first predicate match',
    'predicate':'0x1007a7494: fresh support contains attribute and hasCount(for:); count only queried for supported candidates',
    'hasCount':'0x1007b0420: (try? count(for:)) ?? 0 > 0; error, nil, zero and negative are false',
    'fallback':'when no candidate matches, checks isAttributeSupported(children); false returns empty, true reads children',
    'read':'selected attribute passes to 0x1007b035c value<[UIElement]>(ignoringTypeMismatch:false), nil becomes []; no retry or fallback after empty value',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007a3fd0,0x1007a409c),(0x1007a44f4,0x1007a4638),(0x1007a7494,0x1007a74f8),(0x1007b0420,0x1007b0468),(0x1007b035c,0x1007b03d4)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementVisibleChildren.swift',
    'limitations':'Cache count and collection composition are restored; explicit system array-count adapter exists; original TaskLocal provider remains pending; full protocol/TaskLocal and production traversal remain pending.',
}
element_storage_evidence['parentValue']={
    'entry':'UIElementProtocol.parent.getter 0x1007b0214..<0x1007b029c',
    'call':'0x1007b0264 -> value<UIElement>(for:AXParent, ignoringTypeMismatch:false); returns optional concrete element unchanged',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007b0214,0x1007b029c)]],
    'implementation':['native/macos/Sources/CuaHelper/UIElementParentValue.swift','native/macos/Sources/CuaHelper/AXConcreteUIElementDecoding.swift'],
    'limitations':'Concrete cached/uncached parent decoding and parent-chain composition restored with explicit transaction/read/reporting. Full existential protocol/provider, implicit TaskLocal and production menu integration remain pending.',
}
element_storage_evidence['parentChain']={
    'defaultDepth':'0x1007a7f9c returns 300',
    'construction':'0x1007a7fa4: includingSelf true seeds self at depth 0; false resolves parent immediately and seeds depth 1',
    'step':'0x1007b704c: nil current or depth > maxDepth returns nil; otherwise resolve parent, increment depth with checked overflow, yield original current',
    'boundaries':'inclusive depth; lookahead occurs before each yielded element even at maximum depth; no identity deduplication in this path',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007a7f9c,0x1007a80f0),(0x1007b704c,0x1007b71a8),(0x1007b7e24,0x1007b7e2c)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementParentChain.swift',
    'limitations':'Traversal restored with generic node and parent boundary; concrete parent getter restored separately; complete existential protocol and production integration remain pending.',
}
element_storage_evidence['elementActions']={
    'entry':'UIElementProtocol.actions.getter 0x1007916b0..<0x100791a24',
    'read':'0x100791798 calls AXUIElement.actions; failure logs then returns [] without supplemental lookup',
    'supplement':'0x1007919b8 -> 0x10079446c: isDisclosable witness +0xa8 gates isDisclosing +0xb0; returns collapse when true, expand when false',
    'merge':'0x1007919c4 -> 0x10076d304 appends supplement to native array; no final deduplication',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007916b0,0x100791a24),(0x10079446c,0x100794520),(0x10076d304,0x10076d3dc)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementActions.swift',
    'concreteComposition':'native/macos/Sources/CuaHelper/UIElementConcreteActions.swift combines native read with concrete cache support, throwing settable query and cached disclosure state. Native-read failure reports once and skips supplement; settable failure preserves native actions.',
    'limitations':'Concrete action composition restored; native read/provider and logger remain injected. Full protocol and production observation wiring remain pending. Logger is an explicit callback, not original os.Logger integration.',
}
element_storage_evidence['menuActionPreparation']={
    'entry':'UIElementProtocol.perform(action:) at 0x100791a68',
    'parents':'menuItem only; defaultMaximumParentTraversalDepth and parentChain(includingSelf:false) at 0x100791b34',
    'prefix':'0x100791bb0 calls childrenPreferringVisible; first nonempty children terminates collection; candidates materialized before actions lookup',
    'match':'0x100791ce8 actions witness +0x48; predicate 0x10079720c compares requested action String; first matching ancestor in prefix order only',
    'execution':'0x100791e88 perform witness +0x60; error returns at 0x100791e9c, success continues target dispatch at 0x100791d78',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100791a68,0x100791d78),(0x100791e38,0x100791ea8),(0x10079720c,0x100797260)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementMenuPreparation.swift',
    'limitations':'Original parent-chain and visible-child accessors, protocol/provider and production wiring remain injected boundaries; no live menu acceptance yet.',
}
element_storage_evidence['actionDispatchTail']={
    'directionMapping':'0x100728f34: ordered mutable action comparisons up/down/left/right; 0/1/2/3 or optional-none tag 4',
    'disclosure':'0x100791d78..0x100791e14: expand or collapse calls toggleDisclosure before considering scroll',
    'scroll':'0x100791f10 calls scrollUsingScrollBar; error at 0x100791f18 propagates, true at 0x100791f1c returns, false falls back to AX perform',
    'ordinary':'0x100791eec calls AXUIElement.perform with unchanged action',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100728f34,0x1007290bc),(0x100791d78,0x100791f24)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementActionDispatch.swift',
    'limitations':'Restored post-menu dispatch with injected execution boundaries only. Menu preparation and concrete scrollbar/page-button helpers are restored separately; original parent traversal, protocol/provider wiring and production entry point remain pending; this function does not replace the complete perform method.',
}
element_storage_evidence['scrollUsingScrollBar']={
    'entry':'0x1007287d0',
    'axis':'0x10072897c..0x1007289b0: up/down -> verticalScrollBar, left/right -> horizontalScrollBar',
    'button':'0x100728810..0x100728858: up/left -> decrementPageButton, down/right -> incrementPageButton',
    'missing':'nil scrollbar returns false at 0x1007287fc; nil button returns false via 0x10072891c..0x100728954',
    'execution':'0x10072889c reads mutable press constant; 0x1007288dc calls button perform witness +0x60; error register is preserved, otherwise true',
    'getters':'vertical/horizontal getters call value<ScrollBarUIElement>(for:ignoringTypeMismatch:false) via 0x100728690; page-button getter implementation remains separate work',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100728658,0x10072870c),(0x1007287d0,0x1007289b0)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementScrollUsingScrollBar.swift',
    'limitations':'Control flow restored with injected typed getter/perform boundaries and tested in composition with action dispatch. Concrete ScrollBarUIElement construction and page-button discovery are restored separately; full protocol wiring and live UI acceptance remain pending.',
}
element_storage_evidence['scrollBarPageButtons']={
    'incrementEntry':'0x1007277a4', 'decrementEntry':'0x100727cb0',
    'children':'reads AXChildren using 0x1007244e4, then traverses array in order',
    'role':'cached role String decoding, unknown fallback; compare UIElementRole.button before subrole lookup',
    'subroles':{'increment':'AXIncrementPage','decrement':'AXDecrementPage'},
    'literalSites':['0x100727b0c..0x100727b30','0x100728018..0x10072803c'],
    'selection':'first matching role+subrole; missing or decode-failed values skip; empty/no match returns nil',
    'identity':'0x100727c84..0x100727c8c and 0x100728190..0x100728198 preserve original child AX/cache fields in UIElement protocol box',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007277a4,0x100727cb0),(0x100727cb0,0x1007281bc)]],
    'implementation':'native/macos/Sources/CuaHelper/ScrollBarPageButton.swift',
    'limitations':'Concrete cached child selection restored and composed with scroll execution; AXChildren array decoding, ScrollBarUIElement wrapper and full protocol/provider integration remain pending.',
}
element_storage_evidence['uiElementCollectionDecoding']={
    'childrenReader':'0x1007244e4 -> 0x100724514; cached decode first, uncached AX read on missing/failed cached decode',
    'arrayDecoder':'0x100712f2c -> 0x1007135c8; CFArray branch 0x100713880, element conversion 0x100713d2c -> 0x1006ea28c, final requested-array cast 0x100713dac',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007244e4,0x1007248bc),(0x100712f2c,0x100712f58),(0x1007135c8,0x100713e20)]],
    'implementation':'native/macos/Sources/CuaHelper/AXUIElementCollectionDecoding.swift',
    'limitations':'Concrete CFArray branch with explicit element initializer only. Full attribute reader/logger integration, TaskLocal acquisition, generic type/protocol dispatch and production connection remain pending.',
}
if struct.unpack('<ii',read_virtual(0x101570f20,8))!=(-25212,-25205):
    raise SystemExit('Native collection reader tolerated errors changed')
element_storage_evidence['elementCollectionValue']={
    'entry':'0x100724514',
    'cache':'0x1007245ec decode(false), failure discarded; nonnil including empty returns at 0x100724874',
    'support':'0x100724624..0x100724650 respects requested attributes and supported set; known unsupported yields empty',
    'read':'0x100724660 raw value; success/noValue/attributeUnsupported accepted; other statuses reported',
    'allowedErrorData':{'address':'0x101570f20','rawValues':[-25212,-25205]},
    'decode':'0x1007246ec decode(true); thrown read/decode error logged then empty array',
    'cleanupCorrection':'0x1002323d4 releases optional partial-value storage; not evidence of cache invalidation',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x100724514,0x1007248bc),(0x1002323d4,0x100232408)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementCollectionValue.swift',
    'limitations':'Concrete accessor composition with original decoder/provider/logger boundaries injected; original full strict decoder, native logger backend, TaskLocal and production wiring remain pending.',
}
element_storage_evidence['scrollBarStorage']={
    'descriptor':'0x1012cc950', 'fields':'0x10132336c: immutable axElement and cache',
    'initializer':'0x100717a54 -> 0x10071e390; TaskLocal read 0x10071e3cc, shared cache constructor 0x10071e438 -> 0x10076589c; no role validation in initializer',
    'staticRole':'0x100726990 initializes optional role to UIElementRole.scrollBar; getter 0x100726a1c',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x10071e390,0x10071e46c),(0x100726990,0x100726a70)]],
    'implementation':'native/macos/Sources/CuaHelper/ScrollBarUIElement.swift',
    'limitations':'Concrete storage, explicit-transaction system initialization and page-button getter composition restored. Original protocol conformances, implicit TaskLocal, other scrollbar properties and production dispatch remain pending.',
}
element_storage_evidence['elementConstructionDecoder']={
    'entry':'0x1006e9e50..<0x1006ea098',
    'typeCheck':'0x1006e9ef0..0x1006e9f00 CFGetTypeID vs AXUIElementGetTypeID',
    'directCast':'0x1006e9f48 direct requested-type cast; success skips initializer',
    'initialize':'0x1006ea030..0x1006ea040 initializer witness +0x30; no role read/check',
    'failure':'non-AX false -> nil; true -> failedToUnwrapAttributeValue(AXUIElement.self)',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1006e9e50,0x1006ea098),(0x100712f58,0x1007134e8)]],
    'implementation':['native/macos/Sources/CuaHelper/AXElementConstruction.swift','native/macos/Sources/CuaHelper/AXScrollBarDecoding.swift'],
    'limitations':'Initializer witness is injected rather than claiming complete original protocol conformance; concrete ScrollBar dispatch restored, implicit TaskLocal and production property wiring pending.',
}
element_storage_evidence['toggleDisclosure']={
    'dispatch':'0x100791e0c: both expand and collapse call UIElementProtocol.toggleDisclosure',
    'condition':'0x1007b016c..0x1007b0178: isDisclosable witness +0xa8; false returns without reading state or writing',
    'state':'0x1007b017c..0x1007b0188: isDisclosing witness +0xb0',
    'write':'0x1007b019c negates Bool; 0x1007b01d4 calls setValue witness +0x58 with AXDisclosing',
    'defaultGetters':{'isDisclosable':'0x1007ac3b8 -> 0x1007ac56c -> isAttributeSupportedAndSettable',
        'isDisclosing':'0x1007ac3d4 -> 0x1007ac3f0: cache-only Bool decode, false for missing/mismatch/error'},
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007b0148,0x1007b0214),(0x1007ac3b8,0x1007ac52c),(0x1007ac56c,0x1007ac5c4)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementDisclosure.swift',
    'limitations':'Injected getter/setter dispatch; synthetic actions are not yet advertised or executed by the production simplified collector.',
}
element_storage_evidence['supportedAndSettable']={
    'supportGetter':'0x1007a7d78: read transaction attributes; nil/contains -> reread cache.supportedAttributes; otherwise uncachedSupportedAttributes',
    'shortCircuit':'0x1007b0328: false support skips writability entirely',
    'writability':'0x1007b029c: throwing system/provider check errors become false',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1007a7d78,0x1007a7e50),(0x1007b029c,0x1007b035c)]],
    'implementation':'native/macos/Sources/CuaHelper/UIElementAttributeSupport.swift',
    'composition':'UIElement disclosure action advertisement and toggle share support/writability policy',
    'limitations':'Concrete immutable UIElement composition restored; original protocol dynamic dispatch and native encoded setter remain pending.',
}
element_storage_evidence['systemAttributeWriting']={
    'directCall':'0x1006f765c -> AXUIElementSetAttributeValue',
    'mainQueueClosure':'0x1006f7760..0x1006f77bc, same success-only status handling',
    'status':'all non-success statuses throw UIElementError.axError; no action-specific tolerated errors or retry',
    'value':'passes AXEncodedValue.value unchanged with UIElementAttribute.name',
    'thread':'same-process non-main callers synchronously dispatch to main queue; otherwise direct call',
    'blocks':[{'start':hex(a),'endExclusive':hex(b),'machineCodeSha256':hashlib.sha256(read_virtual(a,b-a)).hexdigest()}
        for a,b in [(0x1006f75dc,0x1006f7748),(0x1006f7760,0x1006f77bc)]],
    'implementation':'native/macos/Sources/CuaHelper/AXAttributeWriting.swift',
    'productionUse':'Target.action setValue; caller preserves snapshot invalidation and error outcome mapping',
    'limitations':'System adapter only. Higher-level generic setter, provider dispatch and disclosure action execution are not yet fully integrated.',
}
element_storage_evidence['genericElementSetter']={
    'encode':'0x1007a7d0c -> 0x1006ea3e4; failure at 0x1007a7d20 exits before AX getter',
    'resolve':'0x1007a7d30 invokes axElement witness +0x20 only after encoding succeeds',
    'write':'0x1007a7d44 -> AXUIElementRef.setValue once; no additional support/writability check',
    'block':{'start':'0x1007a7cd4','endExclusive':'0x1007a7d78',
        'machineCodeSha256':hashlib.sha256(read_virtual(0x1007a7cd4,0x1007a7d78-0x1007a7cd4)).hexdigest()},
    'implementation':'native/macos/Sources/CuaHelper/UIElementSetValue.swift',
    'productionUse':'Target.action setValue keeps its existing outer guard and outcome mapping',
    'limitations':'Core sequencing restored with provider injection; concrete setSystemValue deliberately uses system adapter, not full MockProvider dispatch.',
}
element_storage_evidence['elementInitializerComposition']={
    'entry':'UIElement.init(element:) aliases 0x1007213dc -> 0x10072187c',
    'transaction':'0x1007218b8 reads TaskLocal current; present extracts cache fields, absent uses nil',
    'construct':'0x100721914 -> 0x10076589c; return original AX reference and constructed cache',
    'block':{'start':'0x10072187c','endExclusive':'0x100721960',
        'machineCodeSha256':hashlib.sha256(read_virtual(0x10072187c,0x100721960-0x10072187c)).hexdigest()},
    'implementation':'native/macos/Sources/CuaHelper/UIElementCacheConstruction.swift',
    'limitations':'Transaction resolver is injected; explicit system initializer accepts a transaction argument. Full original TaskLocal ownership and production traversal are not restored.',
}
action_nominal=0x1012cd3b4
action_fields=relative_address(action_nominal+16)
_,_,action_kind,action_size,action_count=struct.unpack('<iiHHI',read_virtual(action_fields,16))
action_record=action_fields+16
if (action_kind,action_size,action_count)!=(0,12,1): raise SystemExit('UIElementAction storage changed')
if read_virtual(relative_address(action_record+8),5)!=b'name\0' or read_virtual(relative_address(action_record+4),3)!=b'SS\0': raise SystemExit('UIElementAction name is not Swift.String')
if struct.unpack('<I',read_virtual(action_record,4))[0]!=0: raise SystemExit('UIElementAction name mutability changed')
action_constants={}
for address,value in [(0x101575898,'SAIExpand'),(0x1015758a8,'SAICollapse')]:
    action_raw=read_virtual(address,16)
    expected=value.encode()+b'\0'*(15-len(value))+bytes([0xe0+len(value)])
    if action_raw!=expected: raise SystemExit('Synthetic disclosure action string changed')
    action_constants[hex(address)]={'name':value,'bytes':action_raw.hex()}
element_storage_evidence['disclosureActionsImplementation']={
    'actionNominal':hex(action_nominal),'fieldDescriptor':hex(action_fields),
    'storage':'immutable name: Swift.String; Hashable/Equatable conformances',
    'constants':action_constants,
    'implementation':['native/macos/Sources/CuaHelper/UIElementAction.swift','native/macos/Sources/CuaHelper/UIElementDisclosureActions.swift'],
    'sourceBody':'0x100793f94..0x1007941e0',
    'limitations':'Supplemental selection, static actions, description mapping, action-array composition and element-level system disclosure writes are restored. Original dynamic provider dispatch and production synthetic action advertisement/execution remain incomplete.',
}
transaction_nominal=0x1012cceb4
transaction_fields=relative_address(transaction_nominal+16)
_,_,transaction_kind,transaction_size,transaction_count=struct.unpack('<iiHHI',read_virtual(transaction_fields,16))
transaction_names=[c_string(relative_address(transaction_fields+16+i*transaction_size+8)) for i in range(transaction_count)]
if (transaction_kind,transaction_size,transaction_names) != (0,12,['element','cache','roleFrequencyTable']):
    raise SystemExit('UIElementTreeTransaction storage changed')
tasklocal_descriptor=0x101195770
displacement,length=struct.unpack('<iI',read_virtual(tasklocal_descriptor,8))
tasklocal_typeref=tasklocal_descriptor+displacement
if length != 14 or read_virtual(tasklocal_typeref,1) != b'\x02' or relative_address(tasklocal_typeref+1) != 0x1014698c8 or read_virtual(tasklocal_typeref+5,2) != b'y\x01' or relative_address(tasklocal_typeref+7) != transaction_nominal or read_virtual(tasklocal_typeref+11,3) != b'SgG':
    raise SystemExit('Transaction TaskLocal optional payload changed')
for slot,symbol in [('0x1014698c8','_$ss9TaskLocalCMn'),('0x1014698b0','_$ss9TaskLocalC9withValue_9operation4file4lineqd__x_qd__yKXESSSutKlF')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if 'libswift_Concurrency/'+symbol not in line: raise SystemExit('Transaction TaskLocal binding changed')
transaction_functions=[]
for address,name in [(0x10076ccfc,'TaskLocal current initialization'),(0x10076cca8,'current getter'),
                     (0x10076c8e8,'perform(work:)'),(0x10076d9bc,'withValue work forwarding')]:
    boundary=starts[starts.index(address)+1]
    transaction_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
transaction_words={0x10076cd0c:0xf90023ff,0x10076cd10:0x6f00e400,
    0x10076cd14:0xad0103e0,0x10076cd18:0xad0003e0,
    0x1011537ec:0xd00018b0,0x1011537f0:0xf9445a10,0x1011537f4:0xd61f0200,
    0x10076d9c8:0xa941a68a,0x10076d9cc:0xf9401680,0x10076d9d4:0xd63f0140}
for address,word in transaction_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word: raise SystemExit('Transaction scope branch changed')
word=struct.unpack('<I',read_virtual(0x10076c99c,4))[0]
immediate=word & 0x3ffffff
if immediate & 0x2000000: immediate -= 0x4000000
if word >> 26 != 0b100101 or 0x10076c99c+immediate*4 != 0x1011537ec:
    raise SystemExit('Transaction withValue call changed')
transaction_scope_evidence={
    'nominalDescriptor':hex(transaction_nominal),'fieldDescriptor':hex(transaction_fields),'fields':transaction_names,
    'fieldRecordsSha256':hashlib.sha256(read_virtual(transaction_fields,16+transaction_size*transaction_count)).hexdigest(),
    'taskLocalType':'TaskLocal<UIElementTreeTransaction?>','typeDescriptor':hex(tasklocal_descriptor),'typeReference':hex(tasklocal_typeref),
    'currentStorage':'0x1015ca8b8','withValueGot':'0x1014698b0','withValueCall':'0x10076c99c',
    'functions':transaction_functions,'instructionWords':{hex(a):hex(w) for a,w in transaction_words.items()},
    'interpretation':'current is an optional tree transaction with nil initialization. perform(work:) binds the transaction using synchronous TaskLocal.withValue and forwards the supplied work closure within that scope.',
    'limitations':'Does not establish transaction creation/prefetch policy, cache invalidation, role frequency algorithm or tree revision semantics. No process-global cache replacement is implied.',
}
# Transaction fields retain their original existential/cache/role-counter types.
transaction_field_types = [
    ('element',0x10129e8e6,'02d9241c005f70','any UIElementProtocol'),
    ('cache',0x10129f176,'0181dd0200','UIElementTreeTransaction.Cache'),
    ('roleFrequencyTable',0x10129f17c,'02fb1b1c007902cd1b1c0047','FrequencyTable<UIElementRole>'),
]
for index,(name,address,encoded,meaning) in enumerate(transaction_field_types):
    record=transaction_fields+16+index*transaction_size
    if relative_address(record+4)!=address or read_virtual(address,len(bytes.fromhex(encoded))).hex()!=encoded or struct.unpack('<I',read_virtual(record,4))[0]!=0:
        raise SystemExit('Transaction field type/immutability changed')
for slot,destination in [('0x101460dc0','0x1012cd46c'),('0x101460d78','0x1012ccd50'),('0x101460d50','0x1012cd598')]:
    line=next((line for line in fixups.splitlines() if slot in line.lower()),'')
    if 'rebase' not in line or destination not in line.lower():
        raise SystemExit('Transaction symbolic type rebase changed')
for descriptor,name in [(0x1012cd46c,'UIElementProtocol'),(0x1012ccd50,'FrequencyTable'),(0x1012cd598,'UIElementRole')]:
    if c_string(relative_address(descriptor+8)) != name:
        raise SystemExit('Transaction symbolic type name changed')
transaction_scope_evidence['fieldTypes']=[{'name':name,'typeReference':hex(address),'encoded':encoded,'meaning':meaning,'mutable':False} for name,address,encoded,meaning in transaction_field_types]
role_nominal=0x1012cd598
role_fields=relative_address(role_nominal+16)
_,_,role_kind,role_size,role_count=struct.unpack('<iiHHI',read_virtual(role_fields,16))
if (role_kind,role_size,role_count)!=(0,12,1) or c_string(relative_address(role_fields+24))!='name' or relative_address(role_fields+20)!=0x10129e21a or struct.unpack('<I',read_virtual(role_fields+16,4))[0]!=0:
    raise SystemExit('UIElementRole CFString storage changed')
if struct.unpack('<I',read_virtual(0x1007b94e8,4))[0]!=0x14265cc7:
    raise SystemExit('UIElementRole rawValue bridge changed')
transaction_scope_evidence['roleIdentity']={
    'nominalDescriptor':hex(role_nominal),'fieldDescriptor':hex(role_fields),
    'field':'let name: CFString','fieldTypeReference':'0x10129e21a',
    'functions':[{'start':hex(address),'endExclusive':hex(starts[starts.index(address)+1]),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,starts[starts.index(address)+1]-address)).hexdigest()}
        for address in [0x100009888,0x1006ea804,0x1006ebd60,0x1006ebdf8,0x1007b94e8]],
    'interpretation':'Role is a distinct CFString-backed value type, sharing CFString/String constructors and CF hashing with attribute keys; equality delegates to CF equality. rawValue bridges the stored string. FrequencyTable uses this role type, not display labels or attribute names.',
    'limitations':'Static role constants, presentationKind mapping, role discovery and full transaction protocol remain separate.',
}
# Transaction cache types recovered from symbolic Swift field typerefs.
# Resolve indirect references through dyld fixups, not adjacent symbol labels.
transaction_cache_nominal=0x1012ccef8
transaction_cache_fields=relative_address(transaction_cache_nominal+16)
_,_,cache_kind,cache_size,cache_count=struct.unpack('<iiHHI',read_virtual(transaction_cache_fields,16))
cache_names=[c_string(relative_address(transaction_cache_fields+16+i*cache_size+8)) for i in range(cache_count)]
if (cache_kind,cache_size,cache_names)!=(0,12,['attributeTable','requestedAttributes','fallbackElements']):
    raise SystemExit('Transaction cache field layout changed')
cache_types=[
    ('attributeTable',0x10129f1a0,'53447902f42f1c0053447902341c1c0002bf1b1c004747','[AXUIElement: [UIElementAttribute: AXPartialValue]]'),
    ('requestedAttributes',0x10129f0ee,'53687902ee1c1c0047','Set<UIElementAttribute>'),
    ('fallbackElements',0x10129f1b8,'022fa91c007953447902d62f1c0002c11b1c004747','OSAllocatedUnfairLock<[AXUIElement: UIElementCache]>'),
]
cache_type_evidence=[]
for index,(name,address,encoded,decoded) in enumerate(cache_types):
    if relative_address(transaction_cache_fields+16+index*cache_size+4)!=address or read_virtual(address,len(bytes.fromhex(encoded))+1)!=bytes.fromhex(encoded)+b'\0':
        raise SystemExit('Transaction cache symbolic field type changed: '+name)
    cache_type_evidence.append({'field':name,'typeReference':hex(address),'encodedTypeHex':encoded,'type':decoded})
cache_bindings=[]
for slot,descriptor,name in [(0x101462198,0x1012cc16c,'AXUIElement'),(0x101460de0,0x1012cd3ec,'UIElementAttribute'),(0x101460d70,0x1012cc5e8,'AXPartialValue'),(0x101460d88,0x1012cce40,'UIElementCache')]:
    line=next((line for line in fixups.splitlines() if hex(slot) in line.lower()),'')
    if ('rebase  '+hex(descriptor)).lower() not in line.lower() or c_string(relative_address(descriptor+8))!=name:
        raise SystemExit('Transaction cache indirect type reference changed: '+name)
    cache_bindings.append({'slot':hex(slot),'descriptor':hex(descriptor),'name':name})
lock_slot=0x101469ae8
lock_binding='libswiftos/_$s2os21OSAllocatedUnfairLockVMn'
if lock_binding not in next((line for line in fixups.splitlines() if hex(lock_slot) in line.lower()),''):
    raise SystemExit('Transaction fallback cache lock type changed')
transaction_cache_evidence={
    'nominalDescriptor':hex(transaction_cache_nominal),'fieldDescriptor':hex(transaction_cache_fields),
    'fields':cache_type_evidence,'indirectReferences':cache_bindings,
    'lock':{'slot':hex(lock_slot),'binding':lock_binding},
    'interpretation':'The transaction cache contains an AX-element-keyed partial attribute table, a set of requested attributes, and a system OSAllocatedUnfairLock protecting the fallback UIElementCache dictionary.',
    'limitations':'Field types alone do not prove initialization, insertion, invalidation or lock critical sections. Do not replace these with process-global caches or a guessed locking policy.',
}
# UIElementCache differs from the transaction-wide cache: the requested
# attribute set is optional, and attributes contain partial values directly.
element_cache_types=[
    ('supportedAttributes',0x10129f0ee,'53687902ee1c1c0047','Set<UIElementAttribute>'),
    ('attributes',0x10129e56c,'5344790270281c000173e0020047','[UIElementAttribute: AXPartialValue]'),
    ('transactionAttributes',0x10129f0f8,'53687902e41c1c00475367','Set<UIElementAttribute>?'),
]
element_cache_fields=relative_address(0x1012cce40+16)
for index,(name,address,encoded,decoded) in enumerate(element_cache_types):
    record=element_cache_fields+16+index*12
    if c_string(relative_address(record+8))!=name or relative_address(record+4)!=address or read_virtual(address,len(bytes.fromhex(encoded))+1)!=bytes.fromhex(encoded)+b'\0':
        raise SystemExit('UIElementCache field type changed: '+name)
if relative_address(0x10129e575)!=0x1012cc5e8:
    raise SystemExit('UIElementCache AXPartialValue direct type changed')
lock_calls=[(0x100765b28,0x101154ca4,'_os_unfair_lock_lock'),(0x100765b40,0x101154cbc,'_os_unfair_lock_unlock')]
for site,stub,symbol in lock_calls:
    word=struct.unpack('<I',read_virtual(site,4))[0]
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate-=0x4000000
    if word>>26!=0b100101 or site+immediate*4!=stub or indirect.get(stub)!=symbol:
        raise SystemExit('UIElementCache fallback lookup lock call changed')
lookup_call_word=struct.unpack('<I',read_virtual(0x100765b38,4))[0]
if lookup_call_word!=0x97fffc57:
    raise SystemExit('UIElementCache locked lookup call changed')
lookup_start=0x100764c94
lookup_end=starts[starts.index(lookup_start)+1]
lookup_sha=hashlib.sha256(read_virtual(lookup_start,lookup_end-lookup_start)).hexdigest()
if lookup_sha!='f2a3b64d603ad73a4a640fea1b6fed3528ec7a82d0f2c174de12cddfdff2b96e':
    raise SystemExit('UIElementCache fallback lookup body changed')
element_cache_evidence={
    'fields':[{'field':n,'typeReference':hex(a),'encodedTypeHex':e,'type':t} for n,a,e,t in element_cache_types],
    'fallbackLookup':{'start':hex(lookup_start),'endExclusive':hex(lookup_end),'machineCodeSha256':lookup_sha,
        'caller':'0x100765b38','lockCalls':[{'site':hex(c),'stub':hex(st),'symbol':sy} for c,st,sy in lock_calls]},
    'interpretation':'The element cache holds a supported set, partial-value dictionary, and optional transaction attribute set. The constructor brackets fallback dictionary lookup with the system unfair lock; the lookup returns the stored three-field value or absent result.',
    'limitations':'This verifies one read-side critical section, not all cache writes, initialization, invalidation or native observation behavior. Optional transactionAttributes must not be collapsed to an empty set.',
}
# Separate read and write critical sections; the expensive fallback build
# between them is not held under one lock. The write is an update, not set-if-absent.
fallback_write_calls=[(0x100766144,0x101154ca4,'_os_unfair_lock_lock'),(0x100766164,0x101154cbc,'_os_unfair_lock_unlock')]
for site,stub,symbol in fallback_write_calls:
    word=struct.unpack('<I',read_virtual(site,4))[0]
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate-=0x4000000
    if word>>26!=0b100101 or site+immediate*4!=stub or indirect.get(stub)!=symbol:
        raise SystemExit('UIElementCache fallback write lock call changed')
fallback_write_words={
    0x100766148:0x910042e0,0x10076614c:0xaa1403e1,
    0x100766150:0xaa1c03e2,0x100766154:0xaa1a03e3,
    0x100766158:0xd2800004,0x10076615c:0x97fffbbb,
    0x1007650c8:0x97fe7e12,0x1007650d8:0xf9000328,
    0x1007049c4:0x36000259,0x1007049dc:0xa9005517,
    0x1007049e0:0xf9000913,0x100704a1c:0x97ffb4cb,
}
for address,word in fallback_write_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('UIElementCache fallback replacement branch changed')
fallback_write_functions=[]
for address,name in [(0x100765048,'fallback dictionary write wrapper'),(0x100704910,'specialized dictionary replacement or insertion')]:
    boundary=starts[starts.index(address)+1]
    fallback_write_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
element_cache_evidence['fallbackWrite']={
    'lockCalls':[{'site':hex(c),'stub':hex(st),'symbol':sy} for c,st,sy in fallback_write_calls],
    'instructionWords':{hex(a):hex(w) for a,w in fallback_write_words.items()},
    'functions':fallback_write_functions,
    'interpretation':'Fallback lookup and storage use separate lock regions. The storage call passes nil for transactionAttributes. The dictionary setter replaces an existing three-field cache value or inserts a new key; it does not keep the first concurrent value by double-checking.',
    'limitations':'Does not recover the full attributes collection pipeline, every error path or all cache writers. No process-wide cache or single-flight guarantee follows.',
}
# Supported attribute-name direct system branch: AXError is not consumed.
attribute_names_calls=[(0x1006f5d04,0x1011538a0,'_AXUIElementCopyAttributeNames'),(0x1006f5cb4,0x1011548f0,'_getpid')]
for site,stub,symbol in attribute_names_calls:
    word=struct.unpack('<I',read_virtual(site,4))[0]
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate-=0x4000000
    if word>>26!=0b100101 or site+immediate*4!=stub or indirect.get(stub)!=symbol:
        raise SystemExit('AX attribute-name system call changed')
attribute_names_words={
    0x1006f5c88:0xf8010edf,0x1006f5cc0:0xb7000140,
    0x1006f5cc4:0x6b0002bf,0x1006f5cc8:0x54000101,
    0x1006f5ce4:0x36000200,0x1006f5d08:0xd101a3a0,
    0x1006f5d0c:0x94297d1b,0x1006f5dc8:0xf94002d4,
}
for address,word in attribute_names_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('AX attribute-name output or dispatch branch changed')
attribute_names_start=0x1006f5b8c
attribute_names_end=starts[starts.index(attribute_names_start)+1]
attribute_names_evidence={
    'start':hex(attribute_names_start),'endExclusive':hex(attribute_names_end),
    'machineCodeSha256':hashlib.sha256(read_virtual(attribute_names_start,attribute_names_end-attribute_names_start)).hexdigest(),
    'calls':[{'site':hex(c),'stub':hex(st),'symbol':sy} for c,st,sy in attribute_names_calls],
    'instructionWords':{hex(a):hex(w) for a,w in attribute_names_words.items()},
    'interpretation':'Direct system enumeration initializes output to nil, calls AXUIElementCopyAttributeNames, and discards its return status before consuming the output. PID/thread dispatch mirrors the ordinary attribute reader.',
    'limitations':'The restored raw adapter does not implement MockProvider override, CF-array bridging, UIElementAttribute conversion or production cache assembly.',
}
attribute_names_bridge_symbol='Foundation/_$sSa10FoundationE34_conditionallyBridgeFromObjectiveC_6resultSbSo7NSArrayC_SayxGSgztFZ'
for slot,binding in [('0x101463828',attribute_names_bridge_symbol),('0x10151ef98','CoreFoundation/_OBJC_CLASS_$_NSArray'),('0x101468918','libswiftCore/__swiftEmptyArrayStorage')]:
    if binding not in next((line for line in fixups.splitlines() if slot in line.lower()),''):
        raise SystemExit('Attribute-name Foundation bridge binding changed')
if 'rebase  0x1012CC2C8' not in next((line for line in fixups.splitlines() if '0x10149aa60' in line.lower()),'') or c_string(relative_address(0x1012cc2c8+8))!='CFString':
    raise SystemExit('Attribute-name CFString metadata changed')
attribute_names_bridge_words={
    0x1006e7524:0xf0007441,0x1006e7528:0x91382021,
    0x1006e752c:0xf0006d82,0x1006e7530:0x91296042,
    0x1006f5e08:0x97ffc5c7,0x1006f5e28:0x94296bfa,
    0x1006f5e38:0xf100011f,0x1006f5e3c:0x9a8802b5,
    0x101150e10:0xf0001890,0x101150e14:0xf9441610,0x101150e18:0xd61f0200,
}
for address,word in attribute_names_bridge_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('Attribute-name bridge metadata or empty fallback changed')
attribute_names_evidence['arrayBridge']={
    'elementType':'CFString','metadata':'0x10149aa58','nominalDescriptor':'0x1012cc2c8',
    'symbol':attribute_names_bridge_symbol,'got':'0x101463828',
    'instructionWords':{hex(a):hex(w) for a,w in attribute_names_bridge_words.items()},
    'interpretation':'Conditionally bridge NSArray to the whole [CFString] array with Foundation, default to empty on missing bridge output, then preserve order during wrapper conversion. This is not compactMap or CFGetTypeID filtering.',
}
attribute_nominal=0x1012cd3ec
attribute_fields=relative_address(attribute_nominal+16)
_,_,attribute_kind,attribute_size,attribute_count=struct.unpack('<iiHHI',read_virtual(attribute_fields,16))
attribute_type=relative_address(attribute_fields+20)
if (attribute_kind,attribute_size,attribute_count)!=(0,12,1) or c_string(relative_address(attribute_fields+24))!='name' or read_virtual(attribute_type,6)!=bytes.fromhex('029d3f1c0000'):
    raise SystemExit('UIElementAttribute CFString storage changed')
attribute_slot=relative_address(attribute_type+1)
if 'rebase  0x1012CC2C8' not in next((line for line in fixups.splitlines() if hex(attribute_slot) in line.lower()),''):
    raise SystemExit('UIElementAttribute CFString indirect metadata changed')
attribute_key_bindings=[
 ('0x101468db0','libswiftCoreFoundation/_$s14CoreFoundation9_CFObjectPAAE2eeoiySbx_xtFZ'),
 ('0x101468db8','libswiftCoreFoundation/_$s14CoreFoundation9_CFObjectPAAE4hash4intoys6HasherVz_tF'),
 ('0x101463798','Foundation/_$sSS10FoundationE19_bridgeToObjectiveCSo8NSStringCyF'),
]
for slot,binding in attribute_key_bindings:
    if binding not in next((line for line in fixups.splitlines() if slot in line.lower()),''):
        raise SystemExit('UIElementAttribute system key conformance changed')
if relative_address(0x1011964e0+24)!=0x10079cd20:
    raise SystemExit('UIElementAttribute Equatable witness changed')
attribute_key_words={0x100009888:0xd65f03c0,0x1006ea814:0x942997f3,
    0x1006ebe2c:0x94298ca3,0x10079cd5c:0x9426c8d4}
for address,word in attribute_key_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('UIElementAttribute constructor or key call changed')
attribute_key_functions=[]
for address,name in [(0x1006ea804,'String initializer'),(0x100009888,'CFString initializer'),(0x1006ebdf8,'hash(into:)'),(0x10079cd20,'Equatable witness'),(0x10076d890,'attribute array to Set construction')]:
    boundary=starts[starts.index(address)+1]
    attribute_key_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
attribute_names_evidence['attributeKey']={
    'nominalDescriptor':hex(attribute_nominal),'fieldDescriptor':hex(attribute_fields),'nameType':'CFString',
    'bindings':[{'slot':slot,'symbol':binding} for slot,binding in attribute_key_bindings],
    'instructionWords':{hex(a):hex(w) for a,w in attribute_key_words.items()},'functions':attribute_key_functions,
    'interpretation':'UIElementAttribute stores one CFString. String initialization bridges through Foundation; CFString initialization forwards the reference. Equality and hashing delegate to CoreFoundation _CFObject conformances.',
    'limitations':'This restores the key core and ordered name wrapping, not the full static attribute constant catalog, AppKit-specific overloads, MockProvider override or complete cache construction.',
}
encoded_value_nominal=0x1012cc3f0
encoded_value_fields=relative_address(encoded_value_nominal+16)
_,_,encoded_kind,encoded_size,encoded_count=struct.unpack('<iiHHI',read_virtual(encoded_value_fields,16))
if (encoded_kind,encoded_size,encoded_count)!=(0,12,1) or c_string(relative_address(encoded_value_fields+24))!='value' or c_string(relative_address(encoded_value_fields+20))!='yXl' or struct.unpack('<I',read_virtual(encoded_value_fields+16,4))[0]!=0:
    raise SystemExit('AXEncodedValue immutable AnyObject storage changed')
partial_value_fields=relative_address(0x1012cc5e8+16)
partial_value_names=['value','arraySubsetDescriptor','textTruncationDescriptor']
for index,name in enumerate(partial_value_names):
    record=partial_value_fields+16+index*12
    if c_string(relative_address(record+8))!=name or struct.unpack('<I',read_virtual(record,4))[0]!=0:
        raise SystemExit('AXPartialValue immutable fields changed')
value_is_string_calls=[(0x1006e5860,0x101153a68,'_CFGetTypeID'),(0x1006e5868,0x101153b58,'_CFStringGetTypeID')]
for site,stub,symbol in value_is_string_calls:
    word=struct.unpack('<I',read_virtual(site,4))[0]
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate-=0x4000000
    if word>>26!=0b100101 or site+immediate*4!=stub or indirect.get(stub)!=symbol:
        raise SystemExit('AXEncodedValue string type test changed')
for address,word in [(0x1006e586c,0xeb00027f),(0x1006e5870,0x1a9f17e0),(0x1006e8f9c,0x94000512)]:
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('AXEncodedValue test or wrapping initializer changed')
encoded_storage_evidence={
    'encodedNominal':hex(encoded_value_nominal),'encodedFields':hex(encoded_value_fields),'encodedValueType':'AnyObject',
    'partialFields':hex(partial_value_fields),'immutablePartialFieldNames':partial_value_names,
    'valueIsString':{'start':'0x1006e5854','endExclusive':'0x1006e5880','calls':[{'site':hex(c),'stub':hex(st),'symbol':sy} for c,st,sy in value_is_string_calls]},
    'wrappingInitializer':{'start':'0x1006e8f88','encoderCall':'0x1006e8f9c','encoder':'0x1006ea3e4'},
    'interpretation':'Encoded storage holds an immutable AnyObject; partial storage holds three immutable fields. valueIsString compares CF type IDs. The public wrapping initializer calls the separate parameter encoder.',
    'limitations':'Storage memberwise construction is not a replacement for init(wrapping: Any), generic unwrapping, truncation generation or the full cache pipeline.',
}
dynamic_parameter_words={
    0x1006ea420:0x90006da3,0x1006ea424:0x91384063,
    0x1006ea438:0x9429ab38,0x1006ea440:0xa9425bf4,
    0x1006ea460:0xb0006da3,0x1006ea464:0x913a0063,
    0x1006ea478:0x9429ab28,0x1006ea480:0xb0006da3,
    0x1006ea484:0x913aa063,0x1006ea498:0x9429ab20,
    0x1006ea4fc:0x9429ab07,0x1006ea568:0x9429aaec,
    0x1006ea5a0:0x9429aade,0x1006ea5d8:0x9429aad0,
    0x1006ea654:0x9429a265,
}
for address,word in dynamic_parameter_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('AX dynamic parameter dispatch order changed')
dynamic_bridge_binding='libswiftCore/_$ss27_bridgeAnythingToObjectiveCyyXlxlF'
if dynamic_bridge_binding not in next((line for line in fixups.splitlines() if '0x101467f88' in line.lower()),''):
    raise SystemExit('AX dynamic parameter fallback bridge changed')
for descriptor,names in [(0x1012cd398,['axElement','cache']),(0x1012cce40,['supportedAttributes','attributes','transactionAttributes'])]:
    field=relative_address(descriptor+16)
    for index,name in enumerate(names):
        rec=field+16+index*12
        if c_string(relative_address(rec+8))!=name or struct.unpack('<I',read_virtual(rec,4))[0]!=0:
            raise SystemExit('Native UIElement/cache immutable storage changed')
parameter_evidence['dynamicDispatch']={
    'order':['UIElement','UITextMarker','UITextMarkerRange','CFRange','CGPoint','CGRect','CGSize','Any-to-Objective-C bridge'],
    'fallback':{'call':'0x1006ea654','got':'0x101467f88','symbol':dynamic_bridge_binding},
    'instructionWords':{hex(a):hex(w) for a,w in dynamic_parameter_words.items()},
    'interpretation':'Extract raw UIElement/marker references, encode concrete AX ranges/geometry, otherwise use the Swift runtime object bridge without recursive collection traversal. AXEncodedValue.init(wrapping:) forwards to this encoder.',
    'limitations':'UIElement/cache fields and explicit transaction-aware cache construction are restored. Original implicit TaskLocal acquisition and production traversal remain pending. This encoding evidence does not prove UI acceptance.',
}
prefetched_cache_words={
    0x1007658fc:0x9401462f,0x100765900:0x36000f21,
    0x100765904:0xf9401f28,0x100765908:0xf8607914,
    0x10076591c:0xf9400a9c,0x100765928:0xb40047dc,
    0x1007659f8:0xf9401a88,0x1007659fc:0xf87b7900,
    0x100766208:0xd10063a8,0x10076620c:0xf8500117,
    0x100766220:0xaa1303e0,0x100766224:0x94001d9b,
    0x100766228:0xaa0003fc,0x10076625c:0x17ffffda,
    0x1007661c4:0xaa1c03e0,0x1007661c8:0xaa1403e1,0x1007661cc:0xaa1703e2,
}
for address,word in prefetched_cache_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('Prefetched UIElement cache hit branch changed')
element_cache_evidence['prefetchedHit']={
    'constructor':'0x10076589c','tableLookup':'0x1007658fc','missBranch':'0x100765900',
    'emptyAttributesBranch':'0x100765928','keysToSet':'0x100766224',
    'instructionWords':{hex(a):hex(w) for a,w in prefetched_cache_words.items()},
    'interpretation':'A transaction table hit returns a cache whose supported set comes from the stored attribute dictionary keys; attributes and requested transaction set are retained. An empty per-element dictionary is a hit, not a fallback. Requested attributes are neither synthesized into the data nor used to filter existing keys.',
    'limitations':'The extracted helper returns nil on a miss; full construction must still follow the separate locked fallback and attribute collection paths. It does not implement TaskLocal or transaction prefetch creation.',
}
# Cold constructor policy is source evidence, not a guessed production selector.
cold_policy_entries = [(4302718664, 2435023112, 4317817056, 'role'), (4302718700, 2435031304, 4317817064, 'subrole'), (4302718736, 2435039496, 4317817072, 'roleDescription'), (4302718772, 2435047688, 4317817080, 'title'), (4302718808, 2435055880, 4317817088, 'description'), (4302718844, 2435203336, 4317817232, 'value'), (4302718880, 2435211528, 4317817240, 'valueDescription'), (4302718916, 2435162376, 4317817192, 'placeholderValue'), (4302718952, 2435293448, 4317817320, 'numberOfCharacters'), (4302718988, 2435064072, 4317817096, 'help'), (4302719024, 2435219720, 4317817248, 'identifier'), (4302719060, 2435825928, 4317817840, 'selected'), (4302719096, 2435178760, 4317817208, 'focused'), (4302719132, 2435170568, 4317817200, 'enabled'), (4302719168, 2435670280, 4317817688, 'disclosing'), (4302719204, 2435907848, 4317817920, 'url'), (4302719240, 2436186376, 4317818192, 'traits'), (4302719276, 2435137800, 4317817168, 'servesAsTitleForUIElements'), (4302719312, 2435588360, 4317817608, 'rowIndexRange'), (4302719348, 2435621128, 4317817640, 'columnIndexRange')]
cold_policy_symbols = []
for site,word,slot,name in cold_policy_entries:
    if struct.unpack('<I',read_virtual(site,4))[0] != word:
        raise SystemExit('Cold-cache base attribute initializer changed')
    match = next((line for line in raw.splitlines() if line.startswith(f'{slot:016x} S ')),None)
    if match is None: raise SystemExit('Cold-cache attribute symbol missing')
    cold_policy_symbols.append(match)
cold_policy_demangled = subprocess.check_output(['xcrun','swift-demangle'],input='\n'.join(cold_policy_symbols),text=True).splitlines()
for entry,line in zip(cold_policy_entries,cold_policy_demangled):
    if f'UIElementAttribute.{entry[3]} : ' not in line:
        raise SystemExit('Cold-cache attribute symbol changed')
cold_policy_words = {
    0x100765b80:0x97fe4003, 0x100765be8:0x97fffd98,
    0x100766098:0x97fe45c9, 0x10076609c:0xb40007f5,
    0x1007660e4:0x14000036, 0x1007661a8:0xb5fffbb8,
    0x100766158:0xd2800004,
}
for site,word in cold_policy_words.items():
    if struct.unpack('<I',read_virtual(site,4))[0] != word:
        raise SystemExit('Cold-cache collection/failure branch changed')
element_cache_evidence['coldConstruction'] = {
    'functions':[{'start':hex(address),'endExclusive':hex(starts[starts.index(address)+1]),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,starts[starts.index(address)+1]-address)).hexdigest()}
        for address in [0x100764678,0x100764ba4,0x100765248,0x1007653f8,0x100765844,0x10076589c]],
    'baseAttributeInitializer':'0x100764678','baseAttributeStorage':'0x1015ca8a8',
    'baseAttributes':[{'name':name,'symbolAddress':hex(slot),'loadAddressInstruction':hex(site),'word':hex(word)} for site,word,slot,name in cold_policy_entries],
    'additionalPolicyInitializer':'0x100764ba4','additionalPolicyStorage':'0x1015ca8b0',
    'instructionWords':{hex(site):hex(word) for site,word in cold_policy_words.items()},
    'interpretation':'Cold collection reads supported names, constructs a set, and combines it with a 20-attribute base set before additional policy and insertion passes. Batch failure returns an empty attribute dictionary with supported names retained and skips fallback cache insertion; successful batch or empty request may enter the fallback write path when transaction storage exists.',
    'limitations':'The base set is not the final request list. Selection is further decoded in coldSelectionPolicy; process identity acquisition, MockProvider, set traversal ordering and full construction remain separate.',
}
cold_selection_words = {
    0x1006eda6c:0x52800020, 0x1006eda90:0x52800000,
    0x100765f78:0x36000194, 0x100765f88:0x97fe1e6a,
    0x100765874:0x97fe202f, 0x100765fe4:0x97fffe18,
    0x100765ffc:0x97fffe12, 0x1007667ac:0xf1000eff,
    0x1007668d4:0x17ffffb5,
}
for site,word in cold_selection_words.items():
    if struct.unpack('<I',read_virtual(site,4))[0] != word:
        raise SystemExit('Cold selection insertion or iteration changed')
if c_string(0x101256260) != 'com.kishanbagaria.jack':
    raise SystemExit('Cold selection app identifier changed')
if c_string(0x101368aa8) != 'bundleIdentifier' or c_string(0x10136c892) != 'runningApplicationWithProcessIdentifier:':
    raise SystemExit('Cold selection application identity selectors changed')
element_cache_evidence['coldSelectionPolicy'] = {
    'functions':[{'start':hex(address),'endExclusive':hex(starts[starts.index(address)+1]),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,starts[starts.index(address)+1]-address)).hexdigest()}
        for address in [0x1006ed930,0x100764d48,0x1007666ec,0x100766448,0x100194fc8,0x10079c688,0x10079cb08]],
    'instructionWords':{hex(site):hex(word) for site,word in cold_selection_words.items()},
    'additionalAttribute':'AXDOMClassList','additionalAttributeSymbol':'0x1015cacf8',
    'bundleIdentifier':'com.kishanbagaria.jack','bundleLiteral':'0x101256260',
    'visibleGroup':['visibleRows','visibleChildren'],
    'selectedGroup':['selectedRows','selectedCells','selectedChildren'],
    'interpretation':'Start with supported/base intersection; insert supported DOM class list only on exact bundle identifier match. Insert every supported visible and selected group member. Identity lookup is guarded by DOM attribute support. The helper at 0x1006ed930 inserts, returning true for new membership and false for existing membership; it does not remove.',
    'correction':'Earlier coldConstruction notes called these later passes removal; instruction follow-through proves insertion.',
    'limitations':'Selection helper accepts an identity resolver; original provider/system identity acquisition and full transaction construction are not implemented by it.',
}
multiple_attribute_functions=[]
for address,name in [(0x1006f77bc,'throwing batch branch'),(0x1006f798c,'attribute-to-name and dictionary adapter'),(0x1006fa640,'system batch read'),(0x1006fb558,'ordered batch dictionary mapping')]:
    boundary=starts[starts.index(address)+1]
    multiple_attribute_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
if struct.unpack('<ii',read_virtual(0x101570bf8,8))!=(-25212,-25205):
    raise SystemExit('AX batch permitted status constants changed')
for slot,binding in [('0x10151ef18','CoreFoundation/_OBJC_CLASS_$_NSNull'),('0x1014688f8','libswiftCore/_$syXlN')]:
    if binding not in next((line for line in fixups.splitlines() if slot in line.lower()),''):
        raise SystemExit('AX batch object type binding changed')
multiple_attribute_calls=[(0x1006fa720,0x1011538d0,'_AXUIElementCopyMultipleAttributeValues'),
    (0x1006fb648,0x10115396c,'_AXValueGetTypeID'),(0x1006fb678,0x101153960,'_AXValueGetType'),
    (0x1006fb6a8,0x101153978,'_AXValueGetValue')]
for site,stub,symbol in multiple_attribute_calls:
    word=struct.unpack('<I',read_virtual(site,4))[0]
    immediate=word & 0x3ffffff
    if immediate & 0x2000000: immediate-=0x4000000
    if word>>26!=0b100101 or site+immediate*4!=stub or indirect.get(stub)!=symbol:
        raise SystemExit('AX batch system call changed')
multiple_attribute_words={
    0x1006fa678:0xf8010edf,0x1006fa718:0x52800002,
    0x1006fa7f8:0xb4000040,0x1006fa7fc:0x340000b4,0x1006fa808:0xd2800001,
    0x1006fb608:0x540019e2,0x1006fb638:0xb5000880,
    0x1006fb67c:0x7100141f,0x1006fb684:0xb9002bff,
    0x1006fb6b8:0x128c4f69,0x1006fb6c4:0x128c4e89,
    0x1006fb6c0:0x54000480,0x1006fb6cc:0x54000420,0x1006fb6d0:0x34000408,
    0x1006fb740:0x94002504,0x1006fb808:0xf9000118,
    0x1006fb944:0xd4200020,
}
for address,word in multiple_attribute_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0]!=word:
        raise SystemExit('AX batch status, mapping or bounds branch changed')
multiple_attribute_evidence={
    'functions':multiple_attribute_functions,'calls':[{'site':hex(c),'stub':hex(st),'symbol':sy} for c,st,sy in multiple_attribute_calls],
    'instructionWords':{hex(a):hex(w) for a,w in multiple_attribute_words.items()},
    'permittedOverallStatuses':[0,-25212,-25205],'options':0,
    'interpretation':'Raw system failure discards the output array; success requires a non-nil AnyObject array for mapping. Mapping indexes each requested attribute, retains NSNull and ordinary objects, keeps AXError success/noValue/attributeUnsupported values, and removes the key for other AXError values. Duplicate keys are processed in order; shorter output traps and extra output is unused.',
    'limitations':'Restores the non-MockProvider system pipeline; not provider overrides, truncation generation, transaction assembly or production UI integration.',
}
frequency_nominal=0x1012ccd50
frequency_fields=relative_address(frequency_nominal+16)
_,_,frequency_kind,frequency_size,frequency_count=struct.unpack('<iiHHI',read_virtual(frequency_fields,16))
if (frequency_kind,frequency_size,frequency_count) != (0,12,1) or c_string(relative_address(frequency_fields+24)) != 'metricToFrequency' or c_string(relative_address(frequency_fields+20)) != 'SDyxSiG':
    raise SystemExit('FrequencyTable dictionary storage changed')
frequency_functions=[]
for address,name in [(0x1006e6be4,'init'),(0x100757414,'increment'),(0x10075751c,'subscript'),(0x100757558,'isUnique')]:
    boundary=starts[starts.index(address)+1]
    frequency_functions.append({'name':name,'start':hex(address),'endExclusive':hex(boundary),
        'machineCodeSha256':hashlib.sha256(read_virtual(address,boundary-address)).hexdigest()})
frequency_words={0x10075748c:0x36000108,0x1007574a4:0x52800028,
    0x1007574c4:0xb1000728,0x1007574c8:0x54000286,0x100757518:0xd4200020,
    0x100757548:0x9a8813e0,0x100757580:0xf100051f,
    0x100757584:0x1a9f17e8,0x100757588:0x0a290100}
for address,word in frequency_words.items():
    if struct.unpack('<I',read_virtual(address,4))[0] != word: raise SystemExit('Frequency count/uniqueness branch changed')
if c_string(relative_address(0x1012cd598+8)) != 'UIElementRole': raise SystemExit('Transaction role metric changed')
frequency_evidence={
    'nominalDescriptor':hex(frequency_nominal),'fieldDescriptor':hex(frequency_fields),
    'storage':'metricToFrequency: [Metric: Int]','storageMangledType':'SDyxSiG',
    'functions':frequency_functions,'instructionWords':{hex(a):hex(w) for a,w in frequency_words.items()},
    'transactionMetric':'UIElementRole','metricDescriptor':'0x1012cd598',
    'interpretation':'Dictionary-backed value type; missing subscript is zero, increment initializes to one or uses checked addition, isUnique requires a present count equal to one.',
    'limitations':'Counter behavior only; role collection, transaction creation and cache invalidation are not reconstructed by this helper.',
}
error_nominal = 0x1012cd360
error_fields = relative_address(error_nominal+16)
_,_,error_kind,error_size,error_count = struct.unpack('<iiHHI',read_virtual(error_fields,16))
if (error_kind,error_size,error_count) != (3,12,5):
    raise SystemExit('UIElementError layout changed')
error_cases=[]
for index in range(error_count):
    field = error_fields+16+index*error_size
    payload = relative_address(field+4)
    if index == 0:
        if read_virtual(payload,1) != b'\x01': raise SystemExit('Expected symbolic AXError payload')
        target = relative_address(payload+1)
        payload_name = c_string(relative_address(target+8))
    else:
        payload_name = c_string(payload) if payload else None
    error_cases.append({'name':c_string(relative_address(field+8)),'payload':payload_name})
if error_cases != [
    {'name':'axError','payload':'AXError'},
    {'name':'unexpectedAttributeValueType','payload':'ypXp8expected_ypXp6actualt'},
    {'name':'failedToUnwrapAttributeValue','payload':'ypXp'},
    {'name':'failedInit','payload':'SS'},
    {'name':'failedToWrapAXValue','payload':None},
]: raise SystemExit('UIElementError payloads changed')
error_evidence = {
    'nominalDescriptor':hex(error_nominal),'fieldDescriptor':hex(error_fields),'cases':error_cases,
    'noValueComparison':'0x1006e9a80..0x1006e9a88',
    'noValueRawCode':-25212,
    'conditionalFailureHelper':{'start':'0x1006e9d38','endExclusive':'0x1006e9d90','machineCodeSha256':hashlib.sha256(read_virtual(0x1006e9d38,0x58)).hexdigest()},
    'limitations':'Recovered enum and local branches; full error-routing algorithm and transport mapping remain incomplete.',
}
record = {
    'artifact':'@oai/'+relative,
    'sha256':sha,
    'evidenceKind':'exported Swift symbols and bounded ARM64 call-site/basic-block evidence',
    'commands':['nm -g <artifact>', 'xcrun swift-demangle', 'xcrun llvm-objdump --macho --function-starts=addrs <artifact>', 'xcrun llvm-objdump --macho --indirect-symbols <artifact>', 'xcrun llvm-objdump --disassemble --start-address=<start> --stop-address=<end> <artifact>'],
    'implementationEvidence':implementation_evidence,
    'callerEvidence':caller_evidence,
    'presentationEvidence':presentation_evidence,
    'selectionEvidence':selection_evidence,
    'attributeEvidence':attribute_evidence,
    'decodingEvidence':decoding_evidence,
    'errorEvidence':error_evidence,
    'markerDecodingEvidence':marker_evidence,
    'parameterEncodingEvidence':parameter_evidence,
    'ordinaryValueDecodingEvidence':ordinary_evidence,
    'axValueUnpackingEvidence':unpack_evidence,
    'axValueDecodingEvidence':axvalue_decode_evidence,
    'axUIElementDecodingEvidence':element_evidence,
    'rawAttributeEvidence':raw_attribute_evidence,
    'valueDescriptorEvidence':value_descriptor_evidence,
    'partialArrayEvidence':partial_array_evidence,
    'arrayTransformEvidence':array_transform_evidence,
    'arrayTargetEvidence':array_target_evidence,
    'elementStorageEvidence':element_storage_evidence,
    'transactionScopeEvidence':transaction_scope_evidence,
    'transactionCacheEvidence':transaction_cache_evidence,
    'elementCacheEvidence':element_cache_evidence,
    'attributeNamesEvidence':attribute_names_evidence,
    'encodedStorageEvidence':encoded_storage_evidence,
    'multipleAttributeEvidence':multiple_attribute_evidence,
    'frequencyTableEvidence':frequency_evidence,
    'limitations':[
        'No native service executed and no macOS UI observed.',
        'Symbol types establish native Swift ownership and API boundaries only.',
        'No claim about diff algorithm, element identity stability, line budget values or exact output formatting.',
    ],
    'symbols':rows,
}
output = Path(__file__).resolve().parent.parent/'reconstruction/desktop-diff-evidence.json'
text = json.dumps(record, ensure_ascii=False, indent=2)+'\n'
if args.check:
    if output.read_text() != text:
        raise SystemExit('Desktop diff evidence differs; review changes')
else:
    output.write_text(text)
print(('Checked' if args.check else 'Recorded')+f' {len(rows)} native Swift signatures; sha256={sha}')
