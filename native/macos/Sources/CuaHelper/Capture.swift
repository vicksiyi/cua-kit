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
            var state = try withNativeObservationPhase("observe", pid: app.processIdentifier) {
                try observe(disableDiff: params["disableDiff"] as? Bool ?? false,
                    sourceDescription: params["sourceDescription"] as? Bool ?? false)
            }
            let captured = try await withNativeAsyncObservationPhase("screenshot", pid: app.processIdentifier) { try await screenshot(params) }
            let (after, warnings) = try withNativeObservationPhase("revalidate", pid: app.processIdentifier) { try collect(publishSelection: false) }
            guard warnings.isEmpty else {
                throw fail("STALE_OBSERVATION", "AX refresh was incomplete during screenshot; observe again.")
            }
            let unchanged = after.count == nodes.count && zip(after,nodes).allSatisfy {
                CFEqual($0.element,$1.element) && NSDictionary(dictionary:$0.data).isEqual(to:$1.data)
            }
            let reconciled = try reconcileScreenshotObservation(state, unchanged: unchanged,
                revokeCoordinates: { self.capturedWindow = nil }, refresh: {
                    try self.observe(disableDiff: params["disableDiff"] as? Bool ?? false,
                        sourceDescription: params["sourceDescription"] as? Bool ?? false)
                })
            state = reconciled.state
            var screenshotResult = captured
            screenshotResult["coordinateInputAvailable"] = reconciled.coordinateInputAvailable
            if !reconciled.coordinateInputAvailable {
                state["text"] = (state["text"] as? String ?? "") +
                    "\nThe app updated during capture. Accessibility state was refreshed after the image; use current element IDs. Image-coordinate input requires a new stable capture."
            }
            state["screenshot"] = screenshotResult
            return state
        } catch {
            invalidateInputState()
            throw error
        }
    }

    func captureWindows() async throws -> [SCWindow] {
        try await captureWindowContent().windows
    }
    func captureWindowContent() async throws -> (content: SCShareableContent, windows: [SCWindow]) {
        try validateIdentity()
        try requireUnlockedNativeDesktop()
        guard CGPreflightScreenCaptureAccess() else { throw fail("PERMISSION_DENIED", "Screen Recording permission is required; no permission prompt was requested.") }
        initializeNativeGraphics()
        do {
            let content = try await screenshotShareableContent(currentProcessOnly: false, includedWindowIDs: nil)
            try validateIdentity()
            return (content, content.windows.filter { $0.owningApplication?.processID == app.processIdentifier && $0.frame.width > 0 && $0.frame.height > 0 })
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
        let capture = try await withNativeAsyncObservationPhase("screenshot-enumerate", pid: app.processIdentifier) { try await captureWindowContent() }
        let available = capture.windows
        let requestedId = params["windowId"] as? Int
        if params["windowId"] != nil && requestedId == nil { throw fail("INVALID_ARGUMENT", "windowId must be an integer.") }
        let focus = requestedId == nil && available.count > 1 ? try focusedCaptureWindow() : nil
        let selectedId = try selectCaptureWindow(available.map { CaptureWindowCandidate(id:Int($0.windowID),title:$0.title ?? "",frame:$0.frame) }, requestedId:requestedId, focusedFrame:focus?.frame, focusedTitle:focus?.title)
        guard let window = available.first(where: {Int($0.windowID) == selectedId}) else { throw fail("TARGET_NOT_FOUND", "Selected window disappeared.") }
        let originalFrame = window.frame
        // The selected on-screen window branch uses the restored frame-based
        // size and configuration path. Deployment limits remain adapter policy.
        let selection = screenshotSingleWindowFilter(window: window)
        let filter = selection.filter
        let scale = Double(filter.pointPixelScale)
        let rect = filter.contentRect
        let size = screenshotCaptureSize(imageSize: nil, baseSize: selection.baseSize,
            pointPixelScale: { filter.pointPixelScale })
        guard let dimensions = screenshotPixelDimensions(size),
              dimensions.width <= 8192, dimensions.height <= 8192,
              dimensions.width * dimensions.height <= 32_000_000 else {
            throw fail("INVALID_ARGUMENT", "Window exceeds screenshot dimension budget.")
        }
        let image: CGImage
        do { image = try await withNativeAsyncObservationPhase("screenshot-sdk-capture", pid: app.processIdentifier) {
            try await ScreenshotImplementation.captureScreenshotBuffer(content: capture.content,
                appName: nil, imageSize: size, includedWindowIDs: [window.windowID],
                cropToFirstWindow: false, shouldBeOpaque: SCStreamConfiguration().shouldBeOpaque,
                includeWindowShadow: false)
        } }
        catch { throw fail("PROVIDER_DISCONNECTED", "Window screenshot failed: \(error.localizedDescription)") }
        try validateIdentity()
        let current = try await withNativeAsyncObservationPhase("screenshot-reenumerate", pid: app.processIdentifier) { try await captureWindows() }
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
