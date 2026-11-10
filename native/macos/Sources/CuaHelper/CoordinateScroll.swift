import CoreGraphics

// Coordinate branch 0x10015f360..0x10015f478 -> 0x1001610bc.
// Request coordinates are already scaled/window-relative. Do not apply the
// screen-point conversion used for an element's clickablePoint.
func performCoordinateScroll(
    point: CGPoint, direction: AppControllerScrollDirection, pages: Double,
    moveMouse: (AppControllerCursorPosition, ComputerUseCursor.CursorNextInteractionTiming) async throws -> Void,
    readVisibleRect: () -> CGRect,
    scroll: (Int, Int) async throws -> Void
) async throws {
    let position = AppControllerCursorPosition(x: Int(point.x), y: Int(point.y))
    try await moveMouse(position, .finished)
    let size = readVisibleRect().size
    let deltas = direction.deltas(pages: pages, pageExtent: direction.pageExtent(size: size))
    try await scroll(deltas.x, deltas.y)
}
