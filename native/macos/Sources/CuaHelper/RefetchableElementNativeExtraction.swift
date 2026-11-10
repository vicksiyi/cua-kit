extension RefetchableSkyshotAXTree {
    // Host entry connects original ID/monitor/recovery semantics to the actual
    // extractor. Recovery is the only publisher when a full refetch is needed.
    @MainActor
    func refetchElementIfNeeded(_ id: Int, validateElement: Bool) throws -> RefetchableUIElement {
        try refetchElementIfNeeded(id, validateElement: validateElement,
            extractSelection: { try self.extractNativeSelection() })
    }

    @MainActor
    func refetchElementIfNeeded(_ element: any UIElementProtocol,
        validateElement: Bool, ignoreValueChange: Bool
    ) throws -> RefetchableUIElement {
        try refetchElementIfNeeded(element, validateElement: validateElement,
            ignoreValueChange: ignoreValueChange,
            extractSelection: { try self.extractNativeSelection() })
    }
}

extension RefetchableUIElement {
    @MainActor
    func refetchIfNeeded(validateElement: Bool, ignoreValueChange: Bool) throws {
        try refetchIfNeeded(validateElement: validateElement, ignoreValueChange: ignoreValueChange,
            extractSelection: { try self.containingTree.extractNativeSelection() })
    }
}
