import CoreGraphics

// Native poll condition0x1007a19e0. It reads fresh geometry each time and
// checks the current element center, not the original pre-scroll frame.
func uiElementScrollCenterIsVisible(readFrame: (_ uncached: Bool) -> CGRect?,
    clippingFrame: (_ uncached: Bool) -> CGRect?
) -> Bool {
    guard let frame = readFrame(true), let clip = clippingFrame(true) else { return false }
    return clip.contains(CGPoint(x: frame.midX, y: frame.midY))
}

extension UIElementProtocol {
    func pollScrollCenterVisible(reportError: (Error) -> Void) throws {
        try pollUntilTrueSync(timeout: 0.5, delay: 0.025) {
            uiElementScrollCenterIsVisible(readFrame: { fresh in
                clippingFrameAttribute(uncached: fresh,
                    read: { axElement.value(for: .frame) }, reportError: reportError)
            }, clippingFrame: { clippingFrame(uncached: $0, reportError: reportError) })
        }
    }
}
