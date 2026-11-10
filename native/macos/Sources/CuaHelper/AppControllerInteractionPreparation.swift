import AppKit

extension Target {
    // Native prepareToInteract0x100072e44. Timing, positioning and animation
    // are supplied by the operation caller; no generic click defaults invented.
    func prepareToInteract(with id: Int,
        cursorNextInteractionTiming: ComputerUseCursor.CursorNextInteractionTiming?,
        positionElement shouldPosition: Bool, animateCursor: Bool,
        cursorFeatureEnabled: () -> Bool,
        didPositionScroll: (Bool) -> Void = { _ in }, reportError: (Error) -> Void
    ) async throws -> (RefetchableSkyshotAXTree, any UIElementProtocol) {
        guard let tree = selectionTree else {
            throw fail("STALE_OBSERVATION", "Input requires a published element selection.")
        }
        let element = try await prepareInteraction(positionElement: shouldPosition,
            resolve: { try tree.refetchElementIfNeeded(id, validateElement: true) },
            activateFocusEnforcer: { _ = activateFocusEnforcer() },
            position: { element in
                let didScroll = try await withNativeAsyncObservationPhase("position-element", pid: app.processIdentifier) {
                    try await self.positionElement(element, axTree: tree,
                        cursorNextInteractionTiming: cursorNextInteractionTiming,
                        animateCursor: animateCursor, cursorFeatureEnabled: cursorFeatureEnabled,
                        reportError: reportError)
                }
                didPositionScroll(didScroll)
                return didScroll
            }, validateProcess: { element in
                let pid = try element.axElement.actualPID
                try validateInteractionProcess(pid: pid,
                    application: { NSRunningApplication(processIdentifier: $0) },
                    bundleIdentifier: { $0.bundleIdentifier },
                    securityBundleIdentifiers: { NativeForbiddenTargets.systemAuthentication },
                    reject: { _ in
                        // Owned-host error projection, not the vendor controller
                        // enum's numeric wire representation.
                        throw fail("PERMISSION_DENIED", "Computer Use cannot interact with a system authentication application.")
                    })
            })
        return (tree, element)
    }
}
