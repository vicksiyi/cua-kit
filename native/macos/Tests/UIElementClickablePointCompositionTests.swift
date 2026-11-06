import ApplicationServices
import Foundation

@main struct UIElementClickablePointCompositionTests {
    static func main() async throws {
        let ax = AXUIElementCreateApplication(424242), parentAX = AXUIElementCreateApplication(424241)
        let role = UIElementAttribute(kAXRoleAttribute), parent = UIElementAttribute(kAXParentAttribute)
        func partial(_ raw: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        func rect(_ value: CGRect) -> AXPartialValue {
            var copy = value; return partial(AXValueCreate(.cgRect, &copy)!)
        }
        let frame = CGRect(x: 0, y: 0, width: 100, height: 100)
        let tx = UIElementTransactionCache(attributeTable: [parentAX: [role: partial("AXWindow" as NSString), .frame: rect(frame)]],
            requestedAttributes: [role, .frame, parent], fallbackElements: UIElementFallbackCache(initialState: [:]))
        func item(_ box: CGRect?) -> UIElement {
            var attributes = [role: partial("AXButton" as NSString), parent: partial(parentAX)]
            if let box { attributes[.frame] = rect(box) }
            return UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role, .frame, parent], attributes: attributes, transactionAttributes: nil))
        }
        var reads = 0, scrolls = 0
        var environment = UIElementActionEnvironment(read: { _, _ in reads += 1; return (.noValue, nil) },
            supported: { _ in fatalError() }, nativeActions: { _ in fatalError() }, settable: { _, _ in fatalError() },
            write: { _, _, _ in fatalError() }, perform: { _, _ in fatalError() }, count: { _, _ in fatalError() })
        let visible = try await item(frame).clickablePoint(scrollToVisible: false, transaction: tx, environment: environment,
            preferredPoint: { nil }, scrollFrameToVisible: { _ in scrolls += 1; return true }, reportError: { _ in fatalError() })
        precondition(visible.point == CGPoint(x: 50, y: 50) && !visible.didScroll && reads == 0 && scrolls == 0)
        // Center outside the parent clip must not fall back to element center.
        let outside = try await item(CGRect(x: 200, y: 200, width: 10, height: 10)).clickablePoint(
            scrollToVisible: false, transaction: tx, environment: environment,
            preferredPoint: { nil }, scrollFrameToVisible: { _ in fatalError() }, reportError: { _ in fatalError() })
        precondition(outside.point == nil && !outside.didScroll)
        let preferred = try await item(nil).clickablePoint(scrollToVisible: true, transaction: tx, environment: environment,
            preferredPoint: { CGPoint(x: 3, y: 4) }, scrollFrameToVisible: { _ in fatalError() }, reportError: { _ in fatalError() })
        precondition(preferred.point == CGPoint(x: 3, y: 4) && !preferred.didScroll && reads == 0)
        do {
            _ = try await item(nil).clickablePoint(scrollToVisible: false, transaction: tx, environment: environment,
                preferredPoint: { nil }, scrollFrameToVisible: { _ in fatalError() }, reportError: { _ in })
            preconditionFailure("Missing raw frame must throw")
        } catch UIElementGeometryError.elementHasNoFrame {}
        precondition(reads == 1)
        var events: [String] = []
        environment.read = { element, attribute in
            if attribute == .frame { events.append(CFEqual(element, ax) ? "childFrame" : "parentFrame"); return (.success, rect(frame)) }
            precondition(attribute == parent && CFEqual(element, ax)); events.append("parent"); return (.success, partial(parentAX))
        }
        let scrolled = try await item(frame).clickablePoint(scrollToVisible: true, transaction: tx, environment: environment,
            preferredPoint: { nil }, scrollFrameToVisible: { before in precondition(before == frame); events.append("scroll"); return true }, reportError: { _ in fatalError() })
        precondition(scrolled.didScroll && scrolled.point == CGPoint(x: 50, y: 50))
        precondition(events == ["scroll", "childFrame", "childFrame", "parent", "parentFrame"])
        print("Clickable point composition rejects clipped centers and preserves cached versus refreshed reads")
    }
}
