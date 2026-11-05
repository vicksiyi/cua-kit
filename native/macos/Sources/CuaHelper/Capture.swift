import Foundation
import AppKit
import ApplicationServices
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers

func rectData(_ rect: CGRect) -> [String: Double] {
    ["x": rect.origin.x, "y": rect.origin.y, "width": rect.width, "height": rect.height]
}
extension Target {
    func observeWithScreenshot(_ params: [String: Any]) async throws -> [String: Any] {
        do {
            var state = try observe()
            let captured = try await screenshot(params)
            let (after, warnings) = try collect()
            guard warnings.isEmpty, after.count == nodes.count,
                  zip(after,nodes).allSatisfy({ CFEqual($0.element,$1.element) && NSDictionary(dictionary:$0.data).isEqual(to:$1.data) }) else {
                throw fail("STALE_OBSERVATION", "AX state changed during screenshot; observe again.")
            }
            state["screenshot"] = captured
            return state
        } catch {
            invalidateInputState()
            throw error
        }
    }

    func captureWindows() async throws -> [SCWindow] {
        try validateIdentity()
        guard CGPreflightScreenCaptureAccess() else { throw fail("PERMISSION_DENIED", "Screen Recording permission is required; no permission prompt was requested.") }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            try validateIdentity()
            return content.windows.filter { $0.owningApplication?.processID == app.processIdentifier && $0.frame.width > 0 && $0.frame.height > 0 }
        } catch let error as Failure { throw error }
          catch { throw fail("PROVIDER_DISCONNECTED", "Window enumeration failed: \(error.localizedDescription)") }
    }
    func windows() async throws -> [String: Any] {
        let available = try await captureWindows()
        return ["windows": available.map { window in
            ["id": Int(window.windowID), "title": window.title ?? "", "frame": rectData(window.frame)] as [String: Any]
        }]
    }
    func screenshot(_ params: [String: Any]) async throws -> [String: Any] {
        let available = try await captureWindows()
        let requestedId = params["windowId"] as? Int
        if params["windowId"] != nil && requestedId == nil { throw fail("INVALID_ARGUMENT", "windowId must be an integer.") }
        let focus = requestedId == nil && available.count > 1 ? try focusedCaptureWindow() : nil
        let selectedId = try selectCaptureWindow(available.map { CaptureWindowCandidate(id:Int($0.windowID),title:$0.title ?? "",frame:$0.frame) }, requestedId:requestedId, focusedFrame:focus?.frame, focusedTitle:focus?.title)
        guard let window = available.first(where: {Int($0.windowID) == selectedId}) else { throw fail("TARGET_NOT_FOUND", "Selected window disappeared.") }
        let originalFrame = window.frame
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        let scale = Double(filter.pointPixelScale)
        let rect = filter.contentRect
        let width = Int(ceil(rect.width * scale)), height = Int(ceil(rect.height * scale))
        guard width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 32_000_000 else { throw fail("INVALID_ARGUMENT", "Window exceeds screenshot dimension budget.") }
        config.width = width; config.height = height
        config.showsCursor = false; config.ignoreShadowsSingleWindow = true
        let image: CGImage
        do { image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) }
        catch { throw fail("PROVIDER_DISCONNECTED", "Window screenshot failed: \(error.localizedDescription)") }
        try validateIdentity()
        let current = try await captureWindows()
        guard let same = current.first(where: { $0.windowID == window.windowID }), same.frame == originalFrame else { throw fail("STALE_OBSERVATION", "Window moved, resized or closed during capture.") }
        if let originalFocus = focus {
            guard let currentFocus = try focusedCaptureWindow(), CFEqual(originalFocus.element,currentFocus.element), captureFramesMatch(originalFocus.frame,currentFocus.frame) else { throw fail("STALE_OBSERVATION", "Focused window changed during capture.") }
        }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { throw fail("PROVIDER_DISCONNECTED", "Cannot create PNG encoder.") }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw fail("PROVIDER_DISCONNECTED", "Cannot encode screenshot PNG.") }
        guard data.length <= 5 * 1024 * 1024 else { throw fail("INVALID_ARGUMENT", "Screenshot exceeds 5 MiB response budget.") }
        capturedWindow = CapturedWindow(windowId:window.windowID,frame:originalFrame,contentRect:rect,pixelWidth:image.width,pixelHeight:image.height,scale:scale,snapshotId:snapshot,focus:focus?.element)
        return ["id": UUID().uuidString, "windowId": Int(window.windowID), "mimeType": "image/png", "data": (data as Data).base64EncodedString(),
                "pixelWidth": image.width, "pixelHeight": image.height, "pointPixelScale": scale,
                "coordinateSpace": "window-image-pixels", "windowFrame": rectData(originalFrame), "contentRect": rectData(rect),
                "capturedAt": ISO8601DateFormatter().string(from: Date())]
    }
}
