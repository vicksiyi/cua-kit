import CoreGraphics

// Resolved-target move continuation 0x10007e7b4..0x10007ea78. Actor/executor
// hops and the cursor owner's appearance/motion remain in the supplied move.
// Never use the earlier lookup point: creating an owner precedes fresh reads.
func performResolvedControllerMouseMove<Destination, Cursor>(
    target: Destination,
    validateProcess: (Destination) throws -> Void,
    readWindowID: (Destination) throws -> UInt32,
    createCursor: () -> Cursor,
    readPosition: () -> AppControllerCursorPosition,
    readScale: () -> CGFloat, readVisibleRect: () -> CGRect,
    move: (Cursor, CGPoint, UInt32) async throws -> Void
) async throws {
    try validateProcess(target)
    let windowID = try readWindowID(target)
    let cursor = createCursor()
    let position = readPosition()
    let scale = readScale()
    let rect = readVisibleRect()
    let point = position.applying(scalingFactor: scale, convertingToScreenFromWindowFrame: rect)
    try await move(cursor, point, windowID)
}
