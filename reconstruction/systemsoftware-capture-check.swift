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
        var associatedCalls: [String] = []
        let missing = WindowServerSPI.associatedWindowIDs(forWindow: 8,
            mainConnection: nil, query: { _, _ in associatedCalls.append("unexpected"); return [] })
        precondition(missing.isEmpty && associatedCalls.isEmpty)
        let missingQuery = WindowServerSPI.associatedWindowIDs(forWindow: 8,
            mainConnection: { associatedCalls.append("unexpected"); return nil }, query: nil)
        precondition(missingQuery.isEmpty && associatedCalls.isEmpty)
        let ids = WindowServerSPI.associatedWindowIDs(forWindow: 8,
            mainConnection: { associatedCalls.append("connection"); return nil },
            query: { connection, id in
                precondition(connection == nil && id == 8)
                associatedCalls.append("query"); return associated
            })
        precondition(ids == [7, UInt32.max, 7, 3, 0] && associatedCalls == ["connection", "query"])
        precondition(WindowServerSPI.associatedWindowIDs(forWindow: 0,
            mainConnection: { nil }, query: { _, _ in nil }).isEmpty)
        let radiusValues: NSArray = ["12", NSNumber(value: Double.nan), NSNumber(value: -2),
            NSNumber(value: Double.infinity), NSNumber(value: -0.0), NSNumber(value: 8)]
        let negativeZero = resolvedCornerRadiusValue(radiusValues)!
        precondition(negativeZero == 0 && negativeZero.sign == .minus)
        precondition(resolvedCornerRadiusValue([NSNumber(value: -Double.infinity), NSNull()]) == nil)
        precondition(resolvedCornerRadiusValue([NSNumber(value: Double.leastNonzeroMagnitude)]) == CGFloat(Double.leastNonzeroMagnitude))
        var cornerCalls: [String] = []
        let radius = queryResolvedCornerRadius(forWindow: 8,
            mainConnection: { cornerCalls.append("connection"); return nil },
            query: { connection, ids, flags -> String? in
                precondition(connection == nil && ids == [NSNumber(value: UInt32(8))] && flags == 0)
                cornerCalls.append("query"); return "query-result"
            }, makeIterator: { value -> String? in
                precondition(value == "query-result"); cornerCalls.append("iterator"); return "iterator"
            }, count: { _ in cornerCalls.append("count"); return 3 },
            windowID: { _, index in cornerCalls.append("id \(index)"); return index == 0 ? 7 : 8 },
            radii: { _, index in precondition(index == 1); cornerCalls.append("radii"); return [NSNumber(value: 12)] })
        precondition(radius == 12 && cornerCalls == ["connection", "query", "iterator", "count", "id 0", "id 1", "radii"])
        let failedRadius = queryResolvedCornerRadius(forWindow: 8,
            mainConnection: { nil }, query: { _, _, _ -> Int? in nil },
            makeIterator: { _ -> Int? in preconditionFailure("iterator after failed query") },
            count: { _ in preconditionFailure("count after failed query") },
            windowID: { _, _ in preconditionFailure("id after failed query") },
            radii: { _, _ in preconditionFailure("radii after failed query") })
        precondition(failedRadius == nil)
        let noMatch = queryResolvedCornerRadius(forWindow: 8,
            mainConnection: { nil }, query: { _, _, _ in 1 }, makeIterator: { $0 },
            count: { _ in 2 }, windowID: { _, _ in 7 },
            radii: { _, _ in preconditionFailure("radii for unmatched window") })
        precondition(noMatch == nil)
        var matchingReads = 0
        let missingFirstRadii = queryResolvedCornerRadius(forWindow: 8,
            mainConnection: { nil }, query: { _, _, _ in 1 }, makeIterator: { $0 },
            count: { _ in 2 }, windowID: { _, _ in matchingReads += 1; return 8 },
            radii: { _, _ in nil })
        precondition(missingFirstRadii == nil && matchingReads == 1)
        print("SystemSoftware injected capture checks passed (no private SPI invocation)")
    }
}
