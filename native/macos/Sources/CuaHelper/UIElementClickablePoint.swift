import CoreGraphics

// Native enum descriptor 0x1012cd450, field descriptor 0x10132407c.
enum UIElementGeometryError: Error {
    case elementHasNoFrame
}

// Restored control flow at 0x10079e6ac..<0x10079eb20. The three geometry
// readers are distinct: the pre-scroll frame getter can use position/size;
// readFrameAttribute reads AXFrame directly; clipping has its own ancestor walk.
// preferredPoint preserves the earlier app-specific helper's precedence.
func uiElementClickablePoint(
    scrollToVisible: Bool,
    preferredPoint: () -> CGPoint?,
    frameBeforeScroll: () -> CGRect?,
    scrollFrameToVisible: (CGRect) async throws -> Bool,
    readFrameAttribute: (_ uncached: Bool) -> CGRect?,
    clippingFrame: (_ uncached: Bool) -> CGRect?
) async throws -> (point: CGPoint?, didScroll: Bool) {
    if let point = preferredPoint() { return (point, false) }
    let didScroll: Bool
    if scrollToVisible {
        guard let frame = frameBeforeScroll() else {
            throw UIElementGeometryError.elementHasNoFrame
        }
        didScroll = try await scrollFrameToVisible(frame)
    } else {
        didScroll = false
    }
    guard let frame = readFrameAttribute(didScroll) else {
        throw UIElementGeometryError.elementHasNoFrame
    }
    guard let clip = clippingFrame(didScroll) else { return (nil, didScroll) }
    let center = CGPoint(x: frame.midX, y: frame.midY)
    guard clip.contains(center) else { return (nil, didScroll) }
    return (center, didScroll)
}

// 0x1007a03f8..<0x1007a04d4: the no-argument entry explicitly passes false
// and returns only the optional point, propagating errors unchanged.
func uiElementClickablePoint(
    resolve: (_ scrollToVisible: Bool) async throws -> (point: CGPoint?, didScroll: Bool)
) async throws -> CGPoint? {
    try await resolve(false).point
}
