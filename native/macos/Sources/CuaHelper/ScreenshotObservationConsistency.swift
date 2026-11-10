// A successful image with changed AX is usable for viewing, but not for input
// coordinates. Revoke coordinates before refreshing; refresh errors propagate.
func reconcileScreenshotObservation<State>(_ original: State, unchanged: Bool,
    revokeCoordinates: () -> Void, refresh: () throws -> State
) rethrows -> (state: State, coordinateInputAvailable: Bool) {
    if unchanged { return (original, true) }
    revokeCoordinates()
    return (try refresh(), false)
}
