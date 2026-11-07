import Foundation
import ApplicationServices

@main struct Test {
    static func main() {
        let getPID: AccessibilitySPIFunctions.GetActualPID = { _, output in
            output.pointee = 1234; return .success
        }
        let getWindow: AccessibilitySPIFunctions.GetWindowID = { _, output in
            output.pointee = 5678; return .cannotComplete
        }
        let copy: AccessibilitySPIFunctions.CopyHierarchy = { _, attributes, options, output in
            precondition(CFArrayGetCount(attributes) == 2)
            precondition(options == nil)
            if let output { output.pointee = Unmanaged.passRetained(["fixture": true] as CFDictionary) }
            return .failure
        }
        var resolutions = 0
        let functions = AccessibilitySPIFunctions(resolve: { request in
            resolutions += 1
            precondition(request.images.count == 30 && request.symbols.count == 3)
            precondition(request.symbols.allSatisfy { $0.count == 2 } && request.salt.utf8.count == 126)
            precondition(request.symbols[0] == [0x1e94ed0f70010e44, 0x2a01ed0fb5ba3b71])
            return [unsafeBitCast(getPID, to: UnsafeRawPointer.self),
                    unsafeBitCast(getWindow, to: UnsafeRawPointer.self),
                    unsafeBitCast(copy, to: UnsafeRawPointer.self)]
        })
        let element = AXUIElementCreateApplication(getpid())
        var pid: Int32 = 0, window: UInt32 = 0
        precondition(functions.getActualPID(element, &pid) == .success && pid == 1234)
        precondition(functions.getWindowID(element, &window) == .cannotComplete && window == 5678)
        var output: Unmanaged<CFDictionary>?
        let attributes = ["one", "two"] as CFArray
        precondition(functions.copyHierarchy(element, attributes, nil, &output) == .failure)
        precondition((output!.takeRetainedValue() as NSDictionary)["fixture"] as? Bool == true)
        precondition(functions.copyHierarchy(element, attributes, nil, nil) == .failure)
        precondition(resolutions == 1)

        let strings: [CFString] = (0..<7).map { "key-\($0)" as CFString }
        let storage = UnsafeMutablePointer<UnsafeRawPointer?>.allocate(capacity: 7)
        defer { storage.deinitialize(count: 7); storage.deallocate() }
        for index in 0..<7 {
            storage.advanced(by: index).initialize(to: UnsafeRawPointer(Unmanaged.passUnretained(strings[index]).toOpaque()))
        }
        let keys = AccessibilitySPIKeys(resolve: { request in
            precondition(request.images.count == 30 && request.symbols.count == 7)
            precondition(request.symbols.allSatisfy { $0.count == 2 } && request.salt.utf8.count == 128)
            precondition(request.symbols[6] == [0x77f7f4622292307c, 0xaf3d45c6a921ce57])
            return (0..<7).map { UnsafeRawPointer(storage.advanced(by: $0)) }
        })
        let actual = [keys.skipInspectionForAttributes, keys.arrayAttributes, keys.truncateStrings,
                      keys.maxArrayCount, keys.resultValue, keys.resultCount, keys.incompleteResult]
        for index in 0..<7 { precondition(CFEqual(actual[index], strings[index])) }
        print("Accessibility SPI function ABI and global key indirection passed")
    }
}
