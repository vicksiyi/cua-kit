import Foundation

// Source descriptor 0x1012cd860: UUID/state getters, stop, reset and tick.
// Value conformers are supported; do not add an AnyObject constraint.
public protocol Animation {
    var id: UUID { get }
    var state: AnimationState { get }
    func stop(immediately: Bool)
    func reset()
    func performTick(with update: AnimationUpdate)
}

extension Animation {
    // 0x1007c1f04: witness slot +24 receives immediately=true.
    public func stop() { stop(immediately: true) }
}
