import AppKit

// Native boundaries of the existing restoration loop. Saved-application AX
// construction/capture remains with the caller so resolvingProcessIdentifier
// is preserved rather than replaced by an assumed raw PID.
func systemSafeActivationRestorationDriver(savedApplication: NSRunningApplication,
    savedWindow: SafeActivationSavedWindow<UIElement>, targetPID: Int32,
    targetApplication: @escaping () -> UIElement,
    reportError: @escaping (Error) -> Void) -> SafeActivationRestorationDriver {
    SafeActivationRestorationDriver(
        frontmostPID: { NSWorkspace.shared.frontmostApplication?.processIdentifier },
        activateSavedApplication: { savedApplication.activate(options: []) },
        targetBelievesItIsFrontmost: {
            // Native loop reconstructs the target wrapper on each read;
            // invalid/missing uncached Bool values are treated as absent.
            targetApplication().booleanValue(for: UIElementAttribute("AXFrontmost"),
                ignoringTypeMismatch: true, reportError: reportError) ?? false
        }, restoreSavedWindowIfObscured: {
            try systemSafeActivationWindowOrder(saved: savedWindow, targetPID: targetPID)
        })
}
