import Foundation
import CoreGraphics

// Six stored fields from descriptor 0x1013238b0. The original rendering protocol
// conformance is pending; do not substitute a reduced AccessibilityRenderingContext.
struct UIElementTransformationContext {
    var type: UIElementContextType
    var isCatalyst: Bool
    var isWebShaped: Bool
    var isChromium: Bool
    var windowFrame: CGRect?
    var urlShortener: UIElementURLShortener

    // Constructor 0x100758398..<0x10075875c. Application/window wrapper getters
    // remain explicit dependencies until their full native types are restored.
    init<Application, Window>(
        type: UIElementContextType,
        application: Application?,
        window: Window?,
        urlConfiguration: UIElementURLShortener.Configuration?,
        isCatalystApp: (Application) -> Bool,
        applicationIsWebShaped: (Application) -> Bool,
        windowHasChromeNode: (Window) -> Bool,
        frame: (Window) -> CGRect?
    ) {
        self.type = type
        if let application {
            isCatalyst = isCatalystApp(application)
            isWebShaped = applicationIsWebShaped(application)
            // Original invokes this getter twice. Do not memoize: providers can
            // change between reads, and the second value gates the window probe.
            if applicationIsWebShaped(application), let window {
                isChromium = windowHasChromeNode(window)
            } else {
                isChromium = false
            }
        } else {
            isCatalyst = false
            isWebShaped = false
            isChromium = false
        }
        windowFrame = window.flatMap(frame)
        urlShortener = UIElementURLShortener(configuration: urlConfiguration ?? .init(
            individualLimit: nil, totalLimit: nil, includeQuery: true,
            includeFragment: true, baseHost: nil))
    }
}
