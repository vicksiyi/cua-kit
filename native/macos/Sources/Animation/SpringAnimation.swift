// Native descriptor 0x1012cdbd4 adds only simulation to the base fields.
public final class SpringAnimation<Value: SIMDRepresentable>: InterpolatableAnimation<Value> {
    private var simulation: VelocityVerletSimulation<Value.SIMDType>
    public var velocity: Value.SIMDType { simulation.velocity }
    public var isLogicallyComplete: Bool {
        springAnimationIsLogicallyComplete(startTime: startTime, state: state,
            simulationTime: simulation.time, response: simulation.configuration.response)
    }

    public init(_ parameters: SpringParameters, initialValue: Value, targetValue: Value,
        idleVelocityThreshold: Value.SIMDType.Scalar? = nil) {
        simulation = .init(configuration: .init(response: parameters.response,
            dampingFraction: parameters.dampingFraction, idleVelocityThreshold: idleVelocityThreshold),
            time: 0, velocity: .zero, force: .zero)
        super.init(restoredValue: initialValue, targetValue: targetValue)
    }
    public override func start(at timestamp: Double) {
        simulation.time = timestamp
        super.start(at: timestamp)
    }
    public override func reset() {
        simulation.reset()
        super.reset()
    }
    public func setSpring(_ parameters: SpringParameters) {
        simulation.configuration = .init(response: parameters.response,
            dampingFraction: parameters.dampingFraction,
            idleVelocityThreshold: simulation.configuration.idleVelocityThreshold)
    }
    public override func updateParameters(_ descriptor: AnimationDescriptor) -> Bool {
        guard case .spring(let parameters) = descriptor else { return false }
        setSpring(parameters)
        return true
    }
    public override func interpolate(with update: AnimationUpdate) -> Value.SIMDType? {
        var position = $value
        let target = $targetValue
        simulation.advance(to: update.targetTimestamp, position: &position, target: target)
        // Native checks a simulation copy after advancing; idle yields nil so
        // inherited finish applies the exact target and emits completion.
        let snapshot = simulation
        return snapshot.isIdle(position: position, target: target) ? nil : position
    }
}
