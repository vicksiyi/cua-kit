import AppKit
import SwiftUI

// Native nested Style/ActivityState are named separately until the concrete
// ComputerUseCursor owner is restored. Storage/defaults: 0x10009be9c.
enum ComputerUseCursorActivityState: Hashable { case idle, loading, paused }

@MainActor
class ComputerUseCursorStyle {
    static var current: @MainActor () -> ComputerUseCursorStyle = { SoftwareCursorStyle() }
    static var software: SoftwareCursorStyle { SoftwareCursorStyle() }
    var velocityX: CGFloat = 0
    var velocityY: CGFloat = 0
    var isPressed = false
    var activityState: ComputerUseCursorActivityState = .idle
    var isAttached = true
    var angle: Angle = .zero
    var scootStretchXScale: CGFloat = 1
    var scootStretchScale: CGFloat = 1
    var scootStretchPivotX: CGFloat = 0.5
    var scootStretchAngle: Angle = .zero
    var scootTiltAngle: Angle = .zero
    // Native default hook 0x100009888 is a no-op.
    func windowVisibilityDidChange() {}
    var hotSpot: CGPoint { fatalError("makeView has not been implemented") }
    func makeView() -> NSView { fatalError("makeView has not been implemented") }
}
