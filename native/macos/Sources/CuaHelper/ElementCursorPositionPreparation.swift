import CoreGraphics

struct ElementCursorPositionPreparation {
    let point: CGPoint?
    let timing: ComputerUseCursor.CursorNextInteractionTiming?
    let didScroll: Bool
}

// positionElement prefix0x1000735b8..0x10007374c. Resolve a clickable point
// with scrolling requested even when cursor timing is absent or the feature is
// disabled. didScroll is the controller's return value on every early exit.
// This stage does not implement the subsequent move/focus work.
func prepareElementCursorPosition(
    timing: ComputerUseCursor.CursorNextInteractionTiming?,
    isolation: isolated (any Actor)? = #isolation,
    clickablePoint: (_ scrollToVisible: Bool) async throws -> (point: CGPoint?, didScroll: Bool),
    cursorFeatureEnabled: () -> Bool
) async throws -> ElementCursorPositionPreparation {
    let result = try await clickablePoint(true)
    guard let point = result.point, let timing, cursorFeatureEnabled() else {
        return ElementCursorPositionPreparation(point: nil, timing: nil, didScroll: result.didScroll)
    }
    return ElementCursorPositionPreparation(point: point, timing: timing, didScroll: result.didScroll)
}
