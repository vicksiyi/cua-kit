import Foundation
import AppKit
import ApplicationServices

// Sky response schema backed by the progressively restored native AX/capture
// engine and llmDescription. Some action adapters remain independent; see
// CURRENT-ACCEPTANCE.md for source fidelity and actual UI validation boundaries.
@MainActor
final class SkyAppState {
    private let clipboard = ClipboardStore()
    private var targets: [String: Target] = [:]
    // Sky actions carry render IDs, not private NDJSON snapshot tokens. Keep
    // the last published ID identities across a successful action only.
    private var successfulActionSelections: [String: [Node]] = [:]
    // Retire explicitly even when an in-flight observation still retains the
    // old Target across await. ARC destruction alone may otherwise be delayed.
    private func retireTarget(at path: String) {
        guard let target = targets[path] else { return }
        target.deactivateAccessibility()
        target.invalidateInputState()
        targets.removeValue(forKey: path)
        successfulActionSelections.removeValue(forKey: path)
    }
    func perform(_ reference: String, action: [String: Any], policy: SkyAppPolicy, deadline: Double) async throws {
        let evaluated = try await policy.evaluate(reference)
        let identity = evaluated["target"] as! [String: Any]
        let path = identity["appPath"] as! String
        guard evaluated["decision"] as? String == "allowed" else {
            targets[path]?.invalidateInputState()
            successfulActionSelections.removeValue(forKey: path)
            throw SkyRPCFailure(code: -10006, message: identity["bundleIdentifier"] as! String)
        }
        var params = try decodeSkyElementAction(action)
        guard let target = targets[path] else {
            throw SkyRPCFailure(code: -10011, message: reference)
        }
        let previous = successfulActionSelections.removeValue(forKey: path)
        var completed = false
        defer {
            target.invalidateInputState()
            if !completed { successfulActionSelections.removeValue(forKey: path) }
        }
        guard target.app.bundleIdentifier == identity["bundleIdentifier"] as? String else {
            throw SkyRPCFailure(code: -10010, message: reference)
        }
        guard Date().timeIntervalSince1970 * 1000 < deadline else {
            throw SkyRPCFailure(code: -32602, message: "Computer Use request expired before input")
        }
        if target.snapshot == nil, let previous {
            // Refresh transport data without replacing the published refetchable
            // owner. Never reinterpret an old element index as a different AX object.
            let (current, warnings) = try target.collect(publishSelection: false)
            guard warnings.isEmpty else { throw fail("STALE_OBSERVATION", "Refresh incomplete; observe again.") }
            if let id = params["elementId"] as? Int {
                guard let old = previous.first(where: { $0.data["id"] as? Int == id }),
                      let fresh = current.first(where: { $0.data["id"] as? Int == id }),
                      CFEqual(old.element, fresh.element) else {
                    throw fail("STALE_OBSERVATION", "Element identity changed; observe again.")
                }
            }
            target.nodes = current
            target.snapshot = UUID().uuidString
        }
        guard let snapshot = target.snapshot else {
            throw SkyRPCFailure(code: -10011, message: reference)
        }
        let publishedNodes = target.nodes
        params["snapshotId"] = snapshot
        params["deadlineUnixMilliseconds"] = deadline
        if ["typeText", "pressKey"].contains(params["operation"] as? String ?? "") {
            // Reject a hold that already cannot fit; never begin a knowingly expired input.
            let duration = params["durationMs"] as? Double ?? 0
            guard Date().timeIntervalSince1970 * 1000 + duration < deadline else {
                throw SkyRPCFailure(code: -32602, message: "Key hold exceeds remaining request deadline")
            }
            _ = try await target.keyboardInput(params)
        } else if params["operation"] as? String == "click" { _ = try await target.mouseInput(params) }
        else if params["operation"] as? String == "scroll" { _ = try await target.scrollInput(params) }
        else if params["operation"] as? String == "drag" { _ = try await target.dragInput(params) }
        else if params["operation"] as? String == "paste" {
            _ = try target.pasteEditor(params)
            guard Date().timeIntervalSince1970 * 1000 < deadline else { throw SkyRPCFailure(code:-32602,message:"Paste expired before clipboard mutation") }
            _ = try await withNativeClipboard(clipboard,params:params) { try await target.pasteInput(params) }
        }
        else { _ = try await target.action(params) }
        guard Date().timeIntervalSince1970 * 1000 < deadline else {
            throw SkyRPCFailure(code: -10005, message: "Input completed after deadline; observe before retrying")
        }
        successfulActionSelections[path] = publishedNodes
        completed = true
    }
    /// Explicit AppStart request. State reads also launch missing apps in background.
    /// Response uses the original optional-skyshot MacWindowAppState envelope.
    func start(_ reference: String, policy: SkyAppPolicy, deadline: Double) async throws -> [String: Any] {
        let evaluated = try await policy.evaluate(reference)
        let identity = evaluated["target"] as! [String: Any]
        guard evaluated["decision"] as? String == "allowed" else {
            throw SkyRPCFailure(code: -10006, message: identity["bundleIdentifier"] as! String)
        }
        let path = identity["appPath"] as! String, identifier = identity["bundleIdentifier"] as! String
        retireTarget(at: path)
        guard Date().timeIntervalSince1970 * 1000 < deadline else {
            throw SkyRPCFailure(code: -32602, message: "Computer Use request expired before launch")
        }
        let launched = try await launchInstalledApp(["path": path, "bundleId": identifier])
        guard let app = launched["app"] as? [String: Any], let pid = app["pid"] as? Int else {
            throw SkyRPCFailure(code: -10005, message: "Native launch returned invalid application identity")
        }
        guard Date().timeIntervalSince1970 * 1000 < deadline else {
            throw SkyRPCFailure(code: -10005, message: "Launch completed after the request deadline; application may be running")
        }
        return ["app": ["bundleIdentifier": identifier, "pid": pid]]
    }
    func get(_ reference: String, policy: SkyAppPolicy, deadline: Double, disableDiff: Bool = false) async throws -> [String: Any] {
        let terminatedPaths = targets.compactMap { $0.value.app.isTerminated ? $0.key : nil }
        for path in terminatedPaths { retireTarget(at: path) }
        let evaluated = try await policy.evaluate(reference)
        let identity = evaluated["target"] as! [String: Any]
        let path = identity["appPath"] as! String, identifier = identity["bundleIdentifier"] as! String
        // Failures after resolution retire only this application's earlier observation.
        successfulActionSelections.removeValue(forKey: path)
        targets[path]?.invalidateInputState()
        guard evaluated["decision"] as? String == "allowed" else {
            throw SkyRPCFailure(code: -10006, message: identity["bundleIdentifier"] as! String)
        }
        var running = NSWorkspace.shared.runningApplications.filter {
            !$0.isTerminated && $0.bundleIdentifier == identifier && $0.bundleURL?.resolvingSymlinksInPath().path == path
        }
        if running.isEmpty {
            // Original macOS CUA docs promise background launch on getApp. The JS
            // binding sends only GetSkyshot, so preserve that native responsibility.
            // Ordering relative to permission errors is our independent implementation.
            try Task.checkCancellation()
            guard Date().timeIntervalSince1970 * 1000 < deadline else {
                throw SkyRPCFailure(code: -32602, message: "Computer Use request expired before background launch")
            }
            let app = try await launchResolvedApplication(["path": path, "bundleId": identifier], activates: false)
            try Task.checkCancellation()
            guard Date().timeIntervalSince1970 * 1000 < deadline else {
                throw SkyRPCFailure(code: -10005, message: "Background launch completed after the request deadline; application may be running")
            }
            guard !app.isTerminated else { throw SkyRPCFailure(code: -10007, message: identifier) }
            running = [app]
        }
        guard running.count == 1 else { throw SkyRPCFailure(code: -10018, message: "Multiple running applications match the target") }
        guard AXIsProcessTrusted() && CGPreflightScreenCaptureAccess() else {
            throw SkyRPCFailure(code: -10009, message: "Accessibility and Screen Recording permissions are required; no permission prompt was requested")
        }
        let app = running[0]
        let target: Target
        if let cached = targets[path], cached.app.processIdentifier == app.processIdentifier, cached.launch == app.launchDate {
            target = cached
        } else {
            retireTarget(at: path)
            target = Target(app)
        }
        try target.prepareWindowObservation()
        targets[path] = target
        // Sky/MCP state reads enter the same controller activation as private
        // bind. Acquire/reuse AX enablement before capture and later input.
        target.activateAccessibility()
        target.invalidateInputState()
        do {
            let state = try await target.observeWithScreenshot(["disableDiff": disableDiff, "sourceDescription": true])
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
