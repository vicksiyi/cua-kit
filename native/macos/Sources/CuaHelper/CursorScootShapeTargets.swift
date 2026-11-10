import CoreGraphics

struct CursorScootShapeTargets {
    let scale: CGFloat
    let xScale: CGFloat
    let pivotX: CGFloat
    let tiltDegrees: CGFloat
}

// Native tick0x100097658..0x1000976c4 supplies targets to auxiliary
// springs. These values must not be assigned as instantaneous transforms.
func cursorScootShapeTargets(envelope: CGFloat, direction: CGPoint, axisPivotX: CGFloat,
    configuration: ComputerUseCursorMotionConfiguration
) -> CursorScootShapeTargets {
    let compression = envelope * (1 - configuration.scootStretchMin)
    let scale = 1 - configuration.scootSquashYAmount * compression
    let xScale = envelope * configuration.scootStretchXAmount + 1
    let pivot = envelope * axisPivotX + (1 - envelope) * configuration.scootStretchPivotX
    let rawTilt = direction.x * 0.75 + direction.y * 0.62
    let upper: CGFloat = rawTilt > 1 ? 1 : rawTilt
    let bounded: CGFloat = rawTilt <= -1 ? -1 : upper
    let tilt = envelope * (bounded * configuration.scootRotationMax)
    return CursorScootShapeTargets(scale: scale, xScale: xScale, pivotX: pivot, tiltDegrees: tilt)
}
