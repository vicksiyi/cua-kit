from pathlib import Path
import struct
p=Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService')
data=p.read_bytes();segments=[];offset=32
for _ in range(struct.unpack_from('<I',data,16)[0]):
 command,size=struct.unpack_from('<II',data,offset)
 if command==0x19:
  _,address,_,fo,fs=struct.unpack_from('<16sQQQQ',data,offset+8);segments.append((address,address+fs,fo))
 offset+=size
def read(address,size):
 for low,high,fo in segments:
  if low<=address and address+size<=high:return data[fo+address-low:fo+address-low+size]
 raise ValueError(hex(address))
def rel(address):
 n=struct.unpack('<i',read(address,4))[0];return address+n if n else None
import hashlib
assert hashlib.sha256(data).hexdigest()=='b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862'
def array(a):
 n=struct.unpack('<Q',read(a+16,8))[0]
 return list(struct.unpack('<'+'Q'*n,read(a+32,8*n)))
def fmt(xs):return '['+', '.join(f'0x{x:016x}' for x in xs)+']'
base=0x101558000
s='''// Extracted from the pinned native image, initializers 0x10025587c and 0x100255bac.
// These salts are static hash suffixes, not credentials.
struct AccessibilitySPISymbolRequest {
    let images: [UInt64]
    let symbols: [[UInt64]]
    let salt: String
}
extension AccessibilitySPISymbolRequest {
'''
for name,off,rows,saltaddr,length in [('functions',0x368,[0x480,0x4b8,0x4f0],0x100255000+4085*4096+0xba0,126),('keys',0x528,[0x640,0x678,0x6b0,0x6e8,0x720,0x758,0x790],0x100255000+4085*4096+0xb10,128)]:
 s+=f'    static let {name} = Self(\n        images: {fmt(array(base+off))},\n        symbols: [\n'
 s+=',\n'.join('            '+fmt(array(base+x)) for x in rows)
 s+=f'\n        ],\n        salt: "{read(saltaddr,length).decode()}")\n'
s+='}\n'
target = Path(__file__).resolve().parents[1] / 'native/macos/Sources/CuaHelper/AccessibilitySPISymbolRequest.swift'
assert target.read_text() == s, 'Accessibility SPI requests differ from pinned native constants'
print('Accessibility SPI request arrays and salts match pinned native binary')
