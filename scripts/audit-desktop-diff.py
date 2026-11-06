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
    'limitations':'TaskLocal payload semantics, cache population/invalidations and transaction lifetime are not recovered. This does not prove a process-global or per-PID cache, and an AX reference alone cannot stand in for the complete UIElement.',
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
