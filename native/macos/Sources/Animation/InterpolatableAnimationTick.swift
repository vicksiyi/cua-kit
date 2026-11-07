// Source performTick 0x1007c61b8: initialize every non-running state,
// transition to running, then request a projected value or natural completion.
// The interpolation kernel and value-change notification remain boundaries.
public func performInterpolatableAnimationTick<Projected>(
    with update: AnimationUpdate, state: () -> AnimationState,
    initialize: (Double) -> Void, setState: (AnimationState) -> Void,
    interpolate: (AnimationUpdate) -> Projected?,
    applyValue: (Projected) -> Void, finish: () -> Void
) {
    if state() != .running { initialize(update.timestamp) }
    setState(.running)
    if let value = interpolate(update) { applyValue(value) }
    else { finish() }
}
