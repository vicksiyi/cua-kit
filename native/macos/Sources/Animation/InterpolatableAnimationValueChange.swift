// Source value-change wrapper 0x1007c591c. Both reads/mutation happen
// even without a handler; equality is evaluated only after a handler is found.
public func changeInterpolatableAnimationValue<Value: Equatable>(
    readValue: () -> Value, mutate: () -> Void,
    handler: () -> ((InterpolatableAnimationEvent<Value>) -> Void)?
) {
    let previous = readValue()
    mutate()
    let current = readValue()
    if let callback = handler(), !(current == previous) {
        callback(.valueChanged(oldValue: previous, newValue: current))
    }
}
