import CoreGraphics
import ScreenCaptureKit

extension ScreenshotImplementation {
    // Buffer body after shareable content acquisition (fb8340..fb94a4).
    // Delay/acquisition, file encoding and signpost wrappers are separate stages.
    static func captureScreenshotBuffer(content: SCShareableContent,
        appName: String?, imageSize: CGSize?, includedWindowIDs: [UInt32]?,
        cropToFirstWindow: Bool, shouldBeOpaque: Bool, includeWindowShadow: Bool
    ) async throws -> CGImage {
        let selected = selectScreenshotWindow(in: content,
            includedWindowIDs: includedWindowIDs, appName: appName)
        let windows = Dictionary(uniqueKeysWithValues: content.windows.map { ($0.windowID, $0) })
        if let offscreen = screenshotOffscreenPlan(selectedWindow: selected,
            includedWindowIDs: includedWindowIDs, cropToFirstWindow: cropToFirstWindow,
            lookup: { windows[$0] }, isOnScreen: { $0.isOnScreen },
            windowID: { $0.windowID }, frame: { $0.frame }) {
            guard let image = captureOffscreenScreenshot(plan: offscreen, imageSize: imageSize) else {
                throw Error.screenCaptureFailed
            }
            return image
        }
        let filter: SCContentFilter
        let baseSize: CGSize
        let sourceRect: CGRect?
        if let selected {
            let plan = screenshotSingleWindowFilter(window: selected)
            (filter, baseSize, sourceRect) = (plan.filter, plan.baseSize, plan.sourceRect)
        } else if let includedWindowIDs {
            let plan = try screenshotIncludedDisplayPlan(includedWindowIDs: includedWindowIDs,
                cropToFirstWindow: cropToFirstWindow, lookup: { windows[$0] },
                windowFrame: { $0.frame }, displays: { content.displays }, displayFrame: { $0.frame })
            let binding = screenshotDisplayFilter(display: plan.display,
                includedWindows: plan.windows, region: plan.region)
            (filter, baseSize, sourceRect) = (binding.filter, binding.baseSize, binding.sourceRect)
        } else {
            guard let display = content.displays.first else { throw Error.screenCaptureFailed }
            let plan = screenshotFullDisplayFilter(display: display)
            (filter, baseSize, sourceRect) = (plan.filter, plan.baseSize, plan.sourceRect)
        }
        let configuration = screenshotStreamConfiguration(shouldBeOpaque: shouldBeOpaque,
            includeWindowShadow: includeWindowShadow)
        let size = screenshotCaptureSize(imageSize: imageSize, baseSize: baseSize,
            pointPixelScale: { filter.pointPixelScale })
        guard let dimensions = screenshotPixelDimensions(size) else {
            throw Error.invalidCaptureSize(size)
        }
        configuration.width = dimensions.width
        configuration.height = dimensions.height
        if let sourceRect { configuration.sourceRect = sourceRect }
        return try await captureScreenScreenshot(filter: filter, configuration: configuration)
    }
}

extension ScreenshotImplementation {
    // Injectable acquisition boundary for staged/owned verification. The native
    // policy overload below supplies original application-window selection.
    static func captureScreenshotBuffer(appName: String?, delay: Int?, imageSize: CGSize?,
        includedWindowIDs: [UInt32]?, cropToFirstWindow: Bool, shouldBeOpaque: Bool,
        includeWindowShadow: Bool, acquireContent: () async throws -> SCShareableContent
    ) async throws -> CGImage {
        try await captureScreenshotAfterDelay(delay: delay, acquire: acquireContent, capture: { content in
            try await captureScreenshotBuffer(content: content, appName: appName,
                imageSize: imageSize, includedWindowIDs: includedWindowIDs,
                cropToFirstWindow: cropToFirstWindow, shouldBeOpaque: shouldBeOpaque,
                includeWindowShadow: includeWindowShadow)
        })
    }
}

extension ScreenshotImplementation {
    // Original argument surface, with caller-provided values until the separate
    // default-argument generators are recovered. Acquisition policy is native.
    static func captureScreenshotBuffer(appName: String?, delay: Int?, imageSize: CGSize?,
        includedWindowIDs: [UInt32]?, cropToFirstWindow: Bool, shouldBeOpaque: Bool,
        includeWindowShadow: Bool
    ) async throws -> CGImage {
        try await captureScreenshotBuffer(appName: appName, delay: delay, imageSize: imageSize,
            includedWindowIDs: includedWindowIDs, cropToFirstWindow: cropToFirstWindow,
            shouldBeOpaque: shouldBeOpaque, includeWindowShadow: includeWindowShadow,
            acquireContent: {
                let currentProcessOnly = screenshotUsesCurrentProcess(includedWindowIDs: includedWindowIDs)
                return try await screenshotShareableContent(currentProcessOnly: currentProcessOnly,
                    includedWindowIDs: includedWindowIDs)
            })
    }
}
