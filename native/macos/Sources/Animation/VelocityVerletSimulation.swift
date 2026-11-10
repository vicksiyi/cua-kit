// Native private simulation descriptor 0x1012ce488; nested Configuration
// descriptor 0x1012ce44c. Integration and completion criteria follow.
public struct VelocityVerletSimulation<Vector: AnimatableVector> {
    public var configuration: Configuration
    public var time: Double
    public var velocity: Vector
    public var force: Vector

    // Native memberwise initializer 0x1007e7eb4 copies supplied fields.
    public init(configuration: Configuration, time: Double, velocity: Vector, force: Vector) {
        self.configuration = configuration
        self.time = time
        self.velocity = velocity
        self.force = force
    }

    // 0x1007e7f84 resets motion vectors only. Time/configuration persist.
    public mutating func reset() {
        velocity = .zero
        force = .zero
    }

    // Early gate only; a false result still requires the native position test.
    public var exceedsMotionThreshold: Bool {
        velocityVerletExceedsMotionThreshold(velocity: velocity, force: force,
            threshold: configuration.idleVelocityThreshold)
    }

    public func isIdle(position: Vector, target: Vector) -> Bool {
        velocityVerletIsIdle(position: position, target: target, velocity: velocity, force: force,
            threshold: configuration.idleVelocityThreshold)
    }

    // Physical step 0x1007e8d54. Position is the external inout value.
    // Simulation time is advanced by the caller's time loop, not by this step.
    public mutating func step(position: inout Vector, target: Vector) {
        let halfVelocity = velocityVerletHalfKick(velocity: velocity, force: force, dt: configuration.dt)
        position = velocityVerletDrift(position: position, halfStepVelocity: halfVelocity, dt: configuration.dt)
        force = velocityVerletForce(position: position, target: target, halfStepVelocity: halfVelocity,
            stiffness: configuration.stiffness, drag: configuration.drag)
        velocity = velocityVerletHalfKick(velocity: halfVelocity, force: force, dt: configuration.dt)
    }

    public mutating func advance(to targetTime: Double, position: inout Vector, target: Vector) {
        advanceTime(to: targetTime) { state in state.step(position: &position, target: target) }
    }

    // Native time loop 0x1007e8048. The integration callback is an explicit
    // restoration boundary until the recovered physical step is connected.
    public mutating func advanceTime(to targetTime: Double, step: (inout Self) -> Void) {
        if targetTime - time > 1 { time = targetTime + (-0.016666666666666666) }
        while time < targetTime {
            step(&self)
            time += configuration.dt
        }
    }

    public struct Configuration {
        public let response: Vector.Scalar
        public let stiffness: Vector.Scalar
        public let drag: Vector.Scalar
        public var dt: Double
        public let idleVelocityThreshold: Vector.Scalar

        // 0x1007e7b64: convert parameters before scalar arithmetic, bound
        // stiffness at 28800, then compute drag from that bounded stiffness.
        public init(response: Double, dampingFraction: Double,
            idleVelocityThreshold: Vector.Scalar? = nil) {
            dt = 0.004166666666666667
            self.response = Vector.Scalar(response)
            let damping = Vector.Scalar(dampingFraction)
            stiffness = Swift.min(velocityVerletStiffness(response: self.response), Vector.Scalar(28800.0))
            drag = velocityVerletDrag(dampingFraction: damping, stiffness: stiffness)
            self.idleVelocityThreshold = idleVelocityThreshold ?? Vector.Scalar(0.06)
        }
    }
}
