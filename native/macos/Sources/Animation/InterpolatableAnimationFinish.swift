// Natural completion 0x1007c5bbc. Unlike immediate stop, emit finished
// before assigning ended. Apply target through the value-change path first.
public func finishInterpolatableAnimation<Value>(
    applyTarget: () -> Void,
    handler: () -> ((InterpolatableAnimationEvent<Value>) -> Void)?,
    targetValue: () -> Value, setState: (AnimationState) -> Void
) {
    applyTarget()
    if let callback = handler() { callback(.finished(targetValue())) }
    setState(.ended)
}
