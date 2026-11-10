extension ApplicationUIElement {
    var isCatalystApp: Bool { isCatalystApplication(reportError: reportAttributeReadError) }
}

extension UIElementTransformationContext {
    // Concrete native0x100758398 constructor. Shared initializer preserves the
    // two separate app web-shape reads and the independent window frame read.
    init(type: UIElementContextType, application: ApplicationUIElement?, window: WindowUIElement?,
        urlConfiguration: UIElementURLShortener.Configuration?) {
        self.init(type: type, application: application, window: window, urlConfiguration: urlConfiguration,
            isCatalystApp: { $0.isCatalystApp }, applicationIsWebShaped: { $0.isWebShaped },
            windowHasChromeNode: { $0.windowHasChromeNodeForInitialization() },
            frame: { $0.frameValue(reportError: $0.reportAttributeReadError) })
    }
}
