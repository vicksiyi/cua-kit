#if canImport(SlimCore)
import SlimCore
#endif
import ApplicationServices
import os

extension TransformedUIElement {
    // Specialized protocol getter 0x1007aac98. The existential sequence starts
    // with captured self and continues with live UIElement parents. Preserve
    // next-parent resolution before yielding even when self is a web area.
    var isInsideWebView: Bool {
        uiElementIsInsideWebView(self as any UIElementProtocol, parent: { node in
            UIElement(axElement: node.axElement, cache: node.cache).parentValue { error in
                NativeLogger.logger(for: Self.self).error("log[baa09d44b6c8dd36e77f] [0]=\(error as NSError)")
            }
        }, role: { $0.role }, bundleIdentifier: { $0.axElement.bundleIdentifier })
    }
}
