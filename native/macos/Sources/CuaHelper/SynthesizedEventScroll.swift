import AccessibilitySupport
import CoreGraphics

extension SynthesizedEvent {
    // Helper compatibility boundary; the original independently optional window
    // identity/bounds entry resides in AccessibilitySupport.
    static func scroll(at point: CGPoint, deltaX: Int, deltaY: Int,
        inWindow window: MouseWindow? = nil
    ) throws -> SynthesizedEvent {
        try scroll(at: point, deltaX: deltaX, deltaY: deltaY,
            inWindow: window?.id, windowBounds: window?.frame,
            windowUsesFlippedCoordinates: window?.usesFlippedCoordinates ?? false)
    }
}
