import AppKit
import QuartzCore

// Native display-link subclass 0x1007d73e4, start 0x1007d790c,
// stop 0x1007d757c and frame delivery 0x1007d79c4.
public final class DisplayLinkAnimationDriver: AnimationDriver {
    private var displayLink: CADisplayLink!
    @MainActor public init(makeDisplayLink: (AnyObject, Selector) -> CADisplayLink) {
        super.init()
        displayLink = makeDisplayLink(self, #selector(displayLinkDidFire))
    }
    public override func start() {
        guard !isActive else { return }
        isActive = true
        displayLink.add(to: .current, forMode: .common)
    }
    public override func stop() {
        guard isActive else { return }
        isActive = false
        displayLink.invalidate()
    }
    @objc private func displayLinkDidFire() {
        MainActor.assumeIsolated {
            guard let callback = frameCallback else { return }
            let link = displayLink!
            callback(AnimationUpdate(timestamp: link.timestamp, duration: link.duration,
                targetTimestamp: link.targetTimestamp))
        }
    }
    deinit {
        MainActor.assumeIsolated {
            if isActive { isActive = false; displayLink.invalidate() }
        }
    }
}
