// Nested InterpolatableAnimation.Event descriptor 0x1012cdb98.
// Standalone name until the generic native animation owner is restored.
public enum InterpolatableAnimationEvent<Value> {
    case valueChanged(oldValue: Value, newValue: Value)
    case finished(Value)
    case retargeted(fromValue: Value, toValue: Value)
}
