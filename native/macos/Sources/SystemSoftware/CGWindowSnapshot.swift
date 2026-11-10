import CoreGraphics
import ScreenCaptureKit

// Original25aef0..25b05c: width and height independently read scale, round
// nearest with ties away, checked Int conversion, then minimum one pixel.
public func cgWindowBackingSnapshotDimensions(bounds: CGRect, scale: () -> CGFloat) -> (width: Int, height: Int) {
    let width = Int((CGRectGetWidth(bounds) * scale()).rounded(.toNearestOrAwayFromZero))
    let height = Int((CGRectGetHeight(bounds) * scale()).rounded(.toNearestOrAwayFromZero))
    return (max(1, width), max(1, height))
}

// Original25b3cc..25b4d4: missing dimension uses raw bounds size/aspect,
// truncating conversion and conditional setter, not ceil/minimum-one policy.
public func configureCGWindowSnapshotDimensions(width: Int, height: Int, frameSize: CGSize,
    setWidth: (Int) -> Void, setHeight: (Int) -> Void) {
    if width > 0 {
        let resolvedHeight = height > 0 ? height : Int(frameSize.height / frameSize.width * CGFloat(width))
        setWidth(width)
        if resolvedHeight > 0 { setHeight(resolvedHeight) }
    } else if height > 0 {
        let resolvedWidth = Int(frameSize.width / frameSize.height * CGFloat(height))
        if resolvedWidth > 0 { setWidth(resolvedWidth) }
        setHeight(height)
    }
}

// SDK configuration stage25b388..25b4d4. Preserve all other SDK defaults.
public func cgWindowSnapshotConfiguration(width: Int, height: Int, frameSize: CGSize) -> SCStreamConfiguration {
    let configuration = SCStreamConfiguration()
    configuration.ignoreShadowsSingleWindow = true
    configuration.ignoreShadowsDisplay = true
    configureCGWindowSnapshotDimensions(width: width, height: height, frameSize: frameSize,
        setWidth: { configuration.width = $0 }, setHeight: { configuration.height = $0 })
    return configuration
}

// Acquisition/first-match/capture seam. No fallback/retry after missing ID/error.
public func captureCGWindowSnapshot<Window, Image>(windowID: UInt32,
    acquireWindows: () async throws -> [Window], identify: (Window) -> UInt32,
    capture: (Window) async throws -> Image) async throws -> Image? {
    let windows = try await acquireWindows()
    guard let window = windows.first(where: { identify($0) == windowID }) else { return nil }
    return try await capture(window)
}

public extension CGWindow {
    func snapshotAtBackingSize() async throws -> CGImage? {
        let dimensions = cgWindowBackingSnapshotDimensions(bounds: bounds, scale: { scale })
        return try await snapshot(width: dimensions.width, height: dimensions.height)
    }

    func snapshot(width: Int, height: Int) async throws -> CGImage? {
        try await captureCGWindowSnapshot(windowID: id,
            acquireWindows: { try await SCShareableContent.current.windows }, identify: { $0.windowID },
            capture: { window in
                let filter = SCContentFilter(desktopIndependentWindow: window)
                let configuration = cgWindowSnapshotConfiguration(width: width, height: height, frameSize: bounds.size)
                return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
            })
    }
}
