import ApplicationServices

extension RefetchableSkyshotAXTree {
    func refetchElementIfNeeded(_ id: Int, validateElement: Bool,
        readRoleError: (AXUIElement) -> AXError = { $0.value(for: UIElementAttribute("AXRole")).error },
        extractSelection: () throws -> SystemSelection
    ) throws -> RefetchableUIElement {
        try refetchElementIfNeeded(id, validateElement: validateElement,
            readRoleError: readRoleError, refetch: { element, ignore in
                try recoverElement(element, ignoreValueChange: ignore, extractSelection: extractSelection)
            })
    }

    // Connect invalidation/validation to the actual recovery algorithm. The
    // extractor is the only remaining host boundary; recovery owns publication.
    func refetchElementIfNeeded(_ element: any UIElementProtocol,
        validateElement: Bool, ignoreValueChange: Bool,
        readRoleError: (AXUIElement) -> AXError = { $0.value(for: UIElementAttribute("AXRole")).error },
        extractSelection: () throws -> SystemSelection
    ) throws -> RefetchableUIElement {
        try refetchElementIfNeeded(element, validateElement: validateElement,
            ignoreValueChange: ignoreValueChange, readRoleError: readRoleError,
            refetch: { element, ignore in
                try recoverElement(element, ignoreValueChange: ignore, extractSelection: extractSelection)
            })
    }
}

extension RefetchableUIElement {
    // Preserve native write-before-refresh ordering and error propagation.
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute,
        extractSelection: () throws -> SystemSelection
    ) throws {
        try element.setValue(value, forAttribute: attribute)
        try refetchIfNeeded(validateElement: true, ignoreValueChange: true,
            extractSelection: extractSelection)
    }

    func refetchIfNeeded(validateElement: Bool, ignoreValueChange: Bool,
        extractSelection: () throws -> SystemSelection
    ) throws {
        try refetchIfNeeded(validateElement: validateElement, ignoreValueChange: ignoreValueChange,
            resolve: { tree, element, validate, ignore in
                try tree.refetchElementIfNeeded(element, validateElement: validate,
                    ignoreValueChange: ignore, extractSelection: extractSelection)
            })
    }
}
