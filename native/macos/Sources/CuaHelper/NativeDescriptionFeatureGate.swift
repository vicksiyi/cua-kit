import Foundation
import SlimCore

// Owned-helper preference binding, matching the cursor's store boundary.
// This does not access ChatGPT preferences or restore its global cache owner.
enum NativeDescriptionFeatureGate {
    static func summarizesRemovedElementIDs(defaults: UserDefaults = .standard) -> Bool {
        FeatureFlag.axTreeDiffingRemovedElementIDRanges.isEnabled { defaults.object(forKey: $0) }
    }
}
