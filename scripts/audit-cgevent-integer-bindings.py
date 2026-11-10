#!/usr/bin/env python3
"""Extract pinned request arrays and emit owned SoftLink verification fixture."""
import ast, contextlib, hashlib, io, json, pathlib, re, runpy, struct
root=pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit=runpy.run_path(str(root/'scripts/audit-native-mouse-dispatch.py'))
read=audit['read']
def array(address):
    count=struct.unpack('<Q',read(address+16,8))[0]
    assert count<100
    return list(struct.unpack('<'+'Q'*count,read(address+32,count*8)))
images=array(0x101558cc8); requests=[array(0x101558d18+index*56) for index in range(24)]
assert len(images)==5 and all(len(values)==2 for values in requests)
saltAddress=(0x1002576c0 & ~4095)+4083*4096+0xcf0
salt=read(saltAddress,128).decode(); assert all(c in '0123456789abcdef' for c in salt)
production=(root/'native/macos/Sources/SystemSoftware/CGEventAPISymbolRequest.swift').read_text()
assert json.loads(re.search(r'static let salt = ("[^"]+")',production)[1]) == salt
assert ast.literal_eval(re.search(r'static let images: \[UInt64\] = (\[[^\n]+\])',production)[1]) == images
assert ast.literal_eval(re.search(r'static let symbols: \[\[UInt64\]\] = (\[.*?\n    \])',production,re.S)[1]) == requests
report={'binarySha256':hashlib.sha256(audit['data']).hexdigest(),
'initializer':'0x100257348','saltVA':hex(saltAddress),'salt':salt,
'imagesVA':'0x101558cc8','images':images,'requestsVA':'0x101558d18 stride56','requests':requests,
'setIntegerSlot':14,'getIntegerSlot':4,
'limits':['Owned restored SoftLink fixture resolves system images only; never executes original service','Integer,8 scalar and4 create binding identities are checked; other10 entries are not claimed restored']}
(root/'reconstruction/cgevent-integer-binding-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
source='''import CoreGraphics
import Darwin
import SoftLink
import SystemSoftware

@main struct Check {
    static func main() {
        let salt = SALT
        let images: [UInt64] = IMAGES
        let requests: [[UInt64]] = REQUESTS
        for (slot, name) in [(4, "CGEventGetIntegerValueField"), (14, "CGEventSetIntegerValueField"), (3, "CGEventGetFlags"), (13, "CGEventSetFlags"), (5, "CGEventGetLocation"), (15, "CGEventSetLocation"), (6, "CGEventGetTimestamp"), (16, "CGEventSetTimestamp"), (7, "CGEventGetType"), (17, "CGEventSetType"), (0, "CGEventCreate"), (1, "CGEventCreateKeyboardEvent"), (2, "CGEventCreateScrollWheelEvent2"), (18, "CGEventSourceCreate")] {
            for (priority, candidate) in [("_" + name), name].enumerated() {
                let hash = Array(candidate.utf8).withUnsafeBufferPointer { bytes in
                    Array(salt.utf8).withUnsafeBufferPointer { sipHash(buffer: bytes, appending: $0) }
                }
                precondition(hash == requests[slot][priority])
            }
        }
        let resolved = lookUpBatchSymbolPointers(images: images, symbolRequests: requests, salt: salt)
        for (slot, name) in [(4, "CGEventGetIntegerValueField"), (14, "CGEventSetIntegerValueField"), (3, "CGEventGetFlags"), (13, "CGEventSetFlags"), (5, "CGEventGetLocation"), (15, "CGEventSetLocation"), (6, "CGEventGetTimestamp"), (16, "CGEventSetTimestamp"), (7, "CGEventGetType"), (17, "CGEventSetType"), (0, "CGEventCreate"), (1, "CGEventCreateKeyboardEvent"), (2, "CGEventCreateScrollWheelEvent2"), (18, "CGEventSourceCreate")] {
            let expected = dlsym(UnsafeMutableRawPointer(bitPattern: -2), name)!
            precondition(resolved[slot].pointer == UnsafeRawPointer(expected))
            print("Original slot \\(slot) resolves \\(resolved[slot].name ?? "nil"); pointer equals system \\(name)")
        }
        typealias Setter = @convention(c) (CGEvent, CGEventField, Int64) -> Void
        typealias Getter = @convention(c) (CGEvent, CGEventField) -> Int64
        let set = unsafeBitCast(resolved[14].pointer!, to: Setter.self)
        let get = unsafeBitCast(resolved[4].pointer!, to: Getter.self)
        let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1,
            wheel1: -5, wheel2: 0, wheel3: 0)!
        for raw: UInt32 in [51, 91, 92] {
            let field = CGEventField(rawValue: raw)!
            set(event, field, 123)
            CGEventAPI.setIntegerValueField(event, field: field, value: 123)
            precondition(CGEventAPI.getIntegerValueField(event, field: field) == get(event, field))
            print("Original-request system binding scroll field \\(raw): requested123 retained\\(get(event, field))")
        }
    }
}
'''.replace('SALT',json.dumps(salt)).replace('IMAGES',str(images)).replace('REQUESTS',str(requests))
(root/'reconstruction/cgevent-integer-bindings-check.swift').write_text(source)
print('Pinned CGEvent request arrays/salt extracted; owned verification fixture emitted')
