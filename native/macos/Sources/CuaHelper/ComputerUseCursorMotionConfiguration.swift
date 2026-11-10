import CoreGraphics

// Native MotionConfiguration descriptor 0x1012bd97c; live initialization
// 0x10008fac4 copies 30 fields without validation.
struct ComputerUseCursorMotionConfiguration: Equatable {
    var clickAngle: CGFloat
    var candidateCount: Int
    var boundsMargin: CGFloat
    var startHandle: CGFloat
    var endpointHandle: CGFloat
    var arcSize: CGFloat
    var arcFlow: CGFloat
    var straightPathDistanceThreshold: CGFloat
    var springResponseScaler: Double
    var springResponseMin: Double
    var springResponseMax: Double
    var springDampingFraction: Double
    var scootDistanceThreshold: CGFloat
    var scootPositionResponse: Double
    var scootPositionDampingFraction: Double
    var scootPositionSettleVelocity: CGFloat
    var scootAxisResponse: Double
    var scootAxisDampingFraction: Double
    var scootBaseRotationResponse: Double
    var scootBaseRotationDampingFraction: Double
    var scootStretchResponse: Double
    var scootStretchDampingFraction: Double
    var scootStretchMin: CGFloat
    var scootStretchPivotX: CGFloat
    var scootStretchXAmount: CGFloat
    var scootSquashYAmount: CGFloat
    var scootRotationResponse: Double
    var scootRotationDampingFraction: Double
    var scootRotationMax: CGFloat
    var terminalTangentBlendStart: CGFloat

    static let live = Self(
        clickAngle: -44.0,
        candidateCount: 20,
        boundsMargin: 20.0,
        startHandle: 0.41960295031576633,
        endpointHandle: 0.15,
        arcSize: 0.2765523188064277,
        arcFlow: 0.5783555327868779,
        straightPathDistanceThreshold: 10.0,
        springResponseScaler: 0.9,
        springResponseMin: 0.12,
        springResponseMax: 2.2,
        springDampingFraction: 0.9,
        scootDistanceThreshold: 196.0,
        scootPositionResponse: 0.24,
        scootPositionDampingFraction: 0.84,
        scootPositionSettleVelocity: 12.0,
        scootAxisResponse: 0.07,
        scootAxisDampingFraction: 0.82,
        scootBaseRotationResponse: 0.09,
        scootBaseRotationDampingFraction: 0.86,
        scootStretchResponse: 0.095,
        scootStretchDampingFraction: 0.72,
        scootStretchMin: 0.0,
        scootStretchPivotX: 0.5,
        scootStretchXAmount: 0.38,
        scootSquashYAmount: 0.18,
        scootRotationResponse: 0.055,
        scootRotationDampingFraction: 0.76,
        scootRotationMax: 76.0,
        terminalTangentBlendStart: 0.99
    )
}
