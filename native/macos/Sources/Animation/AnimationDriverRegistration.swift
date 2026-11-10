import Foundation

// Native non-delayed registration branch 0x1007c93cc..0x1007c94bc.
// Ended animations remove the live key; other states insert/replace it.
// Both branches proceed to the driver's guarded activation path.
public func registerImmediateAnimation(
    _ animation: any Animation,
    insert: (UUID, any Animation) -> Void, remove: (UUID) -> Void,
    activate: () -> Void
) {
    if animation.state == .ended { remove(animation.id) }
    else { insert(animation.id, animation) }
    activate()
}
