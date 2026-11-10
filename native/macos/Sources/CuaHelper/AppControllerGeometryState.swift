import CoreGraphics

// Controller initialization0x10006c9cc..0x10006ca10. Geometry is independent
// of a transport snapshot: invalidating input must not reset these fields.
struct AppControllerGeometryState {
    var visibleRect: CGRect = .null
    var scalingFactor: CGFloat = 0
    var scaledScreenSize: CGSize = .zero
    var cursorPositionInScaledCoordinates = AppControllerCursorPosition(x: 0, y: 0)

    // updateSkyshot6f598..6f62c/6f7e0..6f878 reads config even when
    // skipping geometry. Local zero output does not clear stored screen size.
    mutating func prepareCapture(skipScreenshot: Bool, hasMenuBarItem: Bool,
        readSizingOptions: () -> (useLegacyScreenshotSizing: Bool, normalizeScreenshotToPointResolution: Bool),
        readBounds: () -> CGRect, readPixelScale: () -> CGFloat
    ) -> CGSize {
        let options = readSizingOptions()
        guard !hasMenuBarItem && !skipScreenshot else { return .zero }
        let rect = readBounds()
        let scale = readPixelScale()
        return update(visibleRect: rect, pixelScale: scale,
            useLegacyScreenshotSizing: options.useLegacyScreenshotSizing,
            normalizeScreenshotToPointResolution: options.normalizeScreenshotToPointResolution)
    }

    @discardableResult
    mutating func update(visibleRect rect: CGRect, pixelScale: CGFloat,
        useLegacyScreenshotSizing: Bool, normalizeScreenshotToPointResolution: Bool
    ) -> CGSize {
        updateAppControllerGeometry(visibleRect: rect, pixelScale: pixelScale,
            useLegacyScreenshotSizing: useLegacyScreenshotSizing,
            normalizeScreenshotToPointResolution: normalizeScreenshotToPointResolution,
            writeVisibleRect: { visibleRect = $0 },
            writeScalingFactor: { scalingFactor = $0 },
            writeScaledScreenSize: { scaledScreenSize = $0 })
    }
}
