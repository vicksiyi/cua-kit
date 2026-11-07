// AXNotificationObserver callback context, 0x1006ec998 and 0x1006ed670.
// The run-loop thread retains this context; it retains the AX observer but
// references its owner weakly, so monitoring cannot keep the owner alive.
final class AXNotificationCallbackContext<Observer: AnyObject, Owner: AnyObject> {
    let axObserver: Observer
    weak var owner: Owner?

    init(axObserver: Observer, owner: Owner) {
        self.axObserver = axObserver
        self.owner = owner
    }

    // Source rejects a missing context or unbridgeable/missing info dictionary
    // before loading the weak owner. Keep that ordering at the C callback edge.
    static func deliver<Info>(context: AXNotificationCallbackContext?, info: Info?,
        handler: (Owner, Info) -> Void) {
        guard let context, let info, let owner = context.owner else { return }
        handler(owner, info)
    }
}
