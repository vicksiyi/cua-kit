// Source AnimationCoordinator.remove(driverSource:) at 0x1007cadac.
// Stopping animations precedes removal and runs outside dictionary access. Remove by
// key afterward, even if stopping installed a replacement for that source.
public func removeAnimationDriver<Source: AnyObject, Handler: AnyObject>(
    source: Source, lookup: (ObjectIdentifier) -> Handler?,
    stopAnimations: (Handler) -> Void, remove: (ObjectIdentifier) -> Handler?
) {
    let id = ObjectIdentifier(source)
    var retained = lookup(id)
    guard retained != nil else { return }
    stopAnimations(retained!)
    let removed = withExtendedLifetime(retained) { remove(id) }
    retained = nil
    withExtendedLifetime(removed) {}
}
