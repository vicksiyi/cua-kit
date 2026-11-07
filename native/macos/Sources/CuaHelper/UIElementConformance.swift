import ApplicationServices
import Foundation
import os

extension UIElement: UIElementProtocol {
    // Concrete witness 0x10078fbf4 returns nil; instance role remains cached.
    static var role: UIElementRole? { nil }

    var isInsideWebView: Bool { isInsideWebView(reportError: reportAttributeReadError) }

    // Full action dispatcher uses each concrete getter's own logging path.
    // Parent/children decode under the current transaction, not a captured copy.
    func perform(action: UIElementAction) throws {
        try dispatchUIElementAction(action, role: role,
            parentChain: { parentChain(includingSelf: false, reportError: reportAttributeReadError) },
            childrenAreEmpty: { $0.childrenPreferringVisible(reportError: reportAttributeReadError).isEmpty },
            actions: { $0.actions },
            performAncestor: { try $0.perform(action: $1) },
            toggleDisclosure: {
                try uiElementToggleDisclosure(isDisclosable: { isDisclosable },
                    isDisclosing: { isDisclosing },
                    setDisclosing: { try setValue($0, forAttribute: UIElementAttribute(kAXDisclosingAttribute)) })
            }, scrollUsingScrollBar: { direction in
                try scrollUsingScrollBar(direction: direction,
                    perform: { try $0.perform(action: $1) }, reportError: reportAttributeReadError)
            }, performAXAction: { try axElement.perform($0) })
    }
}
