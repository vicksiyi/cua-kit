import Foundation
import CoreGraphics
import AppKit
import SystemSoftware

// Transitional local name; storage/decoding and original lookup now belong
// to SystemSoftware.CGWindow, rather than a second adapter-owned value type.
typealias NativeWindowDescription = SystemSoftware.CGWindow

func systemNativeWindowDescription(_ id: UInt32) -> NativeWindowDescription? {
    CGWindow.window(for: id)
}

func systemNativeWindow(at point: CGPoint, belowWindowID: UInt32 = 0) -> NativeWindowDescription? {
    CGWindow.window(at: point, belowWindowID: belowWindowID)
}
