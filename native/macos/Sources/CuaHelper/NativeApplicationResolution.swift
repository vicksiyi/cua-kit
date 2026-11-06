import Foundation

/// Recovered control flow at 0x10026222c and 0x100262c10.
/// Enumeration is injected until its full native implementation is restored.
/// Dependency closures are host seams, not vendor API.
struct NativeApplicationResolution {
    let targetAtPath: (String) -> NativeApplicationTarget?
    let installedTargets: (String) -> [NativeApplicationTarget]
    let runningTargets: (String) -> [NativeApplicationTarget]
    let pathForName: (String) -> String?
    let selectTarget: (String, [NativeApplicationTarget]) throws -> NativeApplicationTarget

    enum BundleIDLookupError: Error, CustomStringConvertible, Equatable {
        case notFound(String)
        case ambiguous(String, [String])

        var description: String {
            switch self {
            case .notFound(let reference): return "Invalid app: \(reference)"
            case .ambiguous(let reference, let paths):
                return "Ambiguous app identifier '\(reference)'. Multiple apps share this bundle identifier: "
                    + paths.joined(separator: ", ") + ". Use an app name or full app path instead."
            }
        }
    }

    init(targetAtPath: @escaping (String) -> NativeApplicationTarget?,
         installedTargets: @escaping (String) -> [NativeApplicationTarget],
         runningTargets: @escaping (String) -> [NativeApplicationTarget],
         pathForName: @escaping (String) -> String?,
         selectTarget: @escaping (String, [NativeApplicationTarget]) throws -> NativeApplicationTarget = Self.selectUniqueTarget) {
        self.targetAtPath = targetAtPath
        self.installedTargets = installedTargets
        self.runningTargets = runningTargets
        self.pathForName = pathForName
        self.selectTarget = selectTarget
    }

    /// 0x100262934: exactly one returns unchanged; zero and multiple throw.
    /// Deduplication belongs to enumeration, not to this selection helper.
    static func selectUniqueTarget(_ reference: String, _ candidates: [NativeApplicationTarget]) throws -> NativeApplicationTarget {
        guard let first = candidates.first else { throw BundleIDLookupError.notFound(reference) }
        guard candidates.count == 1 else {
            throw BundleIDLookupError.ambiguous(reference, candidates.map(\.identifier).sorted())
        }
        return first
    }

    func resolve(_ reference: String) throws -> NativeApplicationTarget {
        if let target = targetAtPath(reference) { return target }
        let candidates = installedTargets(reference)
        if !candidates.isEmpty { return try selectTarget(reference, candidates) }
        if let path = pathForName(reference), let target = targetAtPath(path) { return target }
        throw BundleIDLookupError.notFound(reference)
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
