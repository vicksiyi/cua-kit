// Native class descriptor 0x1012cd974, initializer 0x1007c2f1c ->
// 0x1007c3ab0: resolve curve into the vector scalar before initializing base.
public final class BezierAnimation<Value: SIMDRepresentable>: InterpolatableAnimation<Value> {
    private var parameters: (curve: BezierFunction<Value.SIMDType.Scalar>, duration: Double)

    public init(_ parameters: BezierParameters, initialValue: Value, targetValue: Value) {
        self.parameters = resolveBezierAnimationParameters(parameters, as: Value.SIMDType.Scalar.self)
        super.init(restoredValue: initialValue, targetValue: targetValue)
    }

    // 0x1007c2f80: another descriptor case returns false without mutation;
    // matching Bezier parameters replace curve/duration without resetting time.
    public override func updateParameters(_ descriptor: AnimationDescriptor) -> Bool {
        guard case .bezier(let parameters) = descriptor else { return false }
        self.parameters = resolveBezierAnimationParameters(parameters, as: Value.SIMDType.Scalar.self)
        return true
    }

    public override func interpolate(with update: AnimationUpdate) -> Value.SIMDType? {
        interpolateBezierAnimationValue(with: update, startTime: startTime,
            duration: parameters.duration, curve: parameters.curve,
            initial: $initialValue, target: $targetValue)
    }
}
