import ApplicationServices

extension UIElementProtocol {
    // Concrete provider-aware composition of native scroll-frame helper.
    func scrollFrameToVisible(_ target: CGRect, reportError: (Error) -> Void) throws -> Bool {
        try adjustUIElementScrollFrame(target: target,
            containerFrame: { frameValue(reportError: reportError) },
            scrollBar: { axis in
                scrollBarValue(for: UIElementAttribute(axis == .vertical
                    ? kAXVerticalScrollBarAttribute : kAXHorizontalScrollBarAttribute), reportError: reportError)
            }, enabled: { bar in
                UIElement(axElement: bar.axElement, cache: bar.cache).booleanValue(
                    for: UIElementAttribute(kAXEnabledAttribute), ignoringTypeMismatch: false, reportError: reportError)
            }, contentFrame: { scrollContentFrame(reportError: reportError) },
            currentValue: { bar in
                UIElement(axElement: bar.axElement, cache: bar.cache).numberValue(
                    for: UIElementAttribute(kAXValueAttribute), ignoringTypeMismatch: false,
                    reportError: reportError).map { CGFloat($0.doubleValue) }
            }, write: { bar, position in try bar.setValue(position) })
    }
}
