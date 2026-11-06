import ApplicationServices
import Foundation

@main struct UIElementChessCompositionTests {
    static func main() {
        let targetAX = AXUIElementCreateApplication(424242), parentAX = AXUIElementCreateApplication(424241)
        let otherAX = AXUIElementCreateApplication(424240)
        let role = UIElementAttribute(kAXRoleAttribute), title = UIElementAttribute(kAXTitleAttribute), parent = UIElementAttribute(kAXParentAttribute)
        func partial(_ raw: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        func rect(_ value: CGRect) -> AXPartialValue {
            var copy = value; return partial(AXValueCreate(.cgRect, &copy)!)
        }
        let box = CGRect(x: 0, y: 0, width: 64, height: 64)
        let tx = UIElementTransactionCache(attributeTable: [
            targetAX: [role: partial("AXButton" as NSString), title: partial("Square a1" as NSString), .frame: rect(box), parent: partial(parentAX)],
            parentAX: [role: partial("AXGroup" as NSString), .frame: rect(box)],
            otherAX: [role: partial("AXButton" as NSString)]
        ], requestedAttributes: [role, title, .frame, parent], fallbackElements: UIElementFallbackCache(initialState: [:]))
        let target = UIElement(systemElement: targetAX, transaction: tx)
        let other = UIElement(systemElement: otherAX, transaction: tx)
        var events: [String] = []
        var hits = 0
        let result = target.chessPreferredPoint(transaction: tx,
            bundleIdentifier: { events.append("bundle"); return "com.apple.Chess" },
            resolveApp: { id in precondition(id == "com.apple.Chess"); events.append("app"); return other },
            hitTest: { app, point in
                precondition(app.representsSameSystemElement(as: other)); hits += 1
                if hits == 1 { precondition(point == CGPoint(x: 32, y: 32)); return other }
                return point.x < 2 && point.y < 2 ? target : other
            }, matches: { $0.representsSameSystemElement(as: $1) },
            read: { _, _ in fatalError("Prefetched cache should satisfy geometry and parent reads") }, reportError: { _ in fatalError() })
        precondition(result == CGPoint(x: 1, y: 1) && hits == 4097 && events == ["bundle", "app"])
        // Center already hitting the target must skip the parent read entirely.
        let noParent = UIElement(axElement: targetAX, cache: UIElementCache(supportedAttributes: [role, title, .frame, parent],
            attributes: [role: partial("AXButton" as NSString), title: partial("a1" as NSString), .frame: rect(box)], transactionAttributes: nil))
        let center = noParent.chessPreferredPoint(transaction: nil,
            bundleIdentifier: { "com.apple.Chess" }, resolveApp: { _ in other }, hitTest: { _, _ in target },
            matches: { $0.representsSameSystemElement(as: $1) }, read: { _, _ in fatalError("Parent is lazy") }, reportError: { _ in fatalError() })
        precondition(center == nil)
        // Failed title gate must not perform bundle/app/system reads.
        let gated = other.chessPreferredPoint(transaction: tx,
            bundleIdentifier: { fatalError() }, resolveApp: { _ in fatalError() }, hitTest: { _, _ in fatalError() },
            matches: { _, _ in fatalError() }, read: { _, _ in fatalError() }, reportError: { _ in fatalError() })
        precondition(gated == nil)
        print("Concrete Chess composition preserves cached geometry, lazy gates and AX equality")
    }
}
