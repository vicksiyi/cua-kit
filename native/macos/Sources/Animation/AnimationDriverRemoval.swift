// Source AnimationCoordinator.remove(driverSource:) at 0x1007cadac.
// Invalidation precedes removal and runs outside dictionary access. Remove by
// key afterward, even if invalidation installed a replacement for that source.
public func removeAnimationDriver<Source: AnyObject, Handler: AnyObject>(
    source: Source, lookup: (ObjectIdentifier) -> Handler?,
    invalidate: (Handler) -> Void, remove: (ObjectIdentifier) -> Handler?
) {
    let id = ObjectIdentifier(source)
    var retained = lookup(id)
    guard retained != nil else { return }
    invalidate(retained!)
    let removed = withExtendedLifetime(retained) { remove(id) }
    retained = nil
    withExtendedLifetime(removed) {}
}
