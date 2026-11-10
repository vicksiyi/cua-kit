import Foundation

// Native descriptor 0x1012cda34: seven stored fields. Subclasses supply their
// interpolation kernel; the native base kernel returns nil, not a linear value.
open class InterpolatableAnimation<Value: SIMDRepresentable>: Animation {
    public typealias Event = InterpolatableAnimationEvent<Value>
    public let id: UUID
    @SIMDValue public var value: Value
    // Wrapped writes notify; synthesized projected writes deliberately bypass
    // this observer, matching native $targetValue.setter -> 0x1007c6910.
    @SIMDValue public var targetValue: Value {
        didSet {
            guard state == .running, !(oldValue == targetValue) else { return }
            state = .retargeted
            if let callback = eventHandler {
                callback(.retargeted(fromValue: oldValue, toValue: targetValue))
            }
        }
    }
    public var eventHandler: ((Event) -> Void)?
    public var state: AnimationState = .ready {
        didSet {
            if state != oldValue { notifyStateChange(state) }
        }
    }
    @SIMDValue public var initialValue: Value
    public var startTime: Double?

    // Storage initialization seam: native subclass constructors inline these
    // assignments; this is not claimed as a recovered public base constructor.
    public init(restoredValue value: Value, targetValue: Value, id: UUID = UUID()) {
        self.id = id
        // Native 0x1007c679c/67b4/67e8 initializes all wrappers from
        // Value.zero before the supplied values are assigned. Custom Value
        // conversions can observe this order; direct nonzero initialization
        // is not equivalent even when the final vectors compare equal.
        // SIMDValue.init() is synthesized at the property declarations;
        // do not repeat zero initialization in this body.
        _value.wrappedValue = value
        _initialValue.wrappedValue = value
        changeInterpolatableAnimationTarget(readTarget: { self.targetValue },
            mutate: { self._targetValue.wrappedValue = targetValue },
            state: { self.state }, setState: { self.state = $0 },
            handler: { self.eventHandler })
    }

    private func notifyStateChange(_ state: AnimationState) {
        // Original coordinator runs on MainActor. Callers must tick/mutate the
        // animation there; preserve synchronous completion/event ordering.
        MainActor.assumeIsolated {
            AnimationCoordinator.shared.animationStateDidChange(id: id, state: state)
        }
    }

    open func reset() {
        resetInterpolatableAnimation(clearStartTime: { self.startTime = nil },
            setState: { self.state = $0 })
    }
    open func start(at timestamp: Double) {
        startInterpolatableAnimation(at: timestamp,
            setStartTime: { self.startTime = $0 }, currentValue: { self.value },
            setInitialValue: { self.initialValue = $0 })
    }
    // Base vtable slot 32, 0x1007c6408, returns false. Descriptive restored
    // method name: redacted native method accepts an AnimationDescriptor.
    open func updateParameters(_ descriptor: AnimationDescriptor) -> Bool { false }
    open func interpolate(with update: AnimationUpdate) -> Value.SIMDType? { nil }
    open func performTick(with update: AnimationUpdate) {
        performInterpolatableAnimationTick(with: update, state: { self.state },
            initialize: { self.start(at: $0) }, setState: { self.state = $0 },
            interpolate: { self.interpolate(with: $0) },
            applyValue: { projected in self.changeValue { self.$value = projected } },
            finish: { self.finish() })
    }
    public func changeValue(_ mutate: () -> Void) {
        changeInterpolatableAnimationValue(readValue: { self.value }, mutate: mutate,
            handler: { self.eventHandler })
    }
    open func finish() {
        finishInterpolatableAnimation(applyTarget: { self.changeValue { self.value = self.targetValue } },
            handler: { self.eventHandler }, targetValue: { self.targetValue },
            setState: { self.state = $0 })
    }
    open func stop(immediately: Bool) {
        stopInterpolatableAnimation(immediately: immediately,
            setState: { self.state = $0 }, handler: { self.eventHandler },
            value: { self.value }, retarget: { self.targetValue = $0 })
    }
}
