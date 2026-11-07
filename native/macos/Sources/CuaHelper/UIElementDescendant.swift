import DequeModule

// 0x1007b62d4..0x1007b6fc0: breadth-first search, starting with immediate
// children. A match is tested before expanding its children. Preserve order and
// duplicate entries; the source has no visited set or traversal-count limit.
func uiElementDescendant<Element>(of root: Element, children: (Element) -> [Element],
    matchesType: (Element) -> Bool, passingTest: (Element) -> Bool) -> Element? {
    var pending = Deque(children(root))
    while let element = pending.popFirst() {
        if matchesType(element) && passingTest(element) { return element }
        pending.append(contentsOf: children(element))
    }
    return nil
}

extension UIElement {
    func descendant(withRole targetRole: UIElementRole?,
        passingTest: (UIElement) -> Bool = { _ in true },
        reportError: (Error) -> Void) -> UIElement? {
        uiElementDescendant(of: self, children: { $0.childrenValue(reportError: reportError) },
            matchesType: { element in targetRole.map { element.role == $0 } ?? true },
            passingTest: passingTest)
    }

    // Initialization uses WebAreaUIElement's static role and the always-true
    // predicate at 0x1007b62cc, preserving ordinary cached-role semantics.
    func initializeAccessibilityApplication(reportError: @escaping (Error) -> Void) -> Bool {
        initializeAXApplication(window: self,
            hasWebAreaDescendant: { $0.descendant(withRole: .webArea, reportError: reportError) != nil },
            reportError: reportError)
    }
}
