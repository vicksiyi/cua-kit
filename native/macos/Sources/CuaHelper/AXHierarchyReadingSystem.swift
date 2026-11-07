import Foundation
import ApplicationServices

extension AXHierarchyReader {
    /// Caller supplies the source-compatible PID resolver (including its mock
    /// branch); constructing this reader does not load SPI tables or read UI.
    static func system(resolvePID: @escaping (AXUIElement) -> pid_t?) -> Self {
        Self(resolvePID: resolvePID, currentPID: { getpid() },
             isMainThread: { Thread.isMainThread },
             onMain: { DispatchQueue.main.sync(execute: $0) },
             optionKeys: {
                 AXHierarchyOptionKeys(
                    skipInspectionForAttributes: AccessibilitySPI.copyHierarchySkipInspectionForAttributesKey,
                    arrayAttributes: AccessibilitySPI.copyHierarchyArrayAttributesKey,
                    truncateStrings: AccessibilitySPI.copyHierarchyTruncateStringsKey,
                    maxArrayCount: AccessibilitySPI.copyHierarchyMaxArrayCountKey)
             }, resultKeys: {
                 AXHierarchyResultKeys(value: AccessibilitySPI.copyHierarchyResultValueKey as String,
                                       count: AccessibilitySPI.copyHierarchyResultCountKey as String)
             }, incompleteResultKey: { AccessibilitySPI.copyHierarchyIncompleteResultKey as String },
             decodeBoolean: { try decodeAXBool($0, throwingOnFailure: false) },
             copy: { element, attributes, options, output in
                 AccessibilitySPI.copyHierarchy(element, attributes: attributes,
                    options: options, hierarchy: &output)
             })
    }
}
