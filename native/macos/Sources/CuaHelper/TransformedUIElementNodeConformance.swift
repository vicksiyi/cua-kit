#if canImport(SlimCore)
import SlimCore
#endif
import Foundation
import ApplicationServices
import os

// Native AccessibilityNode witness template 0x101574c00; this is distinct
// from UIElementProtocol. Stored/computed properties provide the other getters.
extension TransformedUIElement: AccessibilityNode {
    typealias ID = AXUIElement
    typealias Role = UIElementRole
    typealias PresentationActions = LazyMapSequence<[UIElementActionDescription], AccessibilityPresentationAction>

    // Identifiable resilient witness 0x1007627e4 returns the stored AX handle.
    var id: AXUIElement { axElement }

    // Slot 31 -> 0x1007afb64 -> 0x1007ad204: cached Bool, not default nil.
    var boolValue: Bool? { element.boolValue }

    // Slot 25 -> 0x1007afb60 -> 0x1007acee0: collection cache/fresh fallback
    // then map to AX identities. This is not the default empty list.
    var titleTargetIdentities: [AXUIElement] {
        element.titleTargetIdentities { error in
            NativeLogger.logger(for: Self.self).error("log[baa09d44b6c8dd36e77f] [0]=\(error as NSError)")
        }
    }
}
