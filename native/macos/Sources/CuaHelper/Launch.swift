import Foundation
import AppKit

// Independent LaunchServices adapter. Resolving does not start an application;
// the TypeScript host obtains authorization before calling launchApp.
@MainActor
func resolveInstalledApp(_ reference: String) throws -> [String: Any] {
    guard !reference.isEmpty else { throw fail("INVALID_ARGUMENT", "App reference is empty.") }
    let url: URL?
    if reference.hasPrefix("/") { url = URL(fileURLWithPath: reference) }
    else if let byId = NSWorkspace.shared.urlForApplication(withBundleIdentifier: reference) { url = byId }
    else if let path = NSWorkspace.shared.fullPath(forApplication: reference) { url = URL(fileURLWithPath: path) }
    else { url = nil }
    guard let location = url?.resolvingSymlinksInPath(), location.pathExtension == "app",
          let bundle = Bundle(url: location), let identifier = bundle.bundleIdentifier else {
        throw fail("TARGET_NOT_FOUND", "Installed application could not be resolved.")
    }
    let name = bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
        ?? bundle.object(forInfoDictionaryKey: "CFBundleName") as? String
        ?? location.deletingPathExtension().lastPathComponent
    return ["pid": 0, "name": name, "bundleId": identifier, "path": location.path, "launchTime": 0]
}
@MainActor
func launchInstalledApp(_ params: [String: Any]) async throws -> [String: Any] {
    guard let path = params["path"] as? String, path.hasPrefix("/"),
          let identifier = params["bundleId"] as? String else {
        throw fail("INVALID_ARGUMENT", "Launch requires resolved path and bundle identifier.")
    }
    let resolved = try resolveInstalledApp(path)
    guard resolved["path"] as? String == path, resolved["bundleId"] as? String == identifier else {
        throw fail("TARGET_NOT_FOUND", "Application identity changed before launch.")
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    configuration.createsNewApplicationInstance = false
    let app = try await NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: path), configuration: configuration)
    guard app.bundleIdentifier == identifier, app.bundleURL?.resolvingSymlinksInPath().path == path else {
        throw fail("ACTION_OUTCOME_UNKNOWN", "Launched application identity differs from approved target.")
    }
    return ["app": info(app)]
}
