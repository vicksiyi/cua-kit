import ApplicationServices

// Restored storage boundary, not yet the refetch algorithms. Native initializer
// 0x10022e5e4 simply stores the selection and diffing flag; although declared
// throwing, its body does not create observers or fetch any AX state.
final class RefetchableSkyshotAXTree {
    // Reflection descriptor0x1012c16f4 / fields0x10131a818: one Int
    // payload and five empty cases, in source case order.
    enum Error: Swift.Error {
        case invalidElementID(Int)
        case noInvalidationMonitorProvided
        case elementAmbiguousBeforeRefetch
        case elementAmbiguousAfterRefetch
        case elementNoLongerValid
        case elementNoLongerValidAfterRefetch
    }

    var systemSelection: SystemSelection
    let isAXTreeDiffingEnabled: Bool

    init(systemSelection: SystemSelection, isAXTreeDiffingEnabled: Bool) throws {
        self.systemSelection = systemSelection
        self.isAXTreeDiffingEnabled = isAXTreeDiffingEnabled
    }

    // 0x10022e5a0 reads the current selection each time, not a cached window.
    var applicationWindow: ApplicationWindow { systemSelection.applicationWindow }
}

extension RefetchableSkyshotAXTree {
    // Source0x10022e910: a missing monitor is an error, not an empty state.
    // The complete refetch body remains an explicit dependency.
    // Validation reads the raw AX provider, bypassing cached AXRole values.
    func refetchElementIfNeeded(_ element: any UIElementProtocol,
        validateElement: Bool, ignoreValueChange: Bool,
        missingMonitorError: () -> any Swift.Error = { Error.noInvalidationMonitorProvided },
        invalidElementError: () -> any Swift.Error = { Error.elementNoLongerValid },
        readRoleError: (AXUIElement) -> AXError = { $0.value(for: UIElementAttribute("AXRole")).error },
        refetch: (any UIElementProtocol, Bool) throws -> RefetchableUIElement
    ) throws -> RefetchableUIElement {
        try resolveRefetchableElement(element,
            validateElement: validateElement, ignoreValueChange: ignoreValueChange,
            invalidationState: {
                guard let monitor = self.systemSelection.invalidationMonitor else {
                    throw missingMonitorError()
                }
                return monitor.invalidationStateSnapshot()
            }, identity: { $0.axElement }, refetch: refetch,
            readRoleError: { readRoleError($0.axElement) },
            invalidElementError: invalidElementError,
            wrap: { RefetchableUIElement(element: $0, containingTree: self) })
    }
}

extension RefetchableSkyshotAXTree {
    // Native0x10022e6b4 resolves the current revision's rendered ID table,
    // not array index arithmetic. Missing IDs fail before monitor validation.
    func refetchElementIfNeeded(_ id: Int, validateElement: Bool,
        readRoleError: (AXUIElement) -> AXError = { $0.value(for: UIElementAttribute("AXRole")).error },
        refetch: (any UIElementProtocol, Bool) throws -> RefetchableUIElement
    ) throws -> RefetchableUIElement {
        guard let item = systemSelection.windowRevision.item(for: id) else {
            throw Error.invalidElementID(id)
        }
        return try refetchElementIfNeeded(item.element, validateElement: validateElement,
            ignoreValueChange: false, readRoleError: readRoleError, refetch: refetch)
    }
}

extension RefetchableSkyshotAXTree {
    // Final publication boundary of native refetchTree0x1002311f0..123c.
    // Extraction is still explicit until the complete native extractor is
    // restored. A thrown extraction never assigns a replacement selection.
    @discardableResult
    func refetchTree(extract: () throws -> SystemSelection) throws -> SystemSelection {
        let selection = try extract()
        systemSelection = selection
        return systemSelection
    }
}
