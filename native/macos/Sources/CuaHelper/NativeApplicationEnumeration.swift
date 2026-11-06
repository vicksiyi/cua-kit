import Foundation

/// Recovered native candidate enumeration, preserving query and output order.
/// Closures expose operating-system reads for deterministic tests.
struct NativeApplicationEnumeration {
    let installedURLs: (String) -> [URL]
    let runningURLs: (String) -> [URL]
    var bundleIdentifier: (URL) -> String? = { Bundle(url: $0)?.bundleIdentifier }

    func runningTargets(_ identifier: String) -> [NativeApplicationTarget] {
        validatedTargets(identifier, urls: runningURLs(identifier))
    }

    func applicationTargets(_ identifier: String) -> [NativeApplicationTarget] {
        // The source queries installed URLs first, but places running URLs
        // first in the final candidate stream and validates those again.
        let installed = installedURLs(identifier)
        let running = runningTargets(identifier).map(\.bundleURL)
        return validatedTargets(identifier, urls: running + installed)
    }

    func validatedTargets(_ identifier: String, urls: [URL]) -> [NativeApplicationTarget] {
        var seen = Set<String>()
        return urls.compactMap { url in
            let target = NativeApplicationTarget(bundleIdentifier: identifier, bundleURL: url)
            // Validate even duplicates, before insertion into the seen set.
            guard bundleIdentifier(target.bundleURL) == identifier,
                  seen.insert(target.identifier).inserted else { return nil }
            return target
        }
    }
}
