import CoreGraphics

// Native frame helper prefix0x1007a0970..0x1007a0a00. Invalid target frames
// must not cause any container geometry or scrollbar reads.
func prepareScrollFrameAdjustment(target: CGRect, containerFrame: () -> CGRect?) -> CGRect? {
    guard !target.isInfinite, !target.isEmpty else { return nil }
    guard let frame = containerFrame(), !frame.contains(target) else { return nil }
    return frame
}
