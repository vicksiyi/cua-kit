import Foundation
import AppKit
import ApplicationServices
import os

// Private stdin/stdout transport. No socket, ambient remote caller or vendor IPC.
struct Failure: Error { let code: String; let message: String }
func fail(_ code: String, _ message: String) -> Failure { Failure(code: code, message: message) }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    let result = readRawAXAttribute(element, name)
    // Existing observation policy remains success-only. The raw reader retains
    // both fields for callers that need to distinguish an AX failure from nil.
    return result.error == .success ? result.value : nil
}
func string(_ element: AXUIElement, _ name: String) -> String { attribute(element, name) as? String ?? "" }
func scalar(_ value: CFTypeRef?) -> Any? {
    guard let value else { return nil }
    return decodedAXScalarAttribute(value)
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
        func walk(_ item: UIElement, _ parent: Int?, _ depth: Int) {
            let element = item.axElement
            if result.count >= 3000 || depth > 80 || Date().timeIntervalSince(started) > 5 { if warnings.isEmpty { warnings.append("AX traversal truncated by node/depth/time budget.") }; return }
            if !visited.insert(element).inserted { return }
            let id = result.count + 1
            // The typed children reader constructs each child cache once.
            // Cached role/subrole/text and frame share that same snapshot.
            let role = item.role.rawValue
            var title = item.title ?? ""
            if title.isEmpty { title = item.description ?? "" }
            var data: [String: Any] = ["id": id, "role": role, "name": title]
            if let frame = axElementFrame(item) { data["frame"] = rectData(frame) }
            if let parent = parent { data["parentId"] = parent }
            // Secure input contents are not exported.
            let secure = item.subrole == "AXSecureTextField"
            if !secure, let value = scalar(attribute(element, kAXValueAttribute)) { data["value"] = String(describing: value) }
            let actions = item.actions
            var props: [String: Any] = ["secure": secure, "actions": actions.map(\.name).joined(separator: ",")]
            props[kAXEnabledAttribute] = item.isEnabled
            props[kAXFocusedAttribute] = item.isFocused
            props[kAXSelectedAttribute] = item.isSelected
            if let selected = attribute(element,kAXSelectedTextRangeAttribute),
               let range = decodedAXTypedAttribute(selected, as: CFRange.self) {
                props["selectionStart"] = range.location; props["selectionLength"] = range.length
            }
            data["properties"] = props
            result.append(Node(element: element, data: data))
            let children = item.childrenValue(reportError: { error in
                Logger(subsystem: "core.cua", category: "Accessibility").error("Children attribute read failed: \(String(describing: error))")
            })
            for child in children { walk(child, id, depth + 1) }
        }
        // Distinguish denied/unresponsive AX from an actual empty tree.
        let status = readRawAXAttribute(root, kAXRoleAttribute).error
        guard status == .success else { throw UIElementError.axError(status) }
        walk(UIElement(element: root), nil, 0)
        return (result, warnings)
    }
    func observe() throws -> [String: Any] {
        // A failed refresh must not leave an older observation actionable.
        invalidateInputState()
        let (current, warnings) = try collect()
        let elements = current.map { $0.data }
        let text = try observationText(elements: elements, warnings: warnings,
            screenshotAvailable: CGPreflightScreenCaptureAccess())
        let identifier = UUID().uuidString
        nodes = current; snapshot = identifier
        return ["snapshotId": identifier, "elements": elements, "warnings": warnings, "text": text]
    }
    func action(_ params: [String: Any]) throws -> [String: Any] {
        try validateSnapshot(params)
        if let deadline = params["deadlineUnixMilliseconds"] as? Double,
           Date().timeIntervalSince1970 * 1000 >= deadline {
            throw fail("INVALID_ARGUMENT", "Input deadline expired during snapshot validation; no action was dispatched.")
        }
        guard let id = params["elementId"] as? Int, id > 0, id <= nodes.count else { throw fail("STALE_OBSERVATION", "Element is absent from current snapshot.") }
        let element = nodes[id-1].element
        let operation = params["operation"] as? String ?? ""
        let item = UIElement(element: element)
        // All attempted AX operations retire the observation, including throws.
        defer { invalidateInputState() }
        func perform(_ action: UIElementAction) throws {
            try item.perform(action: action)
        }
        switch operation {
        case "press": try perform(.press)
        case "setValue":
            guard let text = params["value"] as? String else { throw fail("INVALID_ARGUMENT", "setValue requires a string.") }
            guard try isAXAttributeSettable(element, UIElementAttribute(kAXValueAttribute)) else { throw fail("UNSUPPORTED_CAPABILITY", "Element has no writable AXValue.") }
            try item.setValue(text, forAttribute: UIElementAttribute(kAXValueAttribute))
        case "selectText": try selectText(element,params)
        case "secondary":
            guard let action = params["value"] as? String else { throw fail("INVALID_ARGUMENT", "Secondary action requires a name.") }
            if action == "focus" { try item.setValue(true, forAttribute: UIElementAttribute(kAXFocusedAttribute)) }
            else {
                let actions = item.actions
                guard actions.contains(UIElementAction(action)) else { throw fail("UNSUPPORTED_CAPABILITY", "Action is not advertised by this AX element.") }
                try perform(UIElementAction(action))
            }
        default: throw fail("UNSUPPORTED_CAPABILITY", "Unsupported native action.")
        }
        return ["outcome": "completed"]
    }
}
var targets: [String: Target] = [:]
let clipboard = ClipboardStore()
@MainActor
func handle(_ method: String, _ params: [String: Any]) async throws -> [String: Any] {
    switch method {
    case "hello": return ["protocolVersion": 1, "platform": "macos", "capabilities": ["resolveApp", "launchApp", "listApps", "observeAX", "pressAX", "setValueAX", "listWindows", "screenshotWindow", "typeText", "pressKey", "selectTextAX", "secondaryAX", "clipboardLease", "pasteTextAX", "pasteWithClipboard", "pasteFormatted", "mouseClick", "scroll", "drag", "heldInput"], "permissions": ["accessibility": AXIsProcessTrusted(), "screenRecording": CGPreflightScreenCaptureAccess()]]
    case "clipboardBegin": return try clipboard.begin(params)
    case "clipboardRestore": return try clipboard.restore(params["token"] as? String ?? "")
    case "resolveApp": return ["app": try resolveInstalledApp(params["reference"] as? String ?? "")]
    case "launchApp": return try await launchInstalledApp(params)
    case "listApps": return ["apps": NSWorkspace.shared.runningApplications.filter { $0.activationPolicy != .prohibited }.map(info)]
    case "bind":
        guard let pid = params["pid"] as? Int, let app = NSRunningApplication(processIdentifier: pid_t(pid)), !app.isTerminated else { throw fail("TARGET_NOT_FOUND", "Application PID not found.") }
        let id = UUID().uuidString; targets[id] = Target(app)
        return ["targetId": id, "app": info(app)]
    case "observe", "action", "release", "listWindows", "screenshot", "observeWithScreenshot", "keyboardInput", "validatePaste", "pasteInput", "mouseInput", "scrollInput", "dragInput", "pasteWithClipboard", "pasteFormatted":
        guard let id = params["targetId"] as? String, let target = targets[id] else { throw fail("TARGET_NOT_FOUND", "Unknown target handle.") }
        if method == "release" { targets.removeValue(forKey: id); return [:] }
        if method == "validatePaste" { _ = try target.pasteEditor(params); return [:] }
        if method == "pasteWithClipboard" || method == "pasteFormatted" {
            defer { target.invalidateInputState() }
            var input = params
            if method == "pasteFormatted" {
                input = try nativeFormattedPasteParameters(params)
            }
            _ = try target.pasteEditor(input)
            return try await withNativeClipboard(clipboard,params:input) { try await target.pasteInput(input) }
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
if CommandLine.arguments.contains("--audio-lifecycle-self-test") {
    do { try await runNativeAudioLifecycleChecks(); print("{\"audioLifecycle\":true,\"syntheticOnly\":true}"); exit(0) }
    catch { fputs("Native audio lifecycle self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--audio-writer-self-test") {
    do { try runNativeAudioWriterChecks(); print("{\"syntheticWav\":true,\"sampleRate\":24000,\"channels\":2}"); exit(0) }
    catch { fputs("Native audio writer self-test failed: \(error)\n",stderr); exit(1) }
}
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
if CommandLine.arguments.contains("--socket-backpressure-fixture") {
    do { try await runNativeService { try runSocketBackpressureFixture() }; exit(1) }
    catch is CancellationError { exit(0) }
    catch { fputs("Socket fixture failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--paste-termination-fixture") {
    do { try await runNativeService { try await runPasteTerminationFixture() }; exit(1) }
    catch is CancellationError { exit(0) }
    catch { fputs("Paste termination fixture failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--paste-content-self-test") {
    do { try runPasteContentChecks(); print("{\"nativePasteFormats\":true}"); exit(0) }
    catch { fputs("Paste format self-test failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--provider-click-self-test") {
    do { try await runProviderClickChecks(); print("Provider click composition checks passed"); exit(0) }
    catch { fputs("Provider click checks failed: \(error)\n", stderr); exit(1) }
}
if CommandLine.arguments.contains("--sky-action-self-test") {
    do { try runSkyActionChecks(); print("{\"skyActionMapping\":true}"); exit(0) }
    catch { fputs("Sky action self-test failed: \(error)\n",stderr); exit(1) }
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
if CommandLine.arguments.contains("--synthetic-audio-socket") {
    guard CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--synthetic-audio-socket" else { exit(2) }
    do { try await runNativeService { try await serveSkySocket(CommandLine.arguments[2],audioFactory:startSyntheticAudioCapture) }; exit(0) }
    catch is CancellationError { exit(0) }
    catch { fputs("Synthetic audio socket fixture failed: \(error)\n",stderr); exit(1) }
}
if CommandLine.arguments.contains("--sky-socket") {
    guard CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--sky-socket" else {
        fputs("Usage: cua-helper --sky-socket ABSOLUTE_PATH\n",stderr); exit(2)
    }
    do { try await runNativeService { try await serveSkySocket(CommandLine.arguments[2]) }; exit(0) }
    catch is CancellationError { exit(0) }
    catch { fputs("Independent Sky IPC service failed: \(error)\n",stderr); exit(1) }
}
do {
    try await runNativeService {
        do { try await serveNativeStdio() }
        catch { await MainActor.run { clipboard.restoreActive() }; throw error }
        await MainActor.run { clipboard.restoreActive() }
    }
} catch is CancellationError { exit(0) }
  catch { fputs("Native stdio service ended: \(error)\n",stderr); exit(1) }
