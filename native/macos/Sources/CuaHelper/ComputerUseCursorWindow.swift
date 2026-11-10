import Animation
import AppKit

// Concrete storage/appearance/reset/visibility owner from native 0x1000940c0.
// Motion planning and press rendering are still being
// recovered; this owner is not yet installed in Target's input path.
@MainActor
final class ComputerUseCursorWindow: NSWindow, NSWindowDelegate,
    CursorWindowResetStorage, CursorAppMonitorWindow {
    var style: ComputerUseCursorStyle
    let motionConfiguration: ComputerUseCursorMotionConfiguration
    var appMonitor: CursorAppMonitor?
    var wantsToBeVisible = false
    var cursorMotionProgressAnimation: SpringAnimation<CGFloat>?
    var cursorScootPositionAnimation: SpringAnimation<CGPoint>?
    var cursorScootBaseRotationAnimation: SpringAnimation<CGFloat>?
    var cursorScootAxisAnimation: SpringAnimation<CGFloat>?
    var cursorScootStretchAnimation: SpringAnimation<CGFloat>?
    var cursorScootRotationAnimation: SpringAnimation<CGFloat>?
    var cursorMotionNextInteractionTimingHandler: (() -> Void)?
    var cursorMotionCompletionHandler: (() -> Void)?
    var cursorMotionDidSatisfyNextInteractionTiming = false
    var currentInterpolatedOrigin = CGPoint.zero
    var cursorScootBaseRotationOffset: CGFloat = 0
    var cursorScootAxisRotation: CGFloat = 0
    var cursorScootStretchXScale: CGFloat = 1
    var cursorScootStretchScale: CGFloat = 1
    var cursorScootStretchPivotX: CGFloat = 0.5
    var cursorScootRotationOffset: CGFloat = 0
    var overlayWindowLevelReasons = CursorOverlayWindowLevelReasons()
    var correspondingWindowID: UInt32?

    init(style: ComputerUseCursorStyle, motionConfiguration: ComputerUseCursorMotionConfiguration) {
        self.style = style
        self.motionConfiguration = motionConfiguration
        cursorScootStretchPivotX = motionConfiguration.scootStretchPivotX
        super.init(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: true)
        configureCursorWindowAppearance(self, style: style)
        installCursorWindowNotifications(self, selector: #selector(activeSpaceDidChange(_:)))
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
    func setCursorWindowLevel(_ value: Int) { level = NSWindow.Level(rawValue: value) }
    func correspondingWindowIsPresent() -> Bool {
        nativeCursorCorrespondingWindowIsPresent(correspondingWindowID)
    }
    func setAppMonitorOverlay(_ enabled: Bool) {
        updateCursorAppMonitorOverlay(enabled,
            reasons: { self.overlayWindowLevelReasons },
            setAppMonitorReason: { self.overlayWindowLevelReasons.appMonitor = $0 },
            promote: { promoteCursorWindowOverlay(self) },
            setLevel: { self.setCursorWindowLevel($0) },
            updateVisibility: { self.updateVisibility() })
    }
    func updateVisibility() {
        updateCursorWindowVisibility(wantsToBeVisible: { self.wantsToBeVisible },
            correspondingWindowIsPresent: { self.correspondingWindowIsPresent() },
            correspondingWindowID: { self.correspondingWindowID },
            overlayLevelReason0: { self.overlayWindowLevelReasons.appMonitor },
            overlayLevelReason1: { self.overlayWindowLevelReasons.petLaunch },
            reset: { self.resetCursorWindowState() }, isVisible: { self.isVisible },
            orderOut: { self.orderOutFromSuperclass() },
            orderFront: { self.orderFront(nil) },
            windowLevel: { systemNativeWindowDescription($0)?.level },
            setLevel: { self.setCursorWindowLevel(Int($0)) },
            orderAbove: { self.order(.above, relativeTo: Int($0)) })
    }
    func orderOutFromSuperclass() { super.orderOut(nil) }
    @objc func activeSpaceDidChange(_ notification: Notification) { updateVisibility() }
    func windowDidChangeScreen(_ notification: Notification) {
        cursorWindowDidChangeScreen(self) { self.resetCursorWindowState() }
    }
    func windowDidChangeOcclusionState(_ notification: Notification) {
        updateCursorWindowOcclusion(isVisible: { self.isVisible },
            occlusionState: { self.occlusionState.rawValue },
            reasons: { self.overlayWindowLevelReasons },
            correspondingWindowID: { self.correspondingWindowID },
            windowNumbers: { NSWindow.windowNumbers(options: .allApplications)?.map { $0.intValue } },
            windowNumber: { self.windowNumber },
            restoreAssociation: { self.wantsToBeVisible = true; self.correspondingWindowID = $0 },
            updateVisibility: { self.updateVisibility() },
            styleVisibilityDidChange: { self.style.windowVisibilityDidChange() })
    }
    deinit { NSWorkspace.shared.notificationCenter.removeObserver(self) }
}
