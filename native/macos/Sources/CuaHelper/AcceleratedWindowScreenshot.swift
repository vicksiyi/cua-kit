#if canImport(SystemSoftware)
import SystemSoftware
#endif
import CoreGraphics

// Capture stage0x100fb27f8..0x100fb28a4. Preserve nil/empty as no image and
// return only the first image. Signpost/logging surrounds this in the source.
func captureAcceleratedWindowScreenshot<Image>(_ windows: [UInt32], rect: CGRect,
    mainConnection: () -> OpaquePointer?,
    capture: ([UInt32], WindowServerCaptureOptions, CGRect, OpaquePointer?) -> [Image]?
) -> Image? {
    let connection = mainConnection()
    return capture(windows, .ignoreGlobalClipShape, rect, connection)?.first
}

func captureAcceleratedWindowScreenshot(_ windows: [UInt32], rect: CGRect) -> CGImage? {
    captureAcceleratedWindowScreenshot(windows, rect: rect,
        mainConnection: WindowServerSPI.mainConnectionID,
        capture: { WindowServerSPI.captureWindowImagesInRect($0, options: $1, rect: $2, connection: $3) })
}
