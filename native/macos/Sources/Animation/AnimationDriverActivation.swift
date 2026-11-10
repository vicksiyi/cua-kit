// Native registration tail 0x1007c94bc..0x1007c9568 installs the weak frame
// callback only for an inactive driver with a nonempty animation registry.
@MainActor
public func activateAnimationDriver<Owner: AnyObject>(
    _ driver: AnimationDriver, owner: Owner, isEmpty: () -> Bool,
    frame: @escaping @MainActor @Sendable (Owner, AnimationUpdate) -> Void
) {
    guard !driver.isActive, !isEmpty() else { return }
    driver.frameCallback = { [weak owner] update in
        guard let owner else { return }
        frame(owner, update)
    }
    driver.start()
}
