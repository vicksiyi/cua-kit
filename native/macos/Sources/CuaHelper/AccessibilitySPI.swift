import ApplicationServices
import SoftLink

/// Independent Swift static initialization preserves the original two once
/// tokens: asking for a key does not initialize the function table, or vice versa.
enum AccessibilitySPI {
    private static func resolve(_ request: AccessibilitySPISymbolRequest) -> [UnsafeRawPointer?] {
        lookUpBatchSymbolPointers(images: request.images, symbolRequests: request.symbols,
                                  salt: request.salt).map(\.pointer)
    }
    private static let functions = AccessibilitySPIFunctions(resolve: resolve)
    private static let keys = AccessibilitySPIKeys(resolve: resolve)

    static func getActualPID(_ element: AXUIElement, pid: UnsafeMutablePointer<Int32>) -> AXError {
        functions.getActualPID(element, pid)
    }
    static func getWindowID(_ element: AXUIElement, identifier: UnsafeMutablePointer<UInt32>) -> AXError {
        functions.getWindowID(element, identifier)
    }
    static func copyHierarchy(_ element: AXUIElement, attributes: CFArray, options: CFDictionary?,
                              hierarchy: UnsafeMutablePointer<Unmanaged<CFDictionary>?>?) -> AXError {
        functions.copyHierarchy(element, attributes, options, hierarchy)
    }
    static var copyHierarchySkipInspectionForAttributesKey: CFString { keys.skipInspectionForAttributes }
    static var copyHierarchyArrayAttributesKey: CFString { keys.arrayAttributes }
    static var copyHierarchyTruncateStringsKey: CFString { keys.truncateStrings }
    static var copyHierarchyMaxArrayCountKey: CFString { keys.maxArrayCount }
    static var copyHierarchyResultValueKey: CFString { keys.resultValue }
    static var copyHierarchyResultCountKey: CFString { keys.resultCount }
    static var copyHierarchyIncompleteResultKey: CFString { keys.incompleteResult }
}
