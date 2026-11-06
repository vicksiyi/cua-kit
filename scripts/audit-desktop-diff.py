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
for low,high in [(0x1006298a8,0x1006298bc),(0x1006298fc,0x10062993c),(0x10062b6ec,0x10062b708)]:
    excerpts.append([{'address':hex(address), **instructions[address]} for address in range(low,high,4)])
implementation_evidence = {
    'function':diff['signature'], 'start':hex(start), 'endExclusive':hex(end),
    'boundarySource':'LC_FUNCTION_STARTS', 'instructionCount':len(instructions),
    'machineCodeSha256':hashlib.sha256(body).hexdigest(),
    'renderTreeSnapshotCalls':calls,
    'removedElementPrefix':{'address':hex(prefix_address),'text':prefix[:-1].decode()},
    'reviewedInstructionExcerpts':excerpts,
    'scope':'Static call sites and basic blocks only; traversal, budget and identity rules remain unrecovered.',
}
record = {
    'artifact':'@oai/'+relative,
    'sha256':sha,
    'evidenceKind':'exported Swift symbols and bounded ARM64 call-site/basic-block evidence',
    'commands':['nm -g <artifact>', 'xcrun swift-demangle', 'xcrun llvm-objdump --macho --function-starts=addrs <artifact>', 'xcrun llvm-objdump --disassemble --start-address=<start> --stop-address=<end> <artifact>'],
    'implementationEvidence':implementation_evidence,
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
