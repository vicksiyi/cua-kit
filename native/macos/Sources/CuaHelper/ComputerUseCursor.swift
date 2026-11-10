import AppKit

// Recovered four-requirement Delegate boundary. Callback names below are
// readable reconstruction names; the original requirement names are redacted.
@MainActor
protocol ComputerUseCursorDelegate: AnyObject {
    func computerUseCursorWillMove(_ cursor: ComputerUseCursor, to point: CGPoint,
        aboveWindowID: UInt32?, animated: Bool) async
    func computerUseCursorWillHide(_ cursor: ComputerUseCursor) async
    func computerUseCursorDidHide(_ cursor: ComputerUseCursor)
    func computerUseCursorDidMove(_ cursor: ComputerUseCursor)
}

// Concrete owner initialization/lifecycle from 0x100090ff8. Owner move is
// composed separately; this owner is not installed into Target's Mouse path yet.
@MainActor
final class ComputerUseCursor: NSObject, StyledVirtualCursor, CursorCorrespondingApplicationStorage {
    private static let registry = CursorOwnerRegistry<ComputerUseCursor>()
    static var all: [ComputerUseCursor] { registry.all }

    weak var delegate: (any ComputerUseCursorDelegate)?
    var targetWindowID: UInt32?
    var isMoving = false
    var shouldFadeOut = false
    var window: ComputerUseCursorWindow
    var correspondingApplicationPID: pid_t?
    var style: ComputerUseCursorStyle
    var activityState: ComputerUseCursorActivityState {
        didSet { style.activityState = activityState }
    }
    var windowID: UInt32? { cursorObservedWindowID { self.window.windowNumber } }
    var center: CGPoint {
        cursorCenterScreenPoint(frame: window.frame,
            zeroScreenFrame: NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame)
    }
    var isLoading: Bool { activityState == .loading }
    var isPaused: Bool { activityState == .paused }
    var isVisible: Bool { window.isVisible }
    var hotspotScreenPoint: CGPoint {
        let currentWindow = window
        return cursorHotspotScreenPoint(frame: { currentWindow.frame },
            hotspot: { currentWindow.style.hotSpot },
            zeroScreenFrame: { NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame })
    }
    var isAttached: Bool {
        get { style.isAttached }
        set { style.isAttached = newValue }
    }

    init(style: ComputerUseCursorStyle, motionConfiguration: ComputerUseCursorMotionConfiguration) {
        self.style = style
        activityState = style.activityState
        window = ComputerUseCursorWindow(style: style, motionConfiguration: motionConfiguration)
        super.init()
        Self.registry.insert(self)
        installCursorOwnerNotifications(self, window: window, selector: #selector(windowDidMove(_:)))
    }
    // Native 0x100093008 does not change targetWindowID or overlay reasons.
    func show(aboveWindowID: UInt32?) {
        let currentWindow = window
        currentWindow.wantsToBeVisible = true
        currentWindow.correspondingWindowID = aboveWindowID
        currentWindow.updateVisibility()
        NotificationCenter.default.post(name: computerUseCursorLocationDidChangeNotification, object: self)
    }
    func orderOut() async {
        await delegate?.computerUseCursorWillHide(self)
        let visible = window.isVisible
        let preparedWindow = window
        preparedWindow.wantsToBeVisible = false
        preparedWindow.resetCursorWindowState()
        if visible {
            // Native code reloads the current owner window after reset.
            await window.fadeOut()
        } else {
            // The hidden branch retains the prepared window for super dispatch.
            preparedWindow.orderOutFromSuperclass()
        }
        delegate?.computerUseCursorDidHide(self)
        NotificationCenter.default.post(name: computerUseCursorDidHideNotification, object: self)
    }
    // Extracted move prefix 0x100091ffc..0x100092128 / 0x100092404..430.
    // This prepares ownership only; it does not stand in for the pending
    // coordinate conversion, window motion or fade-in portions of move().
    func prepareMoveOwnership(to point: CGPoint, aboveWindowID: UInt32?,
        relativeToWindow: Bool, animated: Bool, isDelegate: Bool
    ) async {
        guard !isDelegate else { return }
        targetWindowID = relativeToWindow ? aboveWindowID : nil
        await delegate?.computerUseCursorWillMove(self, to: point,
            aboveWindowID: aboveWindowID, animated: animated)
        isMoving = true
    }
    @objc private func windowDidMove(_ notification: Notification) {
        notifyCursorOwnerMoved(self) { self.delegate?.computerUseCursorDidMove(self) }
    }
    deinit { removeCursorOwnerNotifications(self) }
}
