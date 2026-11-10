import Animation
import AppKit

// Explicit native boundary seams; defaults use the actual AppKit/WindowServer
// operations. Fixtures can keep their own test window hidden.
@MainActor
struct CursorWindowMoveEnvironment {
    var associate: (ComputerUseCursorWindow, UInt32?, Bool) -> Void = { $0.associateForMove(aboveWindowID: $1, temporaryOverlay: $2) }
    var isVisible: (ComputerUseCursorWindow) -> Bool = { $0.isVisible }
    var hasScreen: (ComputerUseCursorWindow) -> Bool = { $0.screen != nil }
    var hitTest: (CGPoint) -> Int = { NSWindow.windowNumber(at: $0, belowWindowWithWindowNumber: 0) }
    var windowFrame: (UInt32) -> CGRect? = { systemNativeWindowDescription($0)?.bounds }
    var screenFrames: () -> [CGRect] = { NSScreen.screens.map { $0.frame } }
    var zeroScreenFrame: () -> CGRect? = { NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame }
    var enqueueScalar: (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = { $0.start(drivenBy: $1) }
    var enqueuePosition: (SpringAnimation<CGPoint>, ComputerUseCursorWindow) -> Void = { $0.start(drivenBy: $1) }
    var afterMove: ((CGPoint) -> Void)? = nil
}

extension ComputerUseCursorWindow {
    // Native Window.move0x1000946b4. Bool reports whether motion was started;
    // it is not an acknowledgement from the destination application.
    @discardableResult
    func move(to point: CGPoint, aboveWindowID: UInt32?, relativeToWindow: Bool,
        animated: Bool, timing: ComputerUseCursor.CursorNextInteractionTiming,
        interaction: (() -> Void)?, completion: (() -> Void)?,
        environment: CursorWindowMoveEnvironment? = nil
    ) -> Bool {
        let env = environment ?? CursorWindowMoveEnvironment()
        let geometry = prepareWindowMoveGeometry(point: point, aboveWindowID: aboveWindowID,
            relativeToWindow: relativeToWindow, animated: animated,
            windowFrame: env.windowFrame, zeroScreenFrame: env.zeroScreenFrame)
        if !geometry.wasVisible { setFrameOrigin(geometry.initialAbsolute) }
        let temporary = cursorMoveNeedsTemporaryOverlay(wasVisible: geometry.wasVisible, animated: animated,
            petLocationExists: geometry.petLocation != nil,
            initialAbsolute: geometry.initialAbsolute, targetAbsolute: geometry.targetAbsolute)
        env.associate(self, aboveWindowID, temporary)
        var initialForHitTest = geometry.relativeOrigins.initial
        if let frame = geometry.correspondingWindowFrame {
            initialForHitTest.x += frame.origin.x
            initialForHitTest.y += (env.zeroScreenFrame()?.maxY ?? 0) - (frame.origin.y + frame.size.height)
        }
        let shouldAnimate = cursorMoveShouldAnimate(animated: animated, wasVisible: geometry.wasVisible,
            initialAbsolute: geometry.initialAbsolute, targetAbsolute: geometry.targetAbsolute,
            isVisible: { env.isVisible(self) }, hasScreen: { env.hasScreen(self) }, endpointsMissWindow: {
                cursorMoveEndpointsMissWindow(firstOrigin: initialForHitTest, secondOrigin: geometry.targetAbsolute,
                    correspondingWindowID: self.correspondingWindowID, hotspot: { self.style.hotSpot },
                    frame: { self.frame }, hitTest: env.hitTest)
            })
        if !shouldAnimate {
            completeImmediateMove(initialRelative: geometry.relativeOrigins.initial,
                targetRelative: geometry.relativeOrigins.target, targetAbsolute: geometry.targetAbsolute,
                bounds: { cursorPathBounds(start: geometry.relativeOrigins.initial, target: geometry.relativeOrigins.target,
                    correspondingWindowFrame: geometry.correspondingWindowFrame,
                    screenFrames: env.screenFrames, zeroScreenFrame: env.zeroScreenFrame) },
                updatesAngle: true, interaction: interaction, completion: completion)
            return false
        }
        prepareAnimatedMoveAppearance(wasVisible: geometry.wasVisible)
        startCursorMotion(start: geometry.relativeOrigins.initial, target: geometry.relativeOrigins.target,
            initialWindowFrame: geometry.correspondingWindowFrame, timing: timing,
            correspondingWindowFrame: {
                guard geometry.correspondingWindowFrame != nil, let id = aboveWindowID else { return nil }
                return env.windowFrame(id)
            }, interaction: interaction, completion: completion, screenFrames: env.screenFrames,
            zeroScreenFrame: env.zeroScreenFrame, afterMove: env.afterMove,
            enqueueScalar: env.enqueueScalar, enqueuePosition: env.enqueuePosition)
        return true
    }
}
