import Foundation
import CoreGraphics

// Target callback 0x100740a80: temporary suppression runs before all state
// updates. A suppressed event is consumed and must not change focus beliefs.
final class SyntheticFocusActivationFilter {
    typealias Suppression = (CGEventType, CGEvent) -> Bool
    private let suppressionLock = NSLock()
    private var suppression: Suppression?
    private let state: SyntheticFocusStateStore
    init(state: SyntheticFocusStateStore) { self.state = state }
    func setSuppression(_ callback: Suppression?) {
        suppressionLock.lock(); defer { suppressionLock.unlock() }
        suppression = callback
    }
    func filter(type: CGEventType, event: CGEvent) -> CGEvent? {
        suppressionLock.lock()
        let suppressed = suppression?(type, event) == true
        suppressionLock.unlock()
        if suppressed { return nil }
        let subtype = Int16(exactly: event.getIntegerValueField(CGEventField(rawValue: 83)!))
        let active: Bool?
        if type.rawValue == 20 || (type.rawValue == 13 && subtype == 1) { active = true }
        else if type.rawValue == 19 || (type.rawValue == 13 && subtype == 2) { active = false }
        else { active = nil }
        if let active { state.mutate { $0.observeApplicationActivation(active) } }
        return event
    }
}
