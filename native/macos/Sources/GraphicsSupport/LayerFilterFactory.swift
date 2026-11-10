import Foundation
import QuartzCore
import ObjectiveC
import SoftLink

// Native GraphicsSupport bindings 0x10102a838..0x10102ab28 and 0x10103089c..
// 0x1010309b8. Keep selector discovery and the required message-send binding
// separate: missing class/selector returns nil, missing required function traps.
private enum LayerFilterFactory {
    static let filterClass: AnyClass? = NSClassFromString("CAFilter")
    static let selector: Selector? = {
        guard let cls = filterClass, let metaclass = object_getClass(cls) else { return nil }
        return lookUpMethodSelector(in: metaclass, hash: 0x51575c7f8a81acb0,
            salt: "215bb664fac94b9e50faca8106be4dd77fd37a73606ca79682e992187974d983dfa5a32ce4dcfa868a6f0f6b3485a79252e0a79fef79b22854f9a6bdc92d54b")
    }()
    typealias MessageSend = @convention(c) (AnyClass, Selector, NSString) -> Unmanaged<AnyObject>?
    static let messageSend: MessageSend = {
        let matches = lookUpBatchSymbolPointers(
            images: [0x02efd67f50396e76, 0x023f5c33484e6a09, 0x0201ae547159d0ad],
            symbolRequests: [[0xc01ddf872290b0ce, 0xbd275f37e7008392]],
            salt: "d3ada88f56dc505b982f68a138ed2f61c7b3138b191a59efde335469f0aeb8b1d60ae7e55a72783254289a2628565e3c3dbefd54e73268a3d2334086f8ca7c")
        guard let pointer = matches.first?.pointer else {
            preconditionFailure("Required GraphicsSupport filter factory function unavailable")
        }
        return unsafeBitCast(pointer, to: MessageSend.self)
    }()

    static func make(_ name: LayerFilter.Name) -> NSObject? {
        guard let cls = filterClass, let selector else { return nil }
        return messageSend(cls, selector, name.rawValue as NSString)?.takeUnretainedValue() as? NSObject
    }
}

extension LayerFilter.FilterConvertible {
    // Native 0x10102b32c: instantiate by name then apply every projected key.
    public func makeFilterInstance() -> NSObject? {
        makeFilterInstance(using: LayerFilterFactory.make)
    }
}
