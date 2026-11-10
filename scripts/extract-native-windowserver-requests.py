#!/usr/bin/env python3
"""Extract pinned WindowServer symbol requests; does not execute vendor code."""
import runpy,contextlib,io,struct,json,hashlib
from pathlib import Path
with contextlib.redirect_stdout(io.StringIO()): audit=runpy.run_path('scripts/audit-native-mouse-dispatch.py')
r=audit['read']
def arr(addr):
 n=struct.unpack('<Q',r(addr+16,8))[0]
 return list(struct.unpack('<'+'Q'*n,r(addr+32,n*8)))
def string(addr): return r(addr,150).split(b'\0')[0].decode()
requests=[('functions',0x101559258,[0x1015592a8+i*0x38 for i in range(13)],0x10124b7d0),('disableUpdate',0x10155a960,[0x10155a9b0],0x10124b740),('reenableUpdate',0x10155a9e8,[0x10155aa38],0x10124b6c0)]
# derive string VAs from the inspected adrp pairs (page + signed page delta).
requests[0]=(*requests[0][:3],(0x10026c244&~4095)+4063*4096+0x7d0)
requests[1]=(*requests[1][:3],(0x10026dfcc&~4095)+4062*4096+0x740)
requests[2]=(*requests[2][:3],(0x10026e058&~4095)+4061*4096+0x6c0)
requests.append(('captureWindowImagesInRect',
    (0x10026db48&~4095)+4845*4096+0x520,
    [(0x10026db58&~4095)+4845*4096+0x570],
    (0x10026db6c&~4095)+4062*4096+0x630))
source='// Extracted from pinned native WindowServerSPI initializers.\nstruct WindowServerSPISymbolRequest {\n    let images: [UInt64]\n    let symbols: [[UInt64]]\n    let salt: String\n'
evidence=[]
for name,images,symbols,salt in requests:
 i=arr(images);ss=[arr(v) for v in symbols];st=string(salt)
 source+=f'    static let {name} = Self(images: [{", ".join(hex(v) for v in i)}],\n        symbols: [{", ".join("["+", ".join(hex(v) for v in row)+"]" for row in ss)}],\n        salt: "{st}")\n'
 evidence.append(dict(name=name,imagesVA=hex(images),symbolsVA=list(map(hex,symbols)),saltVA=hex(salt),images=i,symbols=ss,salt=st))
source+='}\n'
Path('native/macos/Sources/SystemSoftware/WindowServerSPISymbolRequest.swift').write_text(source)
Path('reconstruction/native-windowserver-symbol-evidence.json').write_text(json.dumps({'binarySha256':hashlib.sha256(audit['args'].binary.read_bytes()).hexdigest(),'requests':evidence},indent=2)+'\n')
