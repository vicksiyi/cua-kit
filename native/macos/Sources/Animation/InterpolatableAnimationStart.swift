// Native 0x1007c5b34 writes startTime first, then snapshots the wrapped current
// value into initialValue. No state transition or event is emitted here.
public func startInterpolatableAnimation<Value>(
    at timestamp: Double, setStartTime: (Double) -> Void,
    currentValue: () -> Value, setInitialValue: (Value) -> Void
) {
    setStartTime(timestamp)
    setInitialValue(currentValue())
}
