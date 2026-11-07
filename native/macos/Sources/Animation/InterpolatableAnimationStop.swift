// Source stop(immediately:) 0x1007c606c. setState owns the original
// state-change notification boundary; handler is read after that notification.
public func stopInterpolatableAnimation<Value>(
    immediately: Bool, setState: (AnimationState) -> Void,
    handler: () -> ((InterpolatableAnimationEvent<Value>) -> Void)?,
    value: () -> Value, retarget: (Value) -> Void
) {
    if immediately {
        setState(.ended)
        if let callback = handler() { callback(.finished(value())) }
    } else {
        retarget(value())
    }
}
