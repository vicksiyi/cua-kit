import AccessibilitySupport
import CoreGraphics

// Extracted start of the simulated-click branch:
// 0x1007b1d7c propagates clickablePoint errors;
// 0x1007b1e48 rejects nil with SynthesizedEvent.Error tag 3;
// 0x1007b1f94 resolves ApplicationUIElement.target(forMouseEventAt:...).
// The actual target/window types and later activation/event dispatch are not
// replaced here. Generic Target is an explicit boundary for the pending types.
func resolveUIElementClickTarget<Target>(
    clickablePoint: () async throws -> CGPoint?,
    targetAtPoint: (CGPoint) throws -> Target
) async throws -> (point: CGPoint, target: Target) {
    guard let point = try await clickablePoint() else {
        throw SynthesizedEvent.Error.cannotClickOffscreenElement
    }
    return (point, try targetAtPoint(point))
}
