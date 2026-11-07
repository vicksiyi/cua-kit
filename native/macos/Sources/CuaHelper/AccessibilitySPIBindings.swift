import ApplicationServices

/// Native batch wrapper discards names while preserving every optional slot.
typealias AccessibilitySPISymbolResolver = (AccessibilitySPISymbolRequest) -> [UnsafeRawPointer?]

struct AccessibilitySPIFunctions {
    typealias GetActualPID = @convention(c) (AXUIElement, UnsafeMutablePointer<Int32>) -> AXError
    typealias GetWindowID = @convention(c) (AXUIElement, UnsafeMutablePointer<UInt32>) -> AXError
    typealias CopyHierarchy = @convention(c) (AXUIElement, CFArray, CFDictionary?,
        UnsafeMutablePointer<Unmanaged<CFDictionary>?>?) -> AXError
    let getActualPID: GetActualPID
    let getWindowID: GetWindowID
    let copyHierarchy: CopyHierarchy

    init(resolve: AccessibilitySPISymbolResolver) {
        let pointers = resolve(.functions)
        var index = 0
        // 0x10026b0f0 checks bounds, presence and representation size, then
        // copies the pointer bits and advances the shared binding index.
        func bind<T>(_ type: T.Type) -> T {
            precondition(index >= 0 && index < pointers.count)
            let pointer = pointers[index]!
            precondition(MemoryLayout<T>.size == MemoryLayout<UnsafeRawPointer>.size)
            let result = unsafeBitCast(pointer, to: type)
            index += 1
            return result
        }
        getActualPID = bind(GetActualPID.self)
        getWindowID = bind(GetWindowID.self)
        copyHierarchy = bind(CopyHierarchy.self)
    }
}

struct AccessibilitySPIKeys {
    let skipInspectionForAttributes: CFString
    let arrayAttributes: CFString
    let truncateStrings: CFString
    let maxArrayCount: CFString
    let resultValue: CFString
    let resultCount: CFString
    let incompleteResult: CFString

    init(resolve: AccessibilitySPISymbolResolver) {
        // 0x100255f34 dereferences all nonnil symbol addresses exactly once.
        // Each address points to global CFString storage, not the CFString.
        let values: [UnsafeRawPointer?] = resolve(.keys).map {
            $0?.load(as: UnsafeRawPointer?.self)
        }
        func key(_ index: Int) -> CFString {
            precondition(index < values.count)
            return Unmanaged<CFString>.fromOpaque(values[index]!).takeUnretainedValue()
        }
        skipInspectionForAttributes = key(0)
        arrayAttributes = key(1)
        truncateStrings = key(2)
        maxArrayCount = key(3)
        resultValue = key(4)
        resultCount = key(5)
        incompleteResult = key(6)
    }
}
