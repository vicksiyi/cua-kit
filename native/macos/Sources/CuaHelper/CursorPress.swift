import AccessibilitySupport
import Foundation

// Concrete cursor press body 0x100091418..0x100091c00. Visibility is
// checked once; each setter must reload the current Style after suspension.
@MainActor
func animateCursorPress(count: Int, isVisible: () -> Bool,
    setPressed: (Bool) -> Void, sleep: (Duration) async throws -> Void
) async throws {
    guard isVisible() else { return }
    precondition(count >= 0)
    for index in 0..<count {
        setPressed(true)
        try await sleep(SynthesizedEvent.cursorPressAnimationTime)
        try await sleep(SynthesizedEvent.defaultClickDuration)
        setPressed(false)
        if index + 1 < count { try await sleep(SynthesizedEvent.cursorPressAnimationTime) }
    }
}
