import Foundation
import CoreGraphics
import SystemSoftware
import SlimCore

@main struct Check {
    static func main() {
        let options = WindowServerCaptureOptions.ignoreGlobalClipShape
        precondition(options.rawValue == 0x800)
        precondition(WindowServerEvent.isObscured.rawValue == 800)
        precondition(WindowServerEvent.didChangeOrder.rawValue == 808)
        let rect = CGRect(x: 2, y: 3, width: 4, height: 5)
        let connection = OpaquePointer(bitPattern: 0x1234)
        let absent = WindowServerSPI.captureWindowImagesInRect([1], options: options,
            rect: rect, connection: connection, capture: nil)
        precondition(absent == nil)
        var calls = 0
        let empty = WindowServerSPI.captureWindowImagesInRect([], options: options,
            rect: rect, connection: connection, capture: { _, _, _, _, _ in
                calls += 1; return []
            })
        precondition(empty == nil && calls == 0)
        let context = CGContext(data: nil, width: 4, height: 3, bitsPerComponent: 8,
            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let image = context.makeImage()!
        let result = WindowServerSPI.captureWindowImagesInRect([7, 7, 9], options: options,
            rect: rect, connection: connection, capture: { actual, ids, count, flags, region in
                calls += 1
                precondition(actual == connection && count == 3 && flags == 0x800 && region == rect)
                precondition(Array(UnsafeBufferPointer(start: ids, count: Int(count))) == [7, 7, 9])
                return [image]
            })
        precondition(calls == 1 && result?.first === image)
        let bridged = windowCaptureImages([image] as CFArray)
        precondition(bridged?.first === image)
        var captureStages: [String] = []
        let first: String? = captureAcceleratedWindowScreenshot([7, 7, 9], rect: rect,
            mainConnection: { captureStages.append("connection"); return connection },
            capture: { ids, options, region, actual in
                captureStages.append("capture")
                precondition(ids == [7, 7, 9] && options.rawValue == 0x800 && region == rect && actual == connection)
                return ["first", "second"]
            })
        precondition(first == "first" && captureStages == ["connection", "capture"])
        let noImage: String? = captureAcceleratedWindowScreenshot([], rect: rect,
            mainConnection: { nil }, capture: { _, _, _, _ in [] })
        precondition(noImage == nil)
        let plan = screenshotOffscreenPlan(selectedWindow: 7, includedWindowIDs: [7, 9],
            cropToFirstWindow: false, lookup: { _ in 7 }, isOnScreen: { _ in false },
            windowID: { UInt32($0) }, frame: { _ in rect })!
        var resized = false
        let failed: String? = captureOffscreenScreenshot(plan: plan, imageSize: rect.size,
            capture: { _, _ in nil }, resize: { image, _ in resized = true; return image })
        precondition(failed == nil && !resized)
        let retained: String? = captureOffscreenScreenshot(plan: plan, imageSize: rect.size,
            capture: { ids, region in precondition(ids == [7] && region == rect); return "captured" },
            resize: { _, size in resized = true; precondition(size == rect.size); return nil })
        precondition(retained == "captured" && resized)
        // NSNumber coercion is intentional: no Int(exactly:), string parsing,
        // deduplication or filtering of zero/bool/negative numeric values.
        let associated: NSArray = [NSNumber(value: 7), "9", NSNumber(value: -1),
            NSNumber(value: 7), NSNumber(value: 3.75), NSNull(), NSNumber(value: false)]
        precondition(associatedWindowIDValues(associated) == [7, UInt32.max, 7, 3, 0])
        precondition(associatedWindowIDValues([]) == [])
        print("SystemSoftware injected capture checks passed (no private SPI invocation)")
    }
}
