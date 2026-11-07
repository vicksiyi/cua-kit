import Darwin

/// Name handling recovered from 0x10024cc7c..<0x10024ce2c.
/// Try the full repaired name first, then remove one leading underscore.
func resolveReexport(_ bytes: [UInt8], lookup: (String) -> UnsafeRawPointer?) -> UnsafeRawPointer? {
    let name = String(decoding: bytes, as: UTF8.self)
    if let pointer = lookup(name) { return pointer }
    guard name.first == "_" else { return nil }
    return lookup(String(name.dropFirst()))
}

func resolveReexport(_ bytes: [UInt8]) -> UnsafeRawPointer? {
    // The native path opens the current process with RTLD_LAZY for each lookup;
    // there is no dlclose in that branch. Do not unload a symbol's backing image.
    guard let handle = dlopen(nil, RTLD_LAZY) else { return nil }
    return resolveReexport(bytes) { name in
        name.withCString { dlsym(handle, $0).map(UnsafeRawPointer.init) }
    }
}
