import ApplicationServices
import os

// The original sequence erases UIElementProtocol: the first node is a captured
// transformed value, while subsequent parents are live UIElement values.
private enum WebViewAncestor {
    case captured(TransformedUIElement)
    case live(UIElement)

    var element: UIElement {
        switch self { case .captured(let node): node.element; case .live(let node): node }
    }
    var role: UIElementRole {
        switch self { case .captured(let node): node.role; case .live(let node): node.role }
    }
}

extension TransformedUIElement {
    // Specialized protocol getter 0x1007aac98. Preserve the parent sequence's
    // eager next-parent read, including when the current node is a web area.
    var isInsideWebView: Bool {
        uiElementIsInsideWebView(WebViewAncestor.captured(self), parent: { node in
            node.element.parentValue { error in
                NativeLogger.logger(for: Self.self).error("log[baa09d44b6c8dd36e77f] [0]=\(error as NSError)")
            }.map(WebViewAncestor.live)
        }, role: { $0.role }, bundleIdentifier: { $0.element.axElement.bundleIdentifier })
    }
}
