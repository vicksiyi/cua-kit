import AppKit

// Native0x100094b44..0x100094bb0, after association/visibility update.
func cursorMoveShouldAnimate(animated: Bool, wasVisible: Bool,
    initialAbsolute: CGPoint, targetAbsolute: CGPoint,
    isVisible: () -> Bool, hasScreen: () -> Bool, endpointsMissWindow: () -> Bool
) -> Bool {
    guard animated else { return false }
    guard isVisible() else { return false }
    guard hasScreen() else { return false }
    if !wasVisible && initialAbsolute.x == targetAbsolute.x && initialAbsolute.y == targetAbsolute.y {
        return false
    }
    return !endpointsMissWindow()
}

extension ComputerUseCursorWindow {
    func shouldAnimateMove(animated: Bool, wasVisible: Bool,
        initialAbsolute: CGPoint, targetAbsolute: CGPoint
    ) -> Bool {
        cursorMoveShouldAnimate(animated: animated, wasVisible: wasVisible,
            initialAbsolute: initialAbsolute, targetAbsolute: targetAbsolute,
            isVisible: { self.isVisible }, hasScreen: { self.screen != nil },
            endpointsMissWindow: {
                self.moveEndpointsMissWindow(firstOrigin: initialAbsolute, secondOrigin: targetAbsolute)
            })
    }
}
