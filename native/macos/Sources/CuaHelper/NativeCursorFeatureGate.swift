import Foundation
import SlimCore

// Owned-helper store binding. This deliberately reads this process's defaults,
// not another application's preference domain or its account configuration.
enum NativeCursorFeatureGate {
    static func isEnabled(defaults: UserDefaults = .standard) -> Bool {
        FeatureFlag.computerUseCursor.isEnabled { defaults.object(forKey: $0) }
    }
}
