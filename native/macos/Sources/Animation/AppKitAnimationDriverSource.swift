import AppKit

extension NSWindow: AnimationDriverSource {
    public func makeAnimationDriver() -> AnimationDriver {
        MainActor.assumeIsolated { DisplayLinkAnimationDriver { displayLink(target: $0, selector: $1) } }
    }
}
extension NSView: AnimationDriverSource {
    public func makeAnimationDriver() -> AnimationDriver {
        MainActor.assumeIsolated { DisplayLinkAnimationDriver { displayLink(target: $0, selector: $1) } }
    }
}
extension NSScreen: AnimationDriverSource {
    public func makeAnimationDriver() -> AnimationDriver {
        MainActor.assumeIsolated { DisplayLinkAnimationDriver { displayLink(target: $0, selector: $1) } }
    }
}
