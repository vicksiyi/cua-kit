import Animation
import CoreGraphics

// Per-field phase repeated at 0x10009a394..0x10009a670. Clear the
// original handler, then reload the owner field before checking/stopping it.
// Handler destruction may have replaced the animation.
@MainActor
func stopAndClearCursorScootAnimation<Owner: AnyObject>(
    _ owner: Owner, at keyPath: ReferenceWritableKeyPath<Owner, SpringAnimation<CGFloat>?>
) {
    let hadAnimation = { () -> Bool in
        guard let animation = owner[keyPath: keyPath] else { return false }
        animation.eventHandler = nil
        return true
    }()
    if hadAnimation, let current = owner[keyPath: keyPath], current.state != .ended {
        current.stop(immediately: true)
    }
    owner[keyPath: keyPath] = nil
}
