import Foundation
import ApplicationServices

extension UIElement {
    // Common constructor 0x10075eb80..<0x10075f45c. The role is the
    // constructor's already captured role, not another AXRole read.
    func transformedURL(capturedRole: UIElementRole, reportError: (Error) -> Void) -> URL? {
        if let cachedURL = url { return cachedURL }
        guard capturedRole == .window else { return nil }
        let document = UIElementAttribute("AXDocument")
        guard let string = stringValue(for: document, ignoringTypeMismatch: false,
            read: { axElement.value(for: document) }, reportError: reportError) else { return nil }
        // Source calls Foundation.URL.init(string:), not fileURLWithPath.
        return URL(string: string)
    }
}
