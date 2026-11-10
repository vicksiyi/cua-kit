import CoreGraphics

// Nominal descriptor 0x1012ea6ac: zero-case enum namespace. Error descriptor
// 0x1012ea708 / field descriptor 0x10134694c: one CGSize payload case and
// one empty case. Buffer failure sites store tag 0/size or tag 1 respectively.
public enum ScreenshotImplementation {
    public enum Error: Swift.Error {
        case invalidCaptureSize(CGSize)
        case screenCaptureFailed
    }
}
