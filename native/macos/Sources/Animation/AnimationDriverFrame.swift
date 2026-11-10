import Foundation
import QuartzCore

// Native handler frame body 0x1007c9fb4: snapshot values, prune ended before
// and after tick, commit implicit-action suppression, then invalidate if empty.
public func performAnimationDriverFrame(
    with update: AnimationUpdate, snapshot: () -> [any Animation],
    remove: (UUID) -> Void, isEmpty: () -> Bool,
    stopDriver: () -> Void, invalidation: () -> (() -> Void)?
) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    do {
        let animations = snapshot()
        for animation in animations {
            if animation.state == .ended {
                remove(animation.id)
            } else {
                animation.performTick(with: update)
                if animation.state == .ended { remove(animation.id) }
            }
        }
        withExtendedLifetime(animations) {}
    }
    CATransaction.commit()
    if isEmpty() {
        stopDriver()
        if let callback = invalidation() { callback() }
    }
}
