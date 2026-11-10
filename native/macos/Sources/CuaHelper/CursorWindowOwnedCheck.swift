import Animation
import AppKit
import ApplicationServices
import GraphicsSupport

// No ordering, activation, event synthesis or other-application access.
@MainActor
func runCursorWindowOwnedCheck() -> [String: Any] {
    NSApplication.shared.setActivationPolicy(.prohibited)
    weak var releasedWindow: ComputerUseCursorWindow?
    weak var releasedMonitor: CursorAppMonitor?
    var report: [String: Any] = autoreleasepool {
        let style = SoftwareCursorStyle()
        var configuration = ComputerUseCursorMotionConfiguration.live
        configuration.scootStretchPivotX = 0.8
        var window: ComputerUseCursorWindow? = ComputerUseCursorWindow(style: style, motionConfiguration: configuration)
        releasedWindow = window
        precondition(window!.delegate === window!)
        precondition(!window!.isVisible && !window!.wantsToBeVisible && window!.appMonitor == nil)
        precondition(window!.title == "Software Cursor" && window!.ignoresMouseEvents)
        precondition(window!.contentViewController?.view === style.makeView())
        precondition((style.makeView() as? NSImageView)?.image?.size == NSSize(width: 20, height: 23))
        precondition(window!.cursorScootStretchPivotX == 0.8 && window!.currentInterpolatedOrigin == .zero)
        precondition(window!.cursorScootPositionAnimation == nil && window!.cursorScootBaseRotationAnimation == nil)
        precondition(window!.cursorScootAxisAnimation == nil && window!.cursorScootStretchAnimation == nil)
        precondition(window!.cursorScootRotationAnimation == nil && window!.correspondingWindowID == nil)
        let layer = window!.contentViewController!.view.layer!
        layer.layerFilters = [LayerFilter.GaussianBlur(radius: 7, hardEdges: nil, normalizeEdges: nil),
            LayerFilter.ColorSaturate(amount: 0.75), LayerFilter.GaussianBlur()]
        window!.animateBlurTransition(from: 0, to: 7)
        let blurTransition = layer.animation(forKey: "cursorBlurTransition") as! CABasicAnimation
        precondition(blurTransition.keyPath == "filters.gaussianBlur.inputRadius")
        precondition(blurTransition.duration == 0.44)
        precondition((blurTransition.fromValue as? NSNumber)?.doubleValue == 0)
        precondition((blurTransition.toValue as? NSNumber)?.doubleValue == 7)
        precondition(blurTransition.timingFunction != nil)
        window!.resetBlurFilters()
        precondition(layer.layerFilters.map(\.name) == [.colorSaturate])
        precondition((layer.layerFilters[0] as? LayerFilter.ColorSaturate)?.amount == 0.75)
        layer.layerFilters = []
        window!.resetBlurFilters()
        precondition(layer.filters != nil && layer.filters!.isEmpty)
        layer.removeAnimation(forKey: "cursorBlurTransition")
        let animation = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
        var finished = 0
        animation.eventHandler = { if case .finished = $0 { finished += 1 } }
        window!.cursorMotionProgressAnimation = animation
        style.velocityX = 4
        style.velocityY = 8
        NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
        precondition(animation.state == .ended && finished == 1)
        precondition(window!.cursorMotionProgressAnimation == nil && !window!.isVisible)
        precondition(style.velocityX == 0 && style.velocityY == 0)
        var originReads: [String] = []
        var screenReads = 0
        window!.currentInterpolatedOrigin = CGPoint(x: 12, y: 34)
        let interrupted = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
        interrupted.eventHandler = { event in
            if case .finished = event {
                originReads.append("reset")
                window!.currentInterpolatedOrigin = CGPoint(x: 999, y: 999)
            }
        }
        window!.cursorMotionProgressAnimation = interrupted
        let origins = window!.prepareMoveOrigins(initialAbsolute: CGPoint(x: 150, y: 500),
            targetAbsolute: CGPoint(x: 180, y: 700),
            correspondingWindowFrame: CGRect(x: 100, y: 200, width: 300, height: 400),
            zeroScreenFrame: {
                originReads.append("screen"); screenReads += 1
                return CGRect(x: 0, y: 0, width: 1000, height: screenReads == 1 ? 1000 : 1200)
            })
        precondition(origins.initial == CGPoint(x: 12, y: 34) && origins.target == CGPoint(x: 80, y: 100))
        precondition(originReads == ["screen", "reset", "screen"])
        precondition(window!.currentInterpolatedOrigin == origins.initial && window!.cursorMotionProgressAnimation == nil)
        let absolute = window!.prepareMoveOrigins(initialAbsolute: CGPoint(x: -5, y: 6),
            targetAbsolute: CGPoint(x: 7, y: -8), correspondingWindowFrame: nil,
            zeroScreenFrame: { preconditionFailure("No relative window must skip conversion") })
        precondition(absolute.initial == CGPoint(x: -5, y: 6) && absolute.target == CGPoint(x: 7, y: -8))
        var interactions = 0
        var replacedInteractions = 0
        window!.cursorMotionNextInteractionTimingHandler = {
            precondition(window!.cursorMotionDidSatisfyNextInteractionTiming)
            interactions += 1
            window!.cursorMotionNextInteractionTimingHandler = { replacedInteractions += 1 }
        }
        window!.updateCloseEnoughInteraction(progress: 0.995.nextDown, distance: 0)
        window!.updateCloseEnoughInteraction(progress: 1, distance: 3.157.nextUp)
        window!.updateCloseEnoughInteraction(progress: .nan, distance: 0)
        window!.updateCloseEnoughInteraction(progress: 1, distance: .nan)
        precondition(interactions == 0 && window!.cursorMotionNextInteractionTimingHandler != nil)
        window!.updateCloseEnoughInteraction(progress: 0.995, distance: 3.157)
        window!.updateCloseEnoughInteraction(progress: 1, distance: 0)
        precondition(interactions == 1 && replacedInteractions == 0)
        precondition(window!.cursorMotionDidSatisfyNextInteractionTiming && window!.cursorMotionNextInteractionTimingHandler == nil)
        window!.resetCursorWindowState()
        var completionOrder: [String] = []
        let replacementProgress = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
        window!.cursorMotionDidSatisfyNextInteractionTiming = true
        style.velocityX = 20
        style.velocityY = 30
        window!.cursorMotionCompletionHandler = { preconditionFailure("Stale completion was captured before interaction callback") }
        window!.cursorMotionNextInteractionTimingHandler = {
            completionOrder.append("interaction")
            window!.cursorMotionProgressAnimation = replacementProgress
            window!.cursorMotionCompletionHandler = {
                precondition(window!.cursorMotionProgressAnimation == nil)
                precondition(window!.cursorMotionNextInteractionTimingHandler == nil)
                precondition(window!.cursorMotionCompletionHandler == nil)
                precondition(!window!.cursorMotionDidSatisfyNextInteractionTiming)
                precondition(style.velocityX == 0 && style.velocityY == 0)
                completionOrder.append("completion")
                window!.cursorMotionNextInteractionTimingHandler = { completionOrder.append("future") }
            }
        }
        window!.finishProgressMotion()
        precondition(completionOrder == ["interaction", "completion"])
        precondition(replacementProgress.state == .ready)
        precondition(window!.cursorMotionNextInteractionTimingHandler != nil)
        window!.cursorMotionNextInteractionTimingHandler?()
        precondition(completionOrder == ["interaction", "completion", "future"])
        window!.resetCursorWindowState()
        let relativeFrame = CGRect(x: 100, y: 200, width: 300, height: 400)
        let applied = window!.applyMotionFrameOrigin(CGPoint(x: 0.5, y: -0.5),
            correspondingWindowFrame: relativeFrame,
            zeroScreenFrame: { CGRect(x: 0, y: 0, width: 1000, height: 1000) },
            afterMove: { point in
                precondition(point == CGPoint(x: 101, y: 400))
                precondition(window!.frame.origin == point)
                precondition(window!.currentInterpolatedOrigin == CGPoint(x: 0.5, y: -0.5))
            })
        precondition(applied == CGPoint(x: 101, y: 400) && !window!.isVisible)
        window!.applyMotionFrameOrigin(CGPoint(x: -1.5, y: -2.5), correspondingWindowFrame: nil,
            zeroScreenFrame: { preconditionFailure("Absolute origin must not read a screen") },
            afterMove: { point in precondition(point == CGPoint(x: -2, y: -3)) })
        precondition(window!.frame.origin == CGPoint(x: -2, y: -3) && !window!.isVisible)
        let unavailable = CursorAppMonitor(application: UIElement(element: AXUIElementCreateSystemWide()),
            processID: Int32.max, cursorWindow: window!)
        precondition(unavailable == nil)
        final class CursorOwner: NSObject, CursorCorrespondingApplicationStorage, StyledVirtualCursor {
            var events: [String] = []
            var style: ComputerUseCursorStyle
            var correspondingApplicationPID: pid_t?
            let window: ComputerUseCursorWindow
            init(_ window: ComputerUseCursorWindow) {
                self.window = window
                self.style = window.style
                super.init()
                installCursorOwnerNotifications(self, window: window, selector: #selector(windowDidMove(_:)))
            }
            @objc func windowDidMove(_ notification: Notification) {
                notifyCursorOwnerMoved(self) { self.events.append("delegate") }
            }
            deinit { removeCursorOwnerNotifications(self) }
        }
        let registry = CursorOwnerRegistry<CursorOwner>()
        weak var registeredOwner: CursorOwner?
        autoreleasepool {
            let owner = CursorOwner(window!)
            registeredOwner = owner
            registry.insert(owner)
            registry.insert(owner)
            precondition(registry.all.count == 1 && registry.all.first === owner)
        }
        precondition(registeredOwner == nil && registry.all.isEmpty)
        do {
            let owner = CursorOwner(window!)
            let observer = NotificationCenter.default.addObserver(
                forName: computerUseCursorLocationDidChangeNotification, object: owner, queue: nil
            ) { [weak owner] _ in owner?.events.append("notification") }
            NotificationCenter.default.post(name: NSWindow.didMoveNotification, object: window!)
            precondition(owner.events == ["delegate", "notification"])
            removeCursorOwnerNotifications(owner)
            NotificationCenter.default.post(name: NSWindow.didMoveNotification, object: window!)
            precondition(owner.events == ["delegate", "notification"])
            NotificationCenter.default.removeObserver(observer)
            owner.isPressed = true
            precondition(style.isPressed && owner.isPressed)
            let replacementStyle = ComputerUseCursorStyle()
            owner.style = replacementStyle
            precondition(!owner.isPressed)
            owner.isPressed = true
            precondition(replacementStyle.isPressed)
            owner.isPressed = false
            style.isPressed = false
            // Observe this helper process only; no external application's UI.
            owner.setCorrespondingApplication(pid: getpid())
            precondition(owner.window.appMonitor != nil)
            precondition(owner.window.appMonitor!.activeObserver != nil)
            precondition(owner.window.appMonitor!.runningApplication.processIdentifier == getpid())
            releasedMonitor = owner.window.appMonitor
            owner.setCorrespondingApplication(pid: Int32.max)
            precondition(owner.correspondingApplicationPID == Int32.max && owner.window.appMonitor == nil)
            precondition(!owner.window.isVisible)
        }
        window = nil
        // Drain AppKit autoreleases before asserting the owner was released.
        return ["concreteCursorWindow": true, "softwareCursorImage": true,
                "workspaceNotificationReset": true, "missingProcessMonitor": true, "correspondingApplicationEntry": true, "weakCursorRegistry": true, "ownerMoveNotification": true,
                "orderedWindows": false, "sentInput": false,
                "realApplicationClickVerified": false]
    }
    weak var releasedCursor: ComputerUseCursor?
    autoreleasepool {
        let cursorStyle = SoftwareCursorStyle()
        cursorStyle.activityState = .paused
        let cursor = ComputerUseCursor(style: cursorStyle, motionConfiguration: .live)
        releasedCursor = cursor
        precondition(ComputerUseCursor.all.contains { $0 === cursor })
        precondition(cursor.activityState == .paused && cursor.isPaused && !cursor.isLoading && !cursor.isMoving && !cursor.shouldFadeOut)
        cursorStyle.activityState = .idle
        precondition(cursor.isPaused && !cursor.isLoading)
        precondition(cursor.targetWindowID == nil && cursor.correspondingApplicationPID == nil)
        cursor.activityState = .loading
        precondition(cursorStyle.activityState == .loading && cursor.isLoading && !cursor.isPaused)
        cursor.isPressed = true
        precondition(cursorStyle.isPressed)
        cursor.isAttached = false
        precondition(!cursorStyle.isAttached)
        final class Delegate: ComputerUseCursorDelegate {
            var movements = 0
            func computerUseCursorWillMove(_ cursor: ComputerUseCursor, to point: CGPoint,
                aboveWindowID: UInt32?, animated: Bool) async {}
            func computerUseCursorWillHide(_ cursor: ComputerUseCursor) async {}
            func computerUseCursorDidHide(_ cursor: ComputerUseCursor) {}
            func computerUseCursorDidMove(_ cursor: ComputerUseCursor) { movements += 1 }
        }
        var delegate: Delegate? = Delegate()
        cursor.delegate = delegate
        NotificationCenter.default.post(name: NSWindow.didMoveNotification, object: cursor.window)
        precondition(delegate!.movements == 1)
        delegate = nil
        precondition(cursor.delegate == nil)
        precondition(!cursor.window.isVisible)
        precondition(!nativeCursorCorrespondingWindowIsPresent(UInt32.max))
        var showNotifications = 0
        let showObserver = NotificationCenter.default.addObserver(
            forName: computerUseCursorLocationDidChangeNotification, object: cursor, queue: nil
        ) { _ in showNotifications += 1 }
        cursor.show(aboveWindowID: UInt32.max)
        precondition(showNotifications == 1 && !cursor.isVisible)
        precondition(cursor.window.wantsToBeVisible && cursor.window.correspondingWindowID == UInt32.max)
        precondition(cursor.targetWindowID == nil)
        precondition(!cursor.window.overlayWindowLevelReasons.appMonitor && !cursor.window.overlayWindowLevelReasons.petLaunch)
        NotificationCenter.default.removeObserver(showObserver)
    }
    precondition(releasedCursor == nil && ComputerUseCursor.all.isEmpty)
    report["concreteCursorOwnerLifecycle"] = true
    report["showMissingWindowRemainsHidden"] = true
    precondition(releasedWindow == nil, "Cursor window survived autorelease pool")
    precondition(releasedMonitor == nil, "AppMonitor survived replacement and autorelease pool")
    report["windowReleasedAfterAutoreleasePool"] = true
    report["ownProcessMonitorCreatedAndReleased"] = true
    // Posting after teardown must not invoke a dangling selector observer.
    NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.activeSpaceDidChangeNotification, object: nil)
    report["postTeardownNotification"] = true
    return report
}
