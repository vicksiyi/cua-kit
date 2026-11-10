// Native descriptor 0x1012ce4c4 has exactly these two payload cases.
// Duration/SwiftUI/CAAnimation adapters are restored separately.
public enum AnimationDescriptor: Hashable {
    case bezier(BezierParameters)
    case spring(SpringParameters)

    // Native 0x1007ea778: matching concrete subclass, initial/target forwarded;
    // Spring factory passes an absent idleVelocityThreshold.
    public func makeAnimation<Value: SIMDRepresentable>(from initialValue: Value, to targetValue: Value)
        -> InterpolatableAnimation<Value> {
        switch self {
        case .bezier(let parameters):
            return BezierAnimation(parameters, initialValue: initialValue, targetValue: targetValue)
        case .spring(let parameters):
            return SpringAnimation(parameters, initialValue: initialValue, targetValue: targetValue,
                idleVelocityThreshold: nil)
        }
    }
}
