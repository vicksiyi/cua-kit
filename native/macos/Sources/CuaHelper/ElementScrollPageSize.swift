import CoreGraphics

// IPC element-scroll continuation 0x100161200: read frame once; only a nil
// frame reads controller.visibleRect. A present empty frame is not a fallback.
func elementScrollPageSize(
    readFrame: () -> CGRect?,
    readVisibleRect: () -> CGRect
) -> CGSize {
    if let frame = readFrame() { return frame.size }
    return readVisibleRect().size
}
