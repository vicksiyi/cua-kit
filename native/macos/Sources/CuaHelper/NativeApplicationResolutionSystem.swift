import AppKit
import RunningProcess

extension NativeApplicationResolution {
    /// Native reads only: no launch, activation, or authorization side effects.
    /// Call from the main actor, as required by this host's AppKit integration.
    @MainActor
    static func system(workspace: NSWorkspace = .shared) -> NativeApplicationResolution {
        let enumeration = NativeApplicationEnumeration(
            installedURLs: { workspace.urlsForApplications(withBundleIdentifier: $0) },
            runningURLs: { identifier in
                NSRunningApplication.runningApplications(withBundleIdentifier: identifier).compactMap(\.bundleURL)
            })
        return NativeApplicationResolution(targetAtPath: Self.targetAtPath,
            installedTargets: enumeration.applicationTargets,
            runningTargets: enumeration.runningTargets,
            pathForName: { SAIApplicationPathForName($0) })
    }
}
