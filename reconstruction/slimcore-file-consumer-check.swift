import Foundation
import ScreenCaptureKit
import CoreGraphics
import ImageIO
import System
import UniformTypeIdentifiers
import SlimCore

// Typechecked as a separate consumer, without compiling implementation sources.
func checkSlimCoreFileSurface(_ path: FilePath, decoder: Decoder, encoder: Encoder) throws {
    let memory = DataFile(data: Data(), filename: "fixture", type: .data)
    let file = File.data(memory)
    let _: File.RepresentationType = memory.representationType
    _ = file.exists
    _ = file.isDirectory
    _ = file.type
    _ = file.filename
    _ = file.pathOrFilename
    _ = try file.fileSize
    _ = try file.path
    _ = try file.data
    _ = try file.textContents()
    _ = try DataFile(from: decoder)
    _ = try File(from: decoder)
    try file.encode(to: encoder)
    let owner = TemporaryFile(adoptingFileAt: path)
    let shot = ScreenshotFile(file: File(owner), url: URL(filePath: path.string), mimeType: "image/png")
    _ = shot.file
    _ = shot.url
    _ = shot.mimeType
    _ = File.filename(nil, reservedUTF16Count: 0, date: nil, type: .png)
    _ = File.directoryName(nil, reservedUTF16Count: 0, date: nil)
    _ = File.pathExtension(for: .png)
    _ = TemporaryFile.uniquePath(forFilename: "fixture", in: path)
    _ = NativeLogger.logger(for: DataFile.self)
}

func checkSlimCoreImageSurface(image: CGImage, source: CGImageSource, url: URL) throws {
    let encoding = ScreenshotEncoding.jpeg(compressionQuality: 0.8)
    _ = encoding == .png
    let destination = try ImageDestination(url: url, forType: .png)
    destination.add(image: image, compressionQuality: nil)
    destination.addImage(from: source, at: 0, maxPixelSize: nil)
    _ = destination.finalize()
    _ = ImageDestination.sessionFilenameCharacterCount
}

func checkSlimCoreScreenshotFileAPI(image: CGImage, url: URL) async throws {
    _ = ScreenshotImplementation.Error.screenCaptureFailed
    _ = ScreenshotImplementation.Error.invalidCaptureSize(CGSize(width: 0, height: 0))
    _ = try ScreenshotImplementation.writeScreenshotImage(to: url, screenshot: image, encoding: .png)
    _ = try ScreenshotImplementation.writeScreenshotToFile(appName: nil, screenshot: image, encoding: .png)
    _ = try await ScreenshotImplementation.captureScreenshotFileResult(capture: { image }, write: { image, encoding in
        try ScreenshotImplementation.writeScreenshotToFile(appName: nil, screenshot: image, encoding: encoding)
    })
}

func checkSlimCoreScreenshotGeometrySurface() throws {
    let region = CGRect(x: 0, y: 0, width: 4, height: 3)
    _ = screenshotCaptureSize(imageSize: nil, baseSize: region.size, pointPixelScale: { 2 })
    _ = screenshotPixelDimensions(region.size)
    _ = screenshotWindowRegion(includedWindowIDs: [1], cropToFirstWindow: true,
        lookup: { _ in region }, resolvedWindows: [region], frame: { $0 })
    let plan = try screenshotIncludedDisplayPlan(includedWindowIDs: [1], cropToFirstWindow: true,
        lookup: { _ in region }, windowFrame: { $0 }, displays: { [region] }, displayFrame: { $0 })
    _ = plan.windows; _ = plan.display; _ = plan.region
    _ = screenshotDisplay(for: region, displays: [region], frame: { $0 })
}

func checkSlimCoreScreenCaptureSurface(window: SCWindow, display: SCDisplay,
    filter: SCContentFilter
) async throws {
    _ = screenshotSingleWindowBaseSize(frame: { window.frame })
    _ = screenshotSingleWindowFilter(window: window)
    _ = screenshotDisplaySourceRect(region: window.frame, displayFrame: display.frame)
    _ = screenshotDisplayFilter(display: display, includedWindows: [window], region: window.frame)
    _ = screenshotFullDisplayFilter(display: display)
    let config = screenshotStreamConfiguration(shouldBeOpaque: true, includeWindowShadow: false)
    _ = screenshotStreamConfiguration(width: 4, height: 3, sourceRect: nil,
        shouldBeOpaque: true, includeWindowShadow: false)
    _ = screenshotStreamConfiguration(filter: filter, baseSize: window.frame.size,
        imageSize: nil, sourceRect: nil, shouldBeOpaque: true, includeWindowShadow: false)
    _ = try await captureScreenScreenshot(filter: filter, configuration: config)
}

func checkSlimCoreScreenshotPlanningSurface() async throws {
    let rect = CGRect(x: 0, y: 0, width: 4, height: 4)
    _ = screenshotContentScope(currentProcessOnly: false, supportsCurrentProcess: true,
        includedWindowIDs: nil, visibleWindowIDs: { [] })
    _ = screenshotUsesCurrentProcess(includedWindowIDs: nil)
    _ = matchingScreenshotAppWindow(in: ["Fixture"], appName: "Fixture", applicationName: { $0 })
    _ = selectScreenshotWindow(includedWindowIDs: [1], appName: nil,
        windows: { [1] }, windowID: { UInt32($0) }, matchingApp: { _ in nil })
    let plan = screenshotOffscreenPlan(selectedWindow: 1, includedWindowIDs: [1],
        cropToFirstWindow: false, lookup: { _ in 1 }, isOnScreen: { _ in false },
        windowID: { UInt32($0) }, frame: { _ in rect })
    _ = plan?.windowIDs; _ = plan?.rect
    _ = try await captureScreenshotAfterDelay(delay: nil, acquire: { 1 }, capture: { $0 })
}

// Compile-only exported acquisition entry; do not query the desktop here.
func checkAcquisitionModuleBoundary() async throws {
    let _: [UInt32] = onScreenMouseWindowIDs(createList: { _, _ in nil })
    let _: Int = try await acquireScreenshotContent(currentProcessOnly: false,
        supportsCurrentProcess: true, includedWindowIDs: nil,
        visibleWindowIDs: { [] }, acquire: { _ in 1 })
    let _: SCShareableContent = try await screenshotShareableContent(
        currentProcessOnly: false, includedWindowIDs: nil)
}

// Compile-only complete recovered screenshot entry surfaces; not executed.
func checkScreenshotEntryModuleBoundary(content: SCShareableContent) async throws {
    let _: CGImage = try await ScreenshotImplementation.captureScreenshotBuffer(content: content,
        appName: nil, imageSize: nil, includedWindowIDs: nil, cropToFirstWindow: false,
        shouldBeOpaque: true, includeWindowShadow: false)
    let _: CGImage = try await ScreenshotImplementation.captureScreenshotBuffer(appName: nil,
        delay: nil, imageSize: nil, includedWindowIDs: nil, cropToFirstWindow: false,
        shouldBeOpaque: true, includeWindowShadow: false)
    let _: File = try await ScreenshotImplementation.captureScreenshotFile(appName: nil,
        delay: nil, imageSize: nil, includedWindowIDs: nil, cropToFirstWindow: false)
}
