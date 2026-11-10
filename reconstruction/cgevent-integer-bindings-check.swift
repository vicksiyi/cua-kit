import CoreGraphics
import Darwin
import SoftLink
import SystemSoftware

@main struct Check {
    static func main() {
        let salt = "3e3620cc4cff760dc38fef685cf2770ee43e82b63184fc673eccf905946e571bae3e8fc88de78e4346acc115d89e57065b9bcffa4e1d3d83359e7ae89f25ffa2"
        let images: [UInt64] = [45203785905955878, 33030281226198715, 28887241548451946, 25254555559700725, 59104161600983147]
        let requests: [[UInt64]] = [[12085573244964661136, 13885387025536599614], [12908338100711025268, 8501186766256844693], [9101501967923155813, 2021992665345162458], [15136731565474051096, 15950885505103196345], [11573865447017070966, 2046736444292536735], [715733483935103253, 7453306279040795511], [14644888189928612547, 6846715860166969083], [3041962744595550746, 17502350281230928002], [7998587530568280128, 6777714385144974053], [13284433732615680104, 12097086909407612838], [3412250559218014418, 515748703821716389], [17494933638082377763, 14574923564221286939], [8393011571518944784, 15907488628653805903], [2844386500317234606, 897422384882979594], [8857174769304233849, 14905676178856017389], [4644952546955357956, 18026697562662742868], [13339156367070022580, 8348509398777649895], [7920427443058321478, 9384421112932649904], [8335273738061356809, 18188963680098250757], [687012599558045703, 13933114793508381093], [362507202976639045, 3328080166060652613], [14032231016170269178, 10053795148418920503], [1392259184419751691, 16865008572586706238], [12825081817769450494, 236504384405875586]]
        for (slot, name) in [(4, "CGEventGetIntegerValueField"), (14, "CGEventSetIntegerValueField")] {
            for (priority, candidate) in [("_" + name), name].enumerated() {
                let hash = Array(candidate.utf8).withUnsafeBufferPointer { bytes in
                    Array(salt.utf8).withUnsafeBufferPointer { sipHash(buffer: bytes, appending: $0) }
                }
                precondition(hash == requests[slot][priority])
            }
        }
        let resolved = lookUpBatchSymbolPointers(images: images, symbolRequests: requests, salt: salt)
        for (slot, name) in [(4, "CGEventGetIntegerValueField"), (14, "CGEventSetIntegerValueField")] {
            let expected = dlsym(UnsafeMutableRawPointer(bitPattern: -2), name)!
            precondition(resolved[slot].pointer == UnsafeRawPointer(expected))
            print("Original slot \(slot) resolves \(resolved[slot].name ?? "nil"); pointer equals system \(name)")
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
            print("Original-request system binding scroll field \(raw): requested123 retained\(get(event, field))")
        }
    }
}
