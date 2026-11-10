#!/usr/bin/env python3
"""Pinned Objective-C class metadata/Carbon algorithm evidence; no vendor execution."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root=pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit=runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
read=audit['read']
def q(address):return struct.unpack('<Q',read(address,8))[0]
def pointer(address):return 0x100000000+(q(address)&0xffffffff)
def text(address):return read(address,160).split(b'\0')[0].decode()
def methods(ro):
    address=pointer(ro+32);flags,count=struct.unpack('<II',read(address,8));result={}
    assert flags==0x8000000c
    for i in range(count):
        entry=address+8+i*12
        name=entry+struct.unpack('<i',read(entry,4))[0]
        if not flags&0x40000000:name=pointer(name)
        imp=entry+8+struct.unpack('<i',read(entry+8,4))[0]
        result[text(name)]=hex(imp)
    return result
ro=0x101527a20
assert text(pointer(ro+24))=='SAIVirtualKeyPress'
assert struct.unpack('<I',read(ro+8,4))[0]==24
instance=methods(ro)
assert instance['initWithKeyCode:modifiers:string:']=='0x100245684'
metaRO=pointer(pointer(0x101546be0)+32)&~7
classMethods=methods(metaRO)
assert classMethods=={'keyPressesForString:':'0x100245724'}
ivarList=pointer(ro+48);stride,count=struct.unpack('<II',read(ivarList,8));assert stride==32 and count==3
ivars=[]
for i in range(count):
    entry=ivarList+8+i*stride
    ivars.append({'offset':struct.unpack('<I',read(pointer(entry),4))[0],'name':text(pointer(entry+8)),'type':text(pointer(entry+16))})
assert [(x['name'],x['offset']) for x in ivars]==[('_keyCode',8),('_modifiers',12),('_string',16)]
modifiers=list(struct.unpack('<8I',read(0x10116b358,32)))
assert modifiers==[0,0x200,0x800,0xa00,0x1000,0x1200,0x1800,0x1a00]
source=(root/'native/macos/Sources/RunningProcess/SAIVirtualKeyPress.m').read_text()
for address in [0x101248c34,0x101248c5b,0x101248c7f,0x101248ca6,0x101248cd0]:assert text(address) in source
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),'originalLanguage':'Objective-C','originalClass':'SAIVirtualKeyPress','classMethods':classMethods,'instanceMethods':instance,'instanceSize':24,'ivars':ivars,'modifierPriority':modifiers,'source':'native/macos/Sources/RunningProcess/SAIVirtualKeyPress.m','behavior':['Carbon TIS layout/property/bytes and LMGetKbdType reused,not reimplemented','Iterate NSString UTF16 units,LF->CR,8 modifier states xkey codes0...127','UCKeyTranslate display action3,options0,deadstate0 per attempt,max4 units; first translated unit match wins','Unmapped characters logged and skipped; missing layout returnsnil','Copy string in initializer; original value equality/description; no hash override added'],'limits':['RunningProcess is current reconstructed ObjC support target,not a proven original library module name','Swift type(string:) and key-event assembly not yet restored or connected','Current-layout check does not exhaust dead-key/layout/failure behavior','No vendor executable or actual input posting used']}
(root/'reconstruction/virtual-keypress-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
print('Original Objective-C virtual keypress metadata,layout,modifiers and diagnostic strings verified')
