import AppKit
import SystemSoftware

// Adapter entry sharing the recovered screen selector, with caller isolation
// retained. No main-screen shortcut or scale sanitization.
@MainActor
func nativeWindowScale(for bounds: CGRect) -> CGFloat {
    NSScreen.bestScreen(for: bounds, preferredScreen: nil)?.backingScaleFactor ?? 2
}
