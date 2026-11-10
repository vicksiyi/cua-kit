import SwiftUI

extension ComputerUseCursorWindow {
    // Native0x1000993e8: captured style for base angle, fresh style for tilt.
    func refreshScootOrientation() {
        let capturedStyle = style
        var angle = cursorScootResetAngle(clickAngle: motionConfiguration.clickAngle)
        let offset = Angle.radians(Double(cursorScootBaseRotationOffset * 0.017453292519943295))
        angle.animatableData = offset.animatableData + angle.animatableData
        capturedStyle.angle = angle
        style.scootTiltAngle = .radians(Double(cursorScootRotationOffset * 0.017453292519943295))
    }
}
