import Foundation

// Shared boundary for the concrete cursor owner fields. This does not make
// its NSWindow a VirtualCursor or move owner state into the window.
@MainActor
protocol StyledVirtualCursor: VirtualCursor {
    var style: ComputerUseCursorStyle { get }
    var window: ComputerUseCursorWindow { get }
}

@MainActor
extension StyledVirtualCursor {
    // Source 0x100090b50/0x100090b98 delegates to the current Style, without
    // maintaining a second isPressed flag or skipping repeated assignments.
    var isPressed: Bool {
        get { style.isPressed }
        set { style.isPressed = newValue }
    }
    func press(count: Int) async throws {
        try await animateCursorPress(count: count,
            isVisible: { self.window.isVisible },
            setPressed: { self.style.isPressed = $0 },
            sleep: { try await ContinuousClock().sleep(for: $0) })
    }
}
