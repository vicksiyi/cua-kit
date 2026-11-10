import AppKit

// Native 0x100094ae4..0x100094b04: only a hidden animated move with a prior
// position and a different target needs the temporary overlay reason.
func cursorMoveNeedsTemporaryOverlay(wasVisible: Bool, animated: Bool,
    petLocationExists: Bool, initialAbsolute: CGPoint, targetAbsolute: CGPoint
) -> Bool {
    !wasVisible && animated && petLocationExists
        && (initialAbsolute.x != targetAbsolute.x || initialAbsolute.y != targetAbsolute.y)
}

// Native 0x100094bb4..0x100094bf8. Preserve the AppMonitor reason and avoid
// touching level/visibility at all when the temporary reason is absent.
func clearCursorMoveTemporaryOverlay(reasons: () -> CursorOverlayWindowLevelReasons,
    clearTemporaryReason: () -> Void, setLevel: (Int) -> Void,
    updateVisibility: () -> Void
) {
    let previous = reasons()
    guard previous.petLaunch else { return }
    clearTemporaryReason()
    if !previous.appMonitor { setLevel(0) }
    updateVisibility()
}

// Native 0x10009a950. A false temporaryOverlay does not clear an existing
// petLaunch reason. Promotion happens only on the first overlay reason.
func associateCursorWindowForMove(aboveWindowID: UInt32?, temporaryOverlay: Bool,
    setWantsVisible: (Bool) -> Void, setCorrespondingWindow: (UInt32?) -> Void,
    reasons: () -> CursorOverlayWindowLevelReasons, setTemporaryReason: () -> Void,
    promote: () -> Void, updateVisibility: () -> Void
) {
    setWantsVisible(true)
    setCorrespondingWindow(aboveWindowID)
    if temporaryOverlay {
        let previous = reasons()
        setTemporaryReason()
        if !previous.appMonitor && !previous.petLaunch { promote() }
    }
    updateVisibility()
}

extension ComputerUseCursorWindow {
    func clearTemporaryMoveOverlay() {
        clearCursorMoveTemporaryOverlay(reasons: { self.overlayWindowLevelReasons },
            clearTemporaryReason: { self.overlayWindowLevelReasons.petLaunch = false },
            setLevel: { self.setCursorWindowLevel($0) },
            updateVisibility: { self.updateVisibility() })
    }
    func associateForMove(aboveWindowID: UInt32?, temporaryOverlay: Bool) {
        associateCursorWindowForMove(aboveWindowID: aboveWindowID, temporaryOverlay: temporaryOverlay,
            setWantsVisible: { self.wantsToBeVisible = $0 },
            setCorrespondingWindow: { self.correspondingWindowID = $0 },
            reasons: { self.overlayWindowLevelReasons },
            setTemporaryReason: { self.overlayWindowLevelReasons.petLaunch = true },
            promote: { promoteCursorWindowOverlay(self) },
            updateVisibility: { self.updateVisibility() })
    }
}
