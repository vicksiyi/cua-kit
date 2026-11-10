#if canImport(SlimCore)
import SlimCore
#endif
import ApplicationServices
import Foundation
import os

extension TransformedUIElement: UIElementProtocol {
    // 0x100762060: nil, independently of the instance's captured role.
    static var role: UIElementRole? { nil }

    // 0x10075de70: default full context, no application/window, then acquire
    // the current transaction through UIElement's provider constructor.
    init(element: AXUIElement) {
        var context = UIElementTransformationContext(type: .fullUIContext,
            application: Optional<Int>.none, window: Optional<Int>.none,
            urlConfiguration: nil, isCatalystApp: { _ in false },
            applicationIsWebShaped: { _ in false },
            windowHasChromeNode: { _ in false }, frame: { _ in nil })
        self.init(element: element, context: &context)
    }

    // 0x10075e040: both public constructors pass nil traversal parent role
    // to the common capture constructor, using the current transaction cache.
    init(element: AXUIElement, context: inout UIElementTransformationContext) {
        self.init(element: UIElement(element: element), context: context,
            traversalParentRole: nil, reportError: { error in
                NativeLogger.logger(for: Self.self).error("log[baa09d44b6c8dd36e77f] [0]=\(error as NSError)")
            }, reportUnknownDateComponents: { components in
                NativeLogger.logger(for: Self.self).error("Unknown AXDateTimeComponents: \(components)")
            })
    }
}
