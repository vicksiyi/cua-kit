import Foundation

/// Recovered control flow at 0x10026222c and 0x100262c10.
/// Enumeration and candidate selection are dependencies until their complete
/// native implementations are restored; these are host seams, not vendor API.
struct NativeApplicationResolution {
    let targetAtPath: (String) -> NativeApplicationTarget?
    let installedTargets: (String) -> [NativeApplicationTarget]
    let runningTargets: (String) -> [NativeApplicationTarget]
    let pathForName: (String) -> String?
    let selectTarget: (String, [NativeApplicationTarget]) throws -> NativeApplicationTarget

    // Host representation of the original BundleIDLookupError not-found case.
    struct NotFound: Error { let reference: String }

    func resolve(_ reference: String) throws -> NativeApplicationTarget {
        if let target = targetAtPath(reference) { return target }
        let candidates = installedTargets(reference)
        if !candidates.isEmpty { return try selectTarget(reference, candidates) }
        if let path = pathForName(reference), let target = targetAtPath(path) { return target }
        throw NotFound(reference: reference)
    }

    func resolvePreferringRunningApplication(_ reference: String) throws -> NativeApplicationTarget {
        if let target = targetAtPath(reference) { return target }
        let candidates = runningTargets(reference)
        if !candidates.isEmpty { return try selectTarget(reference, candidates) }
        // Source re-enters the ordinary resolver, including its path probe.
        return try resolve(reference)
    }

    /// 0x1002624b8: Bundle(path:) then bundleIdentifier, not an absolute-path
    /// prefix or .app-extension check. Bundle and missing identifier yield nil.
    static func targetAtPath(_ path: String) -> NativeApplicationTarget? {
        guard let bundle = Bundle(path: path), let identifier = bundle.bundleIdentifier else { return nil }
        return NativeApplicationTarget(bundleIdentifier: identifier, bundleURL: URL(fileURLWithPath: path))
    }
}
