// Native base class, descriptor 0x1012cde44. Base start/stop share a single
// ret at 0x100009888; scheduling belongs to DisplayLinkAnimationDriver.
open class AnimationDriver {
    public init() {}
    public var frameCallback: (@MainActor @Sendable (AnimationUpdate) -> Void)?
    public var isActive = false
    open func start() {}
    open func stop() {}
}
