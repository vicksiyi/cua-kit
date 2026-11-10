import Foundation
import CoreGraphics
import SystemSoftware

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
        print("SystemSoftware injected capture checks passed (no private SPI invocation)")
    }
}
