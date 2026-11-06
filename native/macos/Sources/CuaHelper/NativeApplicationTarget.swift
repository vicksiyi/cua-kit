import Foundation

/// SystemSoftware.ApplicationTarget construction at 0x100261e30 and its
/// identifier helper at 0x100264a14. App discovery/resolution is separate.
struct NativeApplicationTarget {
    let bundleIdentifier: String
    let bundleURL: URL
    let identifier: String

    init(bundleIdentifier: String, bundleURL: URL) {
        self.bundleIdentifier = bundleIdentifier
        self.bundleURL = bundleURL.resolvingSymlinksInPath().standardizedFileURL
        identifier = Self.identifier(for: self.bundleURL)
    }

    static func identifier(for url: URL) -> String {
        var path = url.resolvingSymlinksInPath().standardizedFileURL.path(percentEncoded: false)
        while path.count > 1 && path.hasSuffix("/") { path.removeLast() }
        return path
    }
}
