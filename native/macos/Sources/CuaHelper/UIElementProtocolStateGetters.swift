#if canImport(SlimCore)
import SlimCore
#endif
import ApplicationServices
import Foundation
import os

extension UIElementProtocol {
    // 0x1007ae4b0..0x1007ae54c: preserve logger(Self) when defaults are
    // inherited by concrete windows instead of forwarding through UIElement.
    func reportAttributeReadError(_ error: Error) {
        NativeLogger.logger(for: Self.self).error("log[baa09d44b6c8dd36e77f] [0]=\(error as NSError)")
    }
    var isInsideWebView: Bool { isInsideWebView(reportError: reportAttributeReadError) }
    var isSelected: Bool { isSelected(reportError: reportAttributeReadError) }
    var titleTargetIdentities: [AXUIElement] {
        titleTargetIdentities(reportError: reportAttributeReadError)
    }
}
