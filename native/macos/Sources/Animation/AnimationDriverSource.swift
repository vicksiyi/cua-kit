// Source descriptor 0x1012cdec0: class-constrained, one factory requirement.
// AppKit display-link conformances are restored separately from this contract.
public protocol AnimationDriverSource: AnyObject {
    func makeAnimationDriver() -> AnimationDriver
}
