import Foundation
import AppKit
import ApplicationServices

// Observed Sky response schema, backed by the independent native AX/capture engine.
// Native function bodies and original incremental skyshot formatting are unavailable.
@MainActor
final class SkyAppState {
    private var targets: [String: Target] = [:]
    func get(_ reference: String, policy: SkyAppPolicy, deadline: Double) async throws -> [String: Any] {
        let evaluated: [String: Any]
        do { evaluated = try policy.evaluate(reference) }
        catch { throw SkyRPCFailure(code: -10010, message: "Installed application could not be resolved") }
        guard evaluated["decision"] as? String == "allowed" else {
            throw SkyRPCFailure(code: -10006, message: "Native policy does not allow this application")
        }
        let identity = evaluated["target"] as! [String: Any]
        let path = identity["appPath"] as! String, identifier = identity["bundleIdentifier"] as! String
        let running = NSWorkspace.shared.runningApplications.filter {
            !$0.isTerminated && $0.bundleIdentifier == identifier && $0.bundleURL?.resolvingSymlinksInPath().path == path
        }
        guard !running.isEmpty else { throw SkyRPCFailure(code: -10007, message: "Application is not running") }
        guard running.count == 1 else { throw SkyRPCFailure(code: -10018, message: "Multiple running applications match the target") }
        guard AXIsProcessTrusted() && CGPreflightScreenCaptureAccess() else {
            throw SkyRPCFailure(code: -10009, message: "Accessibility and Screen Recording permissions are required; no permission prompt was requested")
        }
        let app = running[0]
        let target: Target
        if let cached = targets[path], cached.app.processIdentifier == app.processIdentifier, cached.launch == app.launchDate {
            target = cached
        } else { target = Target(app); targets[path] = target }
        target.invalidateInputState()
        do {
            let state = try await target.observeWithScreenshot([:])
            guard Date().timeIntervalSince1970 * 1000 < deadline else {
                throw SkyRPCFailure(code: -32602, message: "Computer Use request deadline expired during observation")
            }
            guard let text = state["text"] as? String,
                  let screenshot = state["screenshot"] as? [String: Any],
                  let data = screenshot["data"] as? String, let mime = screenshot["mimeType"] as? String else {
                throw SkyRPCFailure(code: -10005, message: "Native observation returned an invalid skyshot")
            }
            return ["app": ["bundleIdentifier": identifier, "pid": Int(app.processIdentifier)],
                "skyshot": ["text": text, "screenshot": ["url": "data:\(mime);base64,\(data)", "mimeType": mime]]]
        } catch {
            target.invalidateInputState()
            throw error
        }
    }
}
