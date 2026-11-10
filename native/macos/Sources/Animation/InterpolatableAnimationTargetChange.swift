// Native target setter 0x1007c6580 and observer 0x1007c5d3c.
// State notification may replace the target/handler: reread after it returns.
public func changeInterpolatableAnimationTarget<Value: Equatable>(
    readTarget: () -> Value, mutate: () -> Void, state: () -> AnimationState,
    setState: (AnimationState) -> Void,
    handler: () -> ((InterpolatableAnimationEvent<Value>) -> Void)?
) {
    let previous = readTarget()
    mutate()
    guard state() == .running, !(previous == readTarget()) else { return }
    setState(.retargeted)
    if let callback = handler() {
        callback(.retargeted(fromValue: previous, toValue: readTarget()))
    }
}
