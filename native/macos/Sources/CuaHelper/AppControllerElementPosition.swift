import AppKit

// Native positionElement0x1000735b8..0x1000743bc returns didScroll on every
// successful exit. Cursor creation and selection lookup are deferred until
// after geometry, optional timing and feature eligibility have been resolved.
@MainActor
func positionElementCursor(timing: ComputerUseCursor.CursorNextInteractionTiming?, animated: Bool,
    clickablePoint: (Bool) async throws -> (point: CGPoint?, didScroll: Bool),
    cursorFeatureEnabled: () -> Bool, createCursor: () -> ComputerUseCursor,
    selectedWindowID: () -> UInt32, environment: CursorWindowMoveEnvironment? = nil
) async throws -> Bool {
    let prepared = try await prepareElementCursorPosition(timing: timing,
        clickablePoint: clickablePoint, cursorFeatureEnabled: cursorFeatureEnabled)
    guard let point = prepared.point, let timing = prepared.timing else { return prepared.didScroll }
    let cursor = createCursor()
    let windowID = selectedWindowID()
    await cursor.move(to: point, aboveWindowID: windowID, relativeToWindow: true,
        nextInteractionTiming: timing, animated: animated, fadeIn: false,
        isDelegate: false, environment: environment)
    return prepared.didScroll
}

extension Target {
    func positionElement(_ element: any UIElementProtocol, axTree: RefetchableSkyshotAXTree,
        cursorNextInteractionTiming: ComputerUseCursor.CursorNextInteractionTiming?, animateCursor: Bool,
        cursorFeatureEnabled: () -> Bool, reportError: (Error) -> Void
    ) async throws -> Bool {
        try await positionElement(element, cursorNextInteractionTiming: cursorNextInteractionTiming,
            animateCursor: animateCursor,
            selectedWindowID: { axTree.systemSelection.applicationWindow.id },
            cursorFeatureEnabled: cursorFeatureEnabled, reportError: reportError)
    }

    // The source reads axTree.systemSelection's window ID at this boundary.
    // Caller must supply that observation selection, not an inferred hit window.
    func positionElement(_ element: any UIElementProtocol,
        cursorNextInteractionTiming: ComputerUseCursor.CursorNextInteractionTiming?, animateCursor: Bool,
        selectedWindowID: () -> UInt32, cursorFeatureEnabled: () -> Bool,
        reportError: (Error) -> Void
    ) async throws -> Bool {
        try await positionElementCursor(timing: cursorNextInteractionTiming, animated: animateCursor,
            clickablePoint: { try await element.clickablePoint(scrollToVisible: $0, reportError: reportError) },
            cursorFeatureEnabled: cursorFeatureEnabled, createCursor: { createVirtualCursorIfNeeded() },
            selectedWindowID: selectedWindowID)
    }
}
