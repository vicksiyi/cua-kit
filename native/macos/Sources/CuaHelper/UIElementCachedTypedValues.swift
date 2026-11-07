import Foundation
import ApplicationServices

extension UIElement {
    // 0x1007ad338: cached AXValue only, decode leniently, suppress failure.
    var boolValue: Bool? {
        uiElementCachedValue(UIElementAttribute(kAXValueAttribute), readCache: { cache }) {
            try? decodeAXBool($0.value.value, throwingOnFailure: false)
        }
    }

    // 0x1007ab808: cached AXURL only, not a fresh AX read or string parser.
    var url: URL? {
        uiElementCachedValue(UIElementAttribute(kAXURLAttribute), readCache: { cache }) {
            try? decodeAXURL($0.value.value, throwingOnFailure: false)
        }
    }

    // 0x1007ad0ac: typed UIElement array -> original AX references, in order.
    func titleTargetIdentities(reportError: (Error) -> Void) -> [AXUIElement] {
        elementCollectionValue(for: UIElementAttribute(kAXServesAsTitleForUIElementsAttribute),
            reportError: reportError).map(\.axElement)
    }
}
