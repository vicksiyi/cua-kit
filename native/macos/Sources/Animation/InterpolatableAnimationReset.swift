// Source reset 0x1007c5b14: clear startTime before assigning .ready
// through the same state setter. Value/target/handlers are not cleared here.
public func resetInterpolatableAnimation(
    clearStartTime: () -> Void, setState: (AnimationState) -> Void
) {
    clearStartTime()
    setState(.ready)
}
