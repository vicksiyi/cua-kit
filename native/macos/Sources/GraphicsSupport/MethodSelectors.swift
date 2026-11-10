import SoftLink
import ObjectiveC
import Darwin

// Native GraphicsSupport selector resolver 0x101030b2c: inspect each class's
// own method list, hash selector C bytes plus salt, then walk superclasses.
public func lookUpMethodSelector(in initialClass: AnyClass, hash requested: UInt64, salt: String) -> Selector? {
    let suffix = Array(salt.utf8)
    func find(in cls: AnyClass) -> Selector? {
        var count: UInt32 = 0
        guard let methods = class_copyMethodList(cls, &count) else { return nil }
        defer { free(methods) }
        for index in 0..<Int(count) {
            let selector = method_getName(methods[index])
            let name = sel_getName(selector)
            let digest = suffix.withUnsafeBufferPointer {
                sipHash(bytes: UnsafeRawPointer(name).assumingMemoryBound(to: UInt8.self),
                    count: strlen(name), appending: $0)
            }
            if digest == requested { return selector }
        }
        return nil
    }
    var current: AnyClass? = initialClass
    while let cls = current {
        if let selector = find(in: cls) { return selector }
        current = class_getSuperclass(cls)
    }
    return nil
}
