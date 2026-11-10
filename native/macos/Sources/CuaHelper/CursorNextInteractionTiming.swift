import CoreGraphics

extension ComputerUseCursor {
    // Native descriptors 0x1012bdb24 / 0x1012bdb40. Timing has two plain cases,
    // not an associated configuration payload.
    struct CloseEnoughConfiguration: Equatable {
        var progressThreshold: CGFloat
        var distanceThreshold: CGFloat
        static let `default` = Self(progressThreshold: 0.995, distanceThreshold: 3.157)
    }

    enum CursorNextInteractionTiming: Hashable {
        case closeEnough
        case finished
    }
}

extension ComputerUseCursorWindow {
    // Extracted threshold stage common to both native motion tick paths,
    // 0x1000978f8..0x1000979b4 and 0x100097d7c..0x100097e08.
    func updateCloseEnoughInteraction(progress: CGFloat, distance: CGFloat) {
        let configuration = ComputerUseCursor.CloseEnoughConfiguration.default
        guard progress >= configuration.progressThreshold,
              distance <= configuration.distanceThreshold,
              !cursorMotionDidSatisfyNextInteractionTiming else { return }
        cursorMotionDidSatisfyNextInteractionTiming = true
        cursorMotionNextInteractionTimingHandler?()
        // The source clears the live slot after callback reentrancy, including
        // any replacement installed by that callback.
        cursorMotionNextInteractionTimingHandler = nil
    }
}
