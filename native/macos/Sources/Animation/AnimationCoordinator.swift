import Foundation

// Coordinator ownership is recovered incrementally. The handler is nested as
// in the native metadata; coordinator-wide source and transaction maps follow
// separately and are not substituted by this handler's animation registry.
@MainActor
public final class AnimationCoordinator {
    // Public construction is a restoration/testing seam; native uses shared.
    public init() {}
    public static let shared = AnimationCoordinator()
    private var transactions: [Transaction] = []
    private var driverHandlers: [ObjectIdentifier: AnimationDriverHandler] = [:]
    private var animationToTransactionID: [UUID: UUID] = [:]
    private var transactionCompletionHandlers: [UUID: (AnimationState) -> Void] = [:]

    func perform<Result>(_ transaction: Transaction, body: () throws -> Result) rethrows -> Result {
        try performAnimationTransaction(transaction,
            storeCompletion: { self.transactionCompletionHandlers[$0.id] = $0.completion },
            append: { self.transactions.append($0) },
            removeLast: { self.transactions.removeLast() }, body: body)
    }

    // Native 0x1007c89c8 reads shared.transactions.last, not a priority
    // maximum. Explicit source wins; otherwise use the last transaction source.
    public func register(_ animation: any Animation, delay: Duration = .zero,
        driverSource explicitSource: (any AnimationDriverSource)? = nil) {
        let transaction = Self.shared.transactions.last
        guard let source = explicitSource ?? transaction?.driverSource else { return }
        let handler = handler(for: source)
        if let transaction { animationToTransactionID[animation.id] = transaction.id }
        handler.register(animation, delay: delay)
    }

    // Recovered cache segment 0x1007c8c68..0x1007c8dfc. Descriptive
    // extracted entry; the complete transaction registration method follows.
    public func handler(for source: any AnimationDriverSource) -> AnimationDriverHandler {
        let key = ObjectIdentifier(source)
        let handler: AnimationDriverHandler
        if let existing = driverHandlers[key] {
            handler = existing
        } else {
            handler = AnimationDriverHandler(driver: source.makeAnimationDriver())
            // Native callback retains source but holds coordinator weakly.
            // Removal uses the current key without a handler identity guard.
            handler.onInvalidation = { [weak self, source] in
                self?.driverHandlers.removeValue(forKey: ObjectIdentifier(source))
            }
        }
        driverHandlers[key] = handler
        return handler
    }

    // Native public method 0x1007cadac: stop first, remove fresh key afterward.
    public func remove(driverSource source: any AnimationDriverSource) {
        removeAnimationDriver(source: source as AnyObject,
            lookup: { self.driverHandlers[$0] }, stopAnimations: { $0.stopAnimations() },
            remove: { self.driverHandlers.removeValue(forKey: $0) })
    }

    func animationStateDidChange(id: UUID, state: AnimationState) {
        notifyAnimationTransactionCompletion(animationID: id, state: state,
            transactionID: { self.animationToTransactionID[$0] },
            completion: { self.transactionCompletionHandlers[$0] },
            removeCompletion: { self.transactionCompletionHandlers.removeValue(forKey: $0) })
    }

    @MainActor
    public final class AnimationDriverHandler {
        public let driver: AnimationDriver
        public var onInvalidation: (() -> Void)?
        private var runningAnimations: [UUID: any Animation] = [:]

        public init(driver: AnimationDriver, onInvalidation: (() -> Void)? = nil) {
            self.driver = driver
            self.onInvalidation = onInvalidation
        }

        public func register(_ animation: any Animation, delay: Duration = .zero) {
            if .zero < delay {
                scheduleDelayedAnimationRegistration(owner: self, animation: animation, delay: delay) {
                    owner, animation, delay in owner.register(animation, delay: delay)
                }
                return
            }
            registerImmediateAnimation(animation,
                insert: { self.runningAnimations[$0] = $1 },
                remove: { self.runningAnimations.removeValue(forKey: $0) },
                activate: {
                    activateAnimationDriver(self.driver, owner: self,
                        isEmpty: { self.runningAnimations.isEmpty },
                        frame: { owner, update in owner.performTick(with: update) })
                })
        }

        public func performTick(with update: AnimationUpdate) {
            performAnimationDriverFrame(with: update,
                snapshot: { Array(self.runningAnimations.values) },
                remove: { self.runningAnimations.removeValue(forKey: $0) },
                isEmpty: { self.runningAnimations.isEmpty },
                stopDriver: { self.driver.stop() },
                invalidation: { self.onInvalidation })
        }

        public func stopAnimations() {
            stopAnimationDriverAnimations(keys: { Array(self.runningAnimations.keys) },
                lookup: { self.runningAnimations[$0] },
                remove: { self.runningAnimations.removeValue(forKey: $0) })
        }
        // Native deinit only releases fields; no synthetic stop or callback reset.
    }
}
