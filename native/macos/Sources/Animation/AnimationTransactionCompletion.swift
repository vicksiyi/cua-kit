import Foundation

// Coordinator state forwarding 0x1007c8f68: animation UUID -> transaction
// UUID -> completion. Callback invocation occurs outside dictionary accesses.
public func notifyAnimationTransactionCompletion(
    animationID: UUID, state: AnimationState,
    transactionID: (UUID) -> UUID?,
    completion: (UUID) -> ((AnimationState) -> Void)?,
    removeCompletion: (UUID) -> Void
) {
    guard let transaction = transactionID(animationID), let callback = completion(transaction) else { return }
    callback(state)
    if state == .retargeted || state == .ended { removeCompletion(transaction) }
}
