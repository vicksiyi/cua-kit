import Foundation
import ApplicationServices

/// Composition of 0x1006f7f2c: native copy, outer decoding and recursive rereads.
/// Dependencies preserve the native PID/mock and SPI boundaries for the owner.
struct AXHierarchyReader {
    let resolvePID: (AXUIElement) -> pid_t?
    let currentPID: () -> pid_t
    let isMainThread: () -> Bool
    let onMain: (() -> AXError) -> AXError
    let optionKeys: () -> AXHierarchyOptionKeys
    let resultKeys: () -> AXHierarchyResultKeys
    let incompleteResultKey: () -> String
    let decodeBoolean: (AnyObject) throws -> Bool?
    let copy: (AXUIElement, CFArray, CFDictionary, inout Unmanaged<CFDictionary>?) -> AXError

    func read(_ element: AXUIElement, arrayAttributes: [UIElementAttribute],
              requestedAttributes: [UIElementAttribute], maxChildCount: Int) -> AXHierarchyAttributeTable {
        // getpid precedes the element PID query in the observed call sequence.
        let ownPID = currentPID()
        let targetPID = resolvePID(element)
        let raw = copiedAXHierarchy(elementPID: targetPID, currentPID: ownPID,
            isMainThread: isMainThread, onMain: onMain, copy: { output in
                let options = axHierarchyOptions(requestedAttributes: requestedAttributes,
                    arrayAttributes: arrayAttributes, maxChildCount: maxChildCount, keys: optionKeys())
                return copy(element, requestedAttributes.map(\.name) as CFArray, options, &output)
            })
        guard let raw else { return [:] }
        return decodedAXHierarchy(raw, arrayAttributes: arrayAttributes.map { $0.name as CFString },
            resultKeys: resultKeys(), incompleteResultKey: incompleteResultKey(),
            decodeBoolean: decodeBoolean, reread: { child in
                read(child, arrayAttributes: arrayAttributes,
                     requestedAttributes: requestedAttributes, maxChildCount: maxChildCount)
            })
    }
}
