import CoreGraphics

// Element branch 0x100161200..0x1001616f0. Resolution/authorization is an
// upstream responsibility. Keep the page size captured before clickablePoint;
// cursor movement may suspend and must complete before delta conversion/send.
func performElementScroll(
    direction: AppControllerScrollDirection, pages: Double,
    readFrame: () -> CGRect?, readVisibleRect: () -> CGRect,
    clickablePoint: () async throws -> CGPoint?,
    readScale: () -> CGFloat,
    moveMouse: (AppControllerCursorPosition, ComputerUseCursor.CursorNextInteractionTiming) async throws -> Void,
    scroll: (Int, Int) async throws -> Void
) async throws {
    let size = elementScrollPageSize(readFrame: readFrame, readVisibleRect: readVisibleRect)
    if let point = try await clickablePoint() {
        let scale = readScale()
        let rect = readVisibleRect()
        let position = elementScrollCursorPosition(clickablePoint: point,
            scalingFactor: scale, visibleRect: rect)
        try await moveMouse(position, .finished)
    }
    let deltas = direction.deltas(pages: pages, pageExtent: direction.pageExtent(size: size))
    try await scroll(deltas.x, deltas.y)
}
