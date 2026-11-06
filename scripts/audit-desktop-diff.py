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
    'selectedTextSSSgvg', 'selectedTextMarkerRange',
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
record = {
    'artifact':'@oai/'+relative,
    'sha256':sha,
    'evidenceKind':'exported Swift symbols and bounded ARM64 call-site/basic-block evidence',
    'commands':['nm -g <artifact>', 'xcrun swift-demangle', 'xcrun llvm-objdump --macho --function-starts=addrs <artifact>', 'xcrun llvm-objdump --disassemble --start-address=<start> --stop-address=<end> <artifact>'],
    'implementationEvidence':implementation_evidence,
    'callerEvidence':caller_evidence,
    'presentationEvidence':presentation_evidence,
    'selectionEvidence':selection_evidence,
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
