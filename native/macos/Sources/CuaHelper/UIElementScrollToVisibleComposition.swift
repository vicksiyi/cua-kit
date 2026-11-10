import ApplicationServices

extension UIElementProtocol {
    // Native0x1007b029c: no supported-attribute preflight; read errors become
    // false without reporting. This differs from supported-and-settable.
    func isAttributeSettable(_ attribute: UIElementAttribute) -> Bool {
        (try? axElement.isAttributeSettable(attribute)) ?? false
    }
}

extension UIElementProtocol {
    // Native0x10079f380: collect first, execute outer-to-inner, then best-effort
    // poll the original element's fresh center. Bool denotes a scroll request.
    func scrollToVisible(frame: CGRect, reportError: (Error) -> Void) async throws -> Bool {
        let attribute = UIElementAttribute("AXScrollToVisible")
        let root: any UIElementProtocol = self
        let operations: [UIElementScrollOperation<any UIElementProtocol>] = collectUIElementScrollOperations(from: root,
            isBoundary: { element in uiElementIsClippingBoundary(role: { element.role }) },
            hasScrollAction: { $0.actions.contains(.scrollToVisible) },
            isCell: { $0.role == UIElementRole("AXCell") }, isScrollAttributeSettable: { $0.isAttributeSettable(attribute) },
            isScrollArea: { $0.role == .scrollArea },
            clipsChildren: { element in
                uiElementClipsChildren(role: { element.role },
                    hasScrollAction: { element.hasScrollAction(in: .provider, reportError: reportError) })
            }, parent: { $0.parentValue(reportError: reportError) })
        return try executeUIElementScrollOperations(operations, frame: frame,
            performAction: { try $0.perform(action: .scrollToVisible) },
            setScrollAttribute: { try $0.setValue(true, forAttribute: attribute) },
            scrollFrame: { try $0.scrollFrameToVisible($1, reportError: reportError) },
            pollForGeometryChange: { try pollScrollCenterVisible(reportError: reportError) })
    }

    func clickablePoint(scrollToVisible: Bool, reportError: (Error) -> Void) async throws
        -> (point: CGPoint?, didScroll: Bool) {
        try await uiElementClickablePoint(scrollToVisible: scrollToVisible,
            preferredPoint: { chessPreferredPoint(reportError: reportError) },
            frameBeforeScroll: { frameValue(reportError: reportError) },
            scrollFrameToVisible: { try await self.scrollToVisible(frame: $0, reportError: reportError) },
            readFrameAttribute: { fresh in
                clippingFrameAttribute(uncached: fresh,
                    read: { axElement.value(for: .frame) }, reportError: reportError)
            }, clippingFrame: { clippingFrame(uncached: $0, reportError: reportError) })
    }
}
