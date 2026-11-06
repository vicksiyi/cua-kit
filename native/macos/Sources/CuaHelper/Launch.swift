import Foundation
import AppKit

// Reconstructed native resolution with a standalone host result/error projection.
// Resolving does not start an application;
// the Sky policy/approval path or legacy caller authorizes before launch.
@MainActor
func resolveInstalledApp(_ reference: String) throws -> [String: Any] {
    let target: NativeApplicationTarget
    do { target = try NativeApplicationResolution.system().resolve(reference) }
    catch let error as NativeApplicationResolution.BundleIDLookupError {
        throw fail("TARGET_NOT_FOUND", error.description)
    }
    let bundle = Bundle(url: target.bundleURL)
    let name = bundle?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
        ?? bundle?.object(forInfoDictionaryKey: "CFBundleName") as? String
        ?? target.bundleURL.deletingPathExtension().lastPathComponent
    return ["pid": 0, "name": name, "bundleId": target.bundleIdentifier, "path": target.identifier, "launchTime": 0]
}
@MainActor
func launchResolvedApplication(_ params: [String: Any], activates: Bool = true) async throws -> NSRunningApplication {
    guard let path = params["path"] as? String, path.hasPrefix("/"),
          let identifier = params["bundleId"] as? String else {
        throw fail("INVALID_ARGUMENT", "Launch requires resolved path and bundle identifier.")
    }
    let resolved = try resolveInstalledApp(path)
    guard resolved["path"] as? String == path, resolved["bundleId"] as? String == identifier else {
        throw fail("TARGET_NOT_FOUND", "Application identity changed before launch.")
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = activates
    configuration.createsNewApplicationInstance = false
    let app = try await NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: path), configuration: configuration)
    guard app.bundleIdentifier == identifier, app.bundleURL?.resolvingSymlinksInPath().path == path else {
        throw fail("ACTION_OUTCOME_UNKNOWN", "Launched application identity differs from approved target.")
    }
    return app
}
@MainActor
func launchInstalledApp(_ params: [String: Any]) async throws -> [String: Any] {
    return ["app": info(try await launchResolvedApplication(params))]
}
