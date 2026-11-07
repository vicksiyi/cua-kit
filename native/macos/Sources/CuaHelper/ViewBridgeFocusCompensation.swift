import ApplicationServices

// 0x10074e3f0..0x10074ec50 after eligibility. The containing-process
// search must use exactly regularApp/viewService. The PID sent notifications
// remains the previous logical owner, not the containing element's PID.
func compensateViewBridgeFocus<Element>(previousOwnerPID: Int32,
    focusedElement: () -> Element?,
    containingProcess: (Element, Set<UIElement.ProcessType>) -> UIElement.ProcessType?,
    isRegisteredOwner: (Int32) -> Bool,
    releaseFocus: () -> Bool,
    scheduleRefresh: (Int32) -> Void
) -> Bool {
    guard let element = focusedElement(),
          let type = containingProcess(element, [.regularApp, .viewService]) else { return false }
    if isRegisteredOwner(previousOwnerPID) { return false }
    switch type {
    case .regularApp: return releaseFocus()
    case .viewService: scheduleRefresh(previousOwnerPID); return false
    case .nonEventHandlingProcess:
        preconditionFailure("Containing process must match the requested type set")
    }
}

func systemViewBridgeFocusCompensation(previousOwnerPID: Int32,
    transaction: UIElementTransactionCache?, event: CGEvent,
    isRegisteredOwner: (Int32) -> Bool, scheduleRefresh: (Int32) -> Void,
    reportAXError: @escaping (Error) -> Void,
    reportReleaseFailure: (SystemKeyFocusReleaseFailure) -> Void
) -> Bool {
    let application = UIElement(systemElement: AXUIElementCreateApplication(previousOwnerPID), transaction: transaction)
    return compensateViewBridgeFocus(previousOwnerPID: previousOwnerPID,
        focusedElement: { application.focusedUIElementValue(transaction: transaction, reportError: reportAXError) },
        containingProcess: { UIElement.ProcessType.containingElement(for: $0, ofTypes: $1,
            reportError: reportAXError)?.processType },
        isRegisteredOwner: isRegisteredOwner,
        releaseFocus: { releaseSystemKeyFocus(for: event, reportFailure: reportReleaseFailure) },
        scheduleRefresh: scheduleRefresh)
}
