import Foundation

// Driver handler body 0x1007ca4dc. Snapshot UUID keys once, then reread each
// animation before stopping. A missing snapshotted key returns immediately.
public func stopAnimationDriverAnimations<Value>(
    keys: () -> [UUID], lookup: (UUID) -> Value?,
    stopImmediately: (Value) -> Void, remove: (UUID) -> Value?
) {
    let snapshot = keys()
    for id in snapshot {
        guard let animation = lookup(id) else { return }
        stopImmediately(animation)
        withExtendedLifetime(animation) {
            let removed = remove(id)
            withExtendedLifetime(removed) {}
        }
    }
}
