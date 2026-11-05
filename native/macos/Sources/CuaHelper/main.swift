import Foundation
import AppKit
import ApplicationServices

// Private stdin/stdout transport. No socket, ambient remote caller or vendor IPC.
struct Failure: Error { let code: String; let message: String }
func fail(_ code: String, _ message: String) -> Failure { Failure(code: code, message: message) }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func string(_ element: AXUIElement, _ name: String) -> String { attribute(element, name) as? String ?? "" }
func scalar(_ value: CFTypeRef?) -> Any? {
    if let value = value as? String { return value }
    if let value = value as? NSNumber { return value }
    return nil
}
func info(_ app: NSRunningApplication) -> [String: Any] {
    ["pid": Int(app.processIdentifier), "name": app.localizedName ?? "", "bundleId": app.bundleIdentifier ?? "", "path": app.bundleURL?.resolvingSymlinksInPath().path ?? "", "launchTime": app.launchDate?.timeIntervalSince1970 ?? 0]
}
struct Node {
    let element: AXUIElement
    let data: [String: Any]
}
@MainActor
final class Target {
    let app: NSRunningApplication
    let root: AXUIElement
    let launch: Date?
    var nodes: [Node] = []
    var snapshot: String?
    var capturedWindow: CapturedWindow?
    init(_ app: NSRunningApplication) {
        self.app = app; launch = app.launchDate
        root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 1.0)
    }
    func validateIdentity() throws {
        guard !app.isTerminated, let current = NSRunningApplication(processIdentifier: app.processIdentifier), current.launchDate == launch else { throw fail("TARGET_NOT_FOUND", "Application exited or PID was reused.") }
    }
    func validate() throws {
        try validateIdentity()
        guard AXIsProcessTrusted() else { throw fail("PERMISSION_DENIED", "Accessibility permission is required for the helper's responsible host application.") }
    }
    func collect() throws -> ([Node], [String]) {
        try validate()
        var result: [Node] = [], warnings: [String] = [], visited = Set<AXUIElement>()
        let started = Date()
        func walk(_ element: AXUIElement, _ parent: Int?, _ depth: Int) {
            if result.count >= 3000 || depth > 80 || Date().timeIntervalSince(started) > 5 { if warnings.isEmpty { warnings.append("AX traversal truncated by node/depth/time budget.") }; return }
            if !visited.insert(element).inserted { return }
            let id = result.count + 1
            let role = string(element, kAXRoleAttribute)
            var title = string(element, kAXTitleAttribute)
            if title.isEmpty { title = string(element, kAXDescriptionAttribute) }
            var data: [String: Any] = ["id": id, "role": role, "name": title]
            if let frame = axElementFrame(element) { data["frame"] = rectData(frame) }
            if let parent = parent { data["parentId"] = parent }
            // Secure input contents are not exported.
            let secure = string(element, kAXSubroleAttribute) == "AXSecureTextField"
            if !secure, let value = scalar(attribute(element, kAXValueAttribute)) { data["value"] = String(describing: value) }
            var actions: CFArray?
            AXUIElementCopyActionNames(element, &actions)
            var props: [String: Any] = ["secure": secure, "actions": (actions as? [String] ?? []).joined(separator: ",")]
            for name in [kAXEnabledAttribute, kAXFocusedAttribute, kAXSelectedAttribute] { if let value = scalar(attribute(element, name)) { props[name] = value } }
            if let selected = attribute(element,kAXSelectedTextRangeAttribute), CFGetTypeID(selected) == AXValueGetTypeID() {
                var range = CFRange()
                if AXValueGetValue(selected as! AXValue,.cfRange,&range) { props["selectionStart"] = range.location; props["selectionLength"] = range.length }
            }
            data["properties"] = props
            result.append(Node(element: element, data: data))
            if let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] { for child in children { walk(child, id, depth + 1) } }
        }
        // Distinguish denied/unresponsive AX from an actual empty tree.
        var role: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(root, kAXRoleAttribute as CFString, &role)
        guard status == .success else { throw fail(status == .apiDisabled ? "PERMISSION_DENIED" : "PROVIDER_DISCONNECTED", "AX root unavailable: \(status.rawValue)") }
        walk(root, nil, 0)
        return (result, warnings)
    }
    func observe() throws -> [String: Any] {
        capturedWindow = nil
        let (current, warnings) = try collect()
        nodes = current; snapshot = UUID().uuidString
        return ["snapshotId": snapshot!, "elements": current.map { $0.data }, "warnings": warnings, "text": try observationText(elements: current.map { $0.data }, warnings: warnings, screenshotAvailable: CGPreflightScreenCaptureAccess())]
    }
    func action(_ params: [String: Any]) throws -> [String: Any] {
        try validateSnapshot(params)
        guard let id = params["elementId"] as? Int, id > 0, id <= nodes.count else { throw fail("STALE_OBSERVATION", "Element is absent from current snapshot.") }
        let element = nodes[id-1].element
        let operation = params["operation"] as? String ?? ""
        var status: AXError
        switch operation {
        case "press": status = AXUIElementPerformAction(element, kAXPressAction as CFString)
        case "setValue":
            guard let text = params["value"] as? String else { throw fail("INVALID_ARGUMENT", "setValue requires a string.") }
            var settable = DarwinBoolean(false)
            guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else { throw fail("UNSUPPORTED_CAPABILITY", "Element has no writable AXValue.") }
            status = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as CFTypeRef)
        case "selectText": status = try selectText(element,params)
        case "secondary":
            guard let action = params["value"] as? String else { throw fail("INVALID_ARGUMENT", "Secondary action requires a name.") }
            if action == "focus" { status = AXUIElementSetAttributeValue(element,kAXFocusedAttribute as CFString,kCFBooleanTrue) }
            else {
                var names: CFArray?
                AXUIElementCopyActionNames(element,&names)
                guard (names as? [String] ?? []).contains(action) else { throw fail("UNSUPPORTED_CAPABILITY", "Action is not advertised by this AX element.") }
                status = AXUIElementPerformAction(element,action as CFString)
            }
        default: throw fail("UNSUPPORTED_CAPABILITY", "Unsupported native action.")
        }
        snapshot = nil; nodes = []
        guard status == .success else {
            throw fail(status == .actionUnsupported || status == .attributeUnsupported ? "UNSUPPORTED_CAPABILITY" : "ACTION_OUTCOME_UNKNOWN", "Native action returned AX error \(status.rawValue); observe before retrying.")
        }
        return ["outcome": "completed"]
    }
}
var targets: [String: Target] = [:]
let clipboard = ClipboardStore()
@MainActor
func handle(_ method: String, _ params: [String: Any]) async throws -> [String: Any] {
    switch method {
    case "hello": return ["protocolVersion": 1, "platform": "macos", "capabilities": ["resolveApp", "launchApp", "listApps", "observeAX", "pressAX", "setValueAX", "listWindows", "screenshotWindow", "typeText", "pressKey", "selectTextAX", "secondaryAX", "clipboardLease", "pasteTextAX", "pasteWithClipboard", "mouseClick", "scroll", "drag", "heldInput"], "permissions": ["accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess()]]
    case "clipboardBegin": return try clipboard.begin(params)
    case "clipboardRestore": return try clipboard.restore(params["token"] as? String ?? "")
    case "resolveApp": return ["app": try resolveInstalledApp(params["reference"] as? String ?? "")]
    case "launchApp": return try await launchInstalledApp(params)
    case "listApps": return ["apps": NSWorkspace.shared.runningApplications.filter { $0.activationPolicy != .prohibited }.map(info)]
    case "bind":
        guard let pid = params["pid"] as? Int, let app = NSRunningApplication(processIdentifier: pid_t(pid)), !app.isTerminated else { throw fail("TARGET_NOT_FOUND", "Application PID not found.") }
        let id = UUID().uuidString; targets[id] = Target(app)
        return ["targetId": id, "app": info(app)]
    case "observe", "action", "release", "listWindows", "screenshot", "observeWithScreenshot", "keyboardInput", "validatePaste", "pasteInput", "mouseInput", "scrollInput", "dragInput", "pasteWithClipboard":
        guard let id = params["targetId"] as? String, let target = targets[id] else { throw fail("TARGET_NOT_FOUND", "Unknown target handle.") }
        if method == "release" { targets.removeValue(forKey: id); return [:] }
        if method == "validatePaste" { _ = try target.pasteEditor(params); return [:] }
        if method == "pasteWithClipboard" {
            defer { target.invalidateInputState() }
            _ = try target.pasteEditor(params)
            return try await withNativeClipboard(clipboard,params:params) { try await target.pasteInput(params) }
        }
        if method == "pasteInput" { return try await target.pasteInput(params) }
        if method == "dragInput" { return try await target.dragInput(params) }
        if method == "scrollInput" { return try await target.scrollInput(params) }
        if method == "mouseInput" { return try await target.mouseInput(params) }
        if method == "keyboardInput" { return try await target.keyboardInput(params) }
        if method == "observeWithScreenshot" { return try await target.observeWithScreenshot(params) }
        if method == "listWindows" { return try await target.windows() }
        if method == "screenshot" { return try await target.screenshot(params) }
        return try method == "observe" ? target.observe() : target.action(params)
    default: throw fail("UNSUPPORTED_CAPABILITY", "Unknown helper method.")
    }
}
// Explicit operator-only entry: request system dialogs, never change TCC settings.
if CommandLine.arguments.contains("--permissions") || CommandLine.arguments.contains("--request-permissions") {
    let request = CommandLine.arguments.contains("--request-permissions")
    if request {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        if !CGPreflightScreenCaptureAccess() { _ = CGRequestScreenCaptureAccess() }
    }
    let status: [String: Any] = ["accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess(), "helper": Bundle.main.executablePath ?? CommandLine.arguments[0], "requested": request]
    if let data = try? JSONSerialization.data(withJSONObject: status, options: [.sortedKeys]), let text = String(data:data,encoding:.utf8) { print(text) }
    exit(AXIsProcessTrusted() && CGPreflightScreenCaptureAccess() ? 0 : 2)
}
if CommandLine.arguments.contains("--observation-text-self-test") {
    do { try runObservationTextChecks(); print("{\"nativeObservationText\":true}"); exit(0) }
    catch { fputs("Observation text self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--held-input-self-test") {
    do { try await runHeldInputChecks(); print("{\"heldInputRelease\":true}"); exit(0) }
    catch { fputs("Held input self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--paste-transaction-self-test") {
    do { try await runPasteTransactionChecks(); print("{\"transactionRestore\":true,\"externalCopyPreserved\":true}"); exit(0) }
    catch { fputs("Paste transaction self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--drag-self-test") {
    do { try await runDragChecks(); print("{\"dragSequence\":true,\"interruptedRelease\":true}"); exit(0) }
    catch { fputs("Drag self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--paste-self-test") {
    do { try runPasteChecks(); print("{\"selectionReplacement\":true}"); exit(0) }
    catch { fputs("Paste self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--clipboard-self-test") {
    do { try runClipboardChecks(); print("{\"clipboardFormats\":true,\"externalCopyPreserved\":true}"); exit(0) }
    catch { fputs("Clipboard self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--self-test") {
    do { try runInputChecks(); print("{\"unicodeBoundaries\":true,\"keyChordFlags\":true}"); exit(0) }
    catch { fputs("Native input self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--sky-socket") {
    guard CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--sky-socket" else {
        fputs("Usage: cua-helper --sky-socket ABSOLUTE_PATH\n",stderr); exit(2)
    }
    do { try await serveSkySocket(CommandLine.arguments[2]); exit(0) }
    catch { fputs("Independent Sky IPC service failed: \(error)\n",stderr); exit(1) }
}
while let line = readLine() {
    var id: Any = NSNull()
    var response: [String: Any]
    do {
        guard line.utf8.count <= 1024*1024, let bytes = line.data(using: .utf8), let request = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let requestId = request["id"] as? String, let method = request["method"] as? String else { throw fail("INVALID_ARGUMENT", "Expected bounded JSON request with string id/method.") }
        id = requestId
        response = ["id": id, "result": try await handle(method, request["params"] as? [String: Any] ?? [:])]
    } catch let error as Failure { response = ["id": id, "error": ["code": error.code, "message": error.message]] }
      catch { response = ["id": id, "error": ["code": "INVALID_ARGUMENT", "message": String(describing:error)]] }
    if let data = try? JSONSerialization.data(withJSONObject: response, options: [.sortedKeys]), let text = String(data:data,encoding:.utf8) { print(text); fflush(stdout) }
}

clipboard.restoreActive()
