import CoreGraphics

enum ScrollFrameAxis: CaseIterable {
    // Native tuple sequence is vertical, then horizontal.
    case vertical, horizontal
    func minimum(_ frame: CGRect) -> CGFloat { self == .vertical ? frame.minY : frame.minX }
    func maximum(_ frame: CGRect) -> CGFloat { self == .vertical ? frame.maxY : frame.maxX }
    func size(_ frame: CGRect) -> CGFloat { self == .vertical ? frame.height : frame.width }
}

// Frame helper0x1007a08d8: concrete AX readers/writers are boundaries so the
// same recovered flow can run against the existing provider implementation.
func adjustUIElementScrollFrame<Bar>(target: CGRect,
    containerFrame: () -> CGRect?, scrollBar: (ScrollFrameAxis) -> Bar?,
    enabled: (Bar) -> Bool?, contentFrame: () -> CGRect,
    currentValue: (Bar) -> CGFloat?, write: (Bar, CGFloat) throws -> Void
) throws -> Bool {
    guard let viewport = prepareScrollFrameAdjustment(target: target, containerFrame: containerFrame) else {
        return false
    }
    var requested = false
    for axis in ScrollFrameAxis.allCases {
        guard let bar = scrollBar(axis), enabled(bar) != false else { continue }
        let changed = try applyScrollBarPosition(targetMin: axis.minimum(target), targetMax: axis.maximum(target),
            viewportMin: axis.minimum(viewport), viewportMax: axis.maximum(viewport), viewportSize: axis.size(viewport),
            contentGeometry: {
                let frame = contentFrame()
                return (axis.minimum(frame), axis.size(frame))
            }, currentValue: { currentValue(bar) }, write: { try write(bar, $0) })
        requested = changed || requested
    }
    return requested
}
