// Native state setter 0x1007c580c -> observer 0x1007c5f0c.
// Assignment always occurs; only a changed state reaches the coordinator.
public func setInterpolatableAnimationState(
    _ state: AnimationState, read: () -> AnimationState,
    write: (AnimationState) -> Void, notifyCoordinator: (AnimationState) -> Void
) {
    let previous = read()
    write(state)
    let current = read()
    if current != previous { notifyCoordinator(current) }
}
