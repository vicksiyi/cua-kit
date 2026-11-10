import CoreGraphics

// ComputerUseAppController.scroll 0x100081a4c: preparation and dispatch share
// one resolved target. Geometry is reread inside preparation after validation;
// retain that target rather than resolving a second time for event dispatch.
func performControllerScroll<Window, Destination>(
    deltaX: Int, deltaY: Int,
    readPosition: () -> AppControllerCursorPosition,
    readScale: () -> CGFloat, readVisibleRect: () -> CGRect,
    orderedWindows: () throws -> [Window],
    resolve: (CGPoint, [Window]) throws -> Destination,
    validateProcess: (Destination) throws -> Void,
    send: (Destination, CGPoint, Int, Int) async throws -> Void
) async throws {
    let prepared = try prepareControllerScrollTarget(readPosition: readPosition,
        readScale: readScale, readVisibleRect: readVisibleRect,
        orderedWindows: orderedWindows, resolve: resolve, validateProcess: validateProcess)
    try await send(prepared.target, prepared.point, deltaX, deltaY)
}
