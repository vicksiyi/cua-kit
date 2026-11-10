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
    var virtualCursor: ComputerUseCursor?
    var selectionTree: RefetchableSkyshotAXTree?
    private(set) var focusEnforcer: SyntheticAppFocusEnforcer?
    private(set) var accessibilityAssertion: AXEnablementAssertion?
    private(set) var windowObservation: AppControllerWindowObservation<MenuBarItemUIElement>?

    func prepareWindowObservation(make: (() throws -> AppControllerWindowObservation<MenuBarItemUIElement>)? = nil) throws {
        guard windowObservation == nil else { return }
        if let make { windowObservation = try make(); return }
        windowObservation = try AppControllerWindowObservation(application: root,
            processID: app.processIdentifier, bundleIdentifier: app.bundleIdentifier ?? "",
            focusEnforcer: { [weak self] in
                MainActor.assumeIsolated { self?.focusEnforcer }
            }, reportError: { error in
                Logger(subsystem: "core.cua", category: "WindowObservation").error("Window observation: \(String(describing: error))")
            }, deliverEvent: { operation in
                // Target owns its dictionary on MainActor. FIFO main-queue
                // delivery is an explicit adapter to the native sync default.
                DispatchQueue.main.async(execute: operation)
            })
    }
    // Controller activate 0x10007243c: acquire only when no assertion exists.
    // Keep the assertion across observations/actions, never around each click.
    func activateAccessibility(make: (() -> AXEnablementAssertion?)? = nil) {
        defer { windowObservation?.activateOrdering() }
        guard accessibilityAssertion == nil else { return }
        if let make { accessibilityAssertion = make(); return }
        let application = UIElement(element: root)
        let report: (Error) -> Void = {
            Logger(subsystem: "core.cua", category: "AXEnablement").error("AX enablement: \(String(describing: $0))")
        }
        accessibilityAssertion = application.enableAccessibilityIfNeeded(
            window: application.primaryWindowValue(reportError: report), for: .fullUIContext,
            tracker: NativeAXEnablementTracker.shared, reportError: report,
            reportInitialized: { app in
                Logger(subsystem: "core.cua", category: "AXEnablement").debug("Initialized pid=\(app.processIdentifier)")
            }, reportRelease: { kind in
                Logger(subsystem: "core.cua", category: "AXEnablement").debug("Release kind=\(String(describing: kind))")
            })
    }
    // Controller deactivate 0x100072b6c: disable before clearing ownership.
    func deactivateAccessibility() {
        accessibilityAssertion?.disable()
        accessibilityAssertion = nil
        windowObservation?.deactivateOrdering()
    }

    // App-controller activateFocusEnforcer at 0x100071fb8: lazy per-target
    // construction and reuse. Creation alone does not enforce or send input.
    func activateFocusEnforcer(make: (Int32) -> SyntheticAppFocusEnforcer = SyntheticAppFocusEnforcer.system) -> SyntheticAppFocusEnforcer {
        if let focusEnforcer { return focusEnforcer }
        let created = make(app.processIdentifier)
        focusEnforcer = created
        return created
    }
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
        try requireUnlockedNativeDesktop()
        guard AXIsProcessTrusted() else { throw fail("PERMISSION_DENIED", "Accessibility permission is required for the helper's responsible host application.") }
    }
    func collect(publishSelection: Bool = true, disableDiff: Bool = false) throws -> ([Node], [String]) {
        try validate()
        let application = ApplicationUIElement(element: root)
        let context = try withNativeObservationPhase("focused-context", pid: app.processIdentifier) { try application.focusedUIElementContext() }
        var warnings: [String] = []
        let report: (any Error) -> Void = { error in
            Logger(subsystem: "core.cua", category: "SelectionExtraction").error("AX extraction: \(String(describing: error))")
        }
        let selection = try withNativeObservationPhase("extract-selection", pid: app.processIdentifier) {
            try extractSystemSelection(context: context, contextType: .fullUIContext,
            treeCache: nil, previousRevision: selectionTree?.systemSelection.windowRevision,
            rootElement: nil, performAccessibilityEnablement: true,
            alwaysIncludeScreenshot: false, isAXTreeDiffingEnabled: !disableDiff,
            enable: { $0.enableAccessibilityIfNeeded(window: $1, for: $2) },
            readFocus: { $0.focusedUIElement }, prepareTransformation: {
                UIElementTransformationContext(type: .fullUIContext, application: context.app,
                    window: context.window, urlConfiguration: nil)
            }, reportMissingFocus: { _ in
                warnings.append("Focused element was absent from the captured tree.")
            }, reportSelectionResolutionFailure: {
                warnings.append("Focused selection required a separate tree capture.")
            }, reportDepthLimit: {
                warnings.append("AX traversal reached the native depth limit.")
            }, reportLimit: { _ in
                warnings.append("AX children exceeded the native capture limit.")
            }, reportError: report, reportUnknownDateComponents: { _ in
                warnings.append("AX date component could not be rendered.")
            }, reportUnknownAttributedStyle: { _ in
                warnings.append("AX attributed text contained an unknown style.")
            }, reportUnexpectedNextLine: {
                warnings.append("AX text transformation encountered an unexpected line.")
            })
        }
        let current = try withNativeObservationPhase("project-observation", pid: app.processIdentifier) {
            try selectionObservedNodes(selection.windowRevision,
                frame: { axElementFrame($0.element) }, selectedRange: { $0.selectedTextRange })
        }
        // Input/screenshot revalidation is a read-only comparison against the
        // published observation. Replacing its owner here would detach already
        // resolved wrappers and silently publish even when comparison fails.
        if publishSelection {
            selectionTree = try RefetchableSkyshotAXTree(systemSelection: selection, isAXTreeDiffingEnabled: true)
        }
        return (current, warnings)
    }
    func observe(disableDiff: Bool = false, sourceDescription: Bool = false) throws -> [String: Any] {
        // A failed refresh must not leave an older observation actionable.
        invalidateInputState()
        let (current, warnings) = try collect(disableDiff: disableDiff)
        let elements = current.map { $0.data }
        let text: String
        if sourceDescription {
            guard let selectionTree else { throw fail("STALE_OBSERVATION", "Published selection is absent.") }
            // Native updateSkyshot callers0x100070ab0/0x10007124c use
            // difference(previous), options0; disableDiff controls extraction.
            text = selectionTree.systemSelection.llmDescription(.difference(from: .previous),
                lineOptions: [], onLineBudgetExceeded: NativeSelectionExtractionDiagnostics.lineBudgetExceeded)
        } else {
            text = try observationText(elements: elements, warnings: warnings,
                screenshotAvailable: CGPreflightScreenCaptureAccess())
        }
        let identifier = UUID().uuidString
        nodes = current; snapshot = identifier
        return ["snapshotId": identifier, "elements": elements, "warnings": warnings, "text": text]
    }
    func action(_ params: [String: Any]) async throws -> [String: Any] {
        try validateSnapshot(params)
        if let deadline = params["deadlineUnixMilliseconds"] as? Double,
           Date().timeIntervalSince1970 * 1000 >= deadline {
            throw fail("INVALID_ARGUMENT", "Input deadline expired during snapshot validation; no action was dispatched.")
        }
        guard let id = params["elementId"] as? Int, observedNode(for: id, in: nodes) != nil else { throw fail("STALE_OBSERVATION", "Element is absent from current snapshot.") }
        guard let selectionTree else {
            throw fail("STALE_OBSERVATION", "Element selection is absent from current snapshot.")
        }
        // Recovery can publish a replacement selection before an AX write.
        // Retire the transport snapshot on either recovery or action failure.
        defer { invalidateInputState() }
        let operation = params["operation"] as? String ?? ""
        // Validate required payloads before preparation can scroll the app.
        switch operation {
        case "setValue", "secondary":
            guard params["value"] is String else { throw fail("INVALID_ARGUMENT", "Action requires a string value.") }
        case "selectText":
            guard let text = params["value"] as? String, !text.isEmpty else {
                throw fail("INVALID_ARGUMENT", "Selection requires nonempty text.")
            }
        case "press": break // Private compatibility AX action; no native outer positioning policy.
        default: throw fail("UNSUPPORTED_CAPABILITY", "Unsupported native action.")
        }
        try Task.checkCancellation()
        let item: any UIElementProtocol
        if operation == "press" {
            item = try selectionTree.refetchElementIfNeeded(id, validateElement: true)
        } else {
            let timing: ComputerUseCursor.CursorNextInteractionTiming? = operation == "selectText"
                ? nil : (operation == "secondary" ? .finished : .closeEnough)
            let (preparedTree, preparedElement) = try await prepareToInteract(with: id,
                cursorNextInteractionTiming: timing, positionElement: operation != "selectText",
                animateCursor: true, cursorFeatureEnabled: { NativeCursorFeatureGate.isEnabled() },
                reportError: NativeSelectionExtractionDiagnostics.attributeError)
            guard self.selectionTree === preparedTree, params["snapshotId"] as? String == snapshot else {
                throw fail("STALE_OBSERVATION", "Element selection changed while preparing the action.")
            }
            item = preparedElement
        }
        try Task.checkCancellation()
        if let deadline = params["deadlineUnixMilliseconds"] as? Double,
           Date().timeIntervalSince1970 * 1000 >= deadline {
            throw fail("INVALID_ARGUMENT", "Input deadline expired during action preparation; no final action was dispatched.")
        }
        let element = item.axElement
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
        let id = UUID().uuidString
        let target = Target(app)
        try requireUnlockedNativeDesktop()
        try withNativeObservationPhase("bind-window-observation", pid: app.processIdentifier) {
            try target.prepareWindowObservation()
        }
        withNativeObservationPhase("bind-accessibility", pid: app.processIdentifier) {
            target.activateAccessibility()
        }
        targets[id] = target
        return ["targetId": id, "app": info(app)]
    case "observe", "action", "release", "listWindows", "screenshot", "observeWithScreenshot", "keyboardInput", "validatePaste", "pasteInput", "mouseInput", "scrollInput", "dragInput", "pasteWithClipboard", "pasteFormatted":
        guard let id = params["targetId"] as? String, let target = targets[id] else { throw fail("TARGET_NOT_FOUND", "Unknown target handle.") }
        if method == "release" { target.deactivateAccessibility(); targets.removeValue(forKey: id); return [:] }
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
        if method == "observe" { return try target.observe(disableDiff: params["disableDiff"] as? Bool ?? false) }
        return try await target.action(params)
    default: throw fail("UNSUPPORTED_CAPABILITY", "Unknown helper method.")
    }
}
if CommandLine.arguments.contains("--initial-window-graph-check"),
   let index = CommandLine.arguments.firstIndex(of: "--pid"), index + 1 < CommandLine.arguments.count,
   let pid = Int32(CommandLine.arguments[index + 1]) {
    let result = inspectInitialWindowGraph(pid: pid)
    let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self)); exit(0)
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
if CommandLine.arguments.contains("--cursor-window-owned-check") {
    let report = await MainActor.run { runCursorWindowOwnedCheck() }
    let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self)); exit(0)
}
if CommandLine.arguments.contains("--graphics-init-self-test") {
    initializeNativeGraphics()
    let first = NSApplication.shared
    initializeNativeGraphics()
    guard NSApp === first else { fputs("Graphics initialization is not stable\n", stderr); exit(1) }
    print("{\"graphicsInitialized\":true,\"idempotent\":true}")
    exit(0)
}
if let index = CommandLine.arguments.firstIndex(of: "--app-observation-check") {
    guard CommandLine.arguments.indices.contains(index + 1) else {
        fputs("Usage: cua-helper --app-observation-check BUNDLE_ID\n", stderr); exit(2)
    }
    do {
        let report = try await MainActor.run {
            try appObservationDiagnostic(bundleIdentifier: CommandLine.arguments[index + 1])
        }
        let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self)); exit(0)
    } catch { fputs("App observation diagnostic failed: \(error)\n", stderr); exit(1) }
}
if CommandLine.arguments.contains("--key-focus-query-check") {
    var failure: [String: Any]?
    let pid = systemRegistryKeyFocusPID { focus, conversion in
        failure = ["focusStatus": focus, "pidStatus": conversion]
    }
    var result: [String: Any] = ["readOnly": true, "keyFocusPID": pid.map { $0 as Any } ?? NSNull()]
    if let failure { result["failure"] = failure }
    let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self))
    exit(0)
}
if CommandLine.arguments.contains("--display-link-lifecycle-check") {
    do {
        let report = try await runDisplayLinkLifecycleChecks()
        let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
        exit(report["finiteFrameReceived"] as? Bool == true ? 0 : 1)
    } catch { fputs("Display-link lifecycle failed: \(error)\n", stderr); exit(1) }
}
if CommandLine.arguments.contains("--window-observer-binding-check") {
    let windows = WindowServerSPI.observerBindingStatus
    let attention = ApplicationAttentionSPI.bindingAvailable
    let report: [String: Any] = ["readOnly": true, "windowObserver": windows, "applicationAttention": attention]
    let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self))
    exit(windows.values.allSatisfy { $0 } && attention ? 0 : 1)
}
if CommandLine.arguments.contains("--ax-notification-delivery-check") {
    do {
        try await runAXNotificationDeliveryChecks()
        print("AX notification delivery check passed (owned fixture, no mouse/keyboard input)")
        exit(0)
    } catch { fputs("AX notification delivery failed: \(error)\n", stderr); exit(1) }
}
if CommandLine.arguments.contains("--ax-notification-lifecycle-check") {
    do {
        try await runAXNotificationLifecycleChecks()
        print("AX notification lifecycle checks passed (no subscriptions or UI input)")
        exit(0)
    } catch { fputs("AX notification lifecycle failed: \(error)\n", stderr); exit(1) }
}
if CommandLine.arguments.contains("--provider-click-self-test") {
    do { try await runProviderClickChecks(); print("Provider click composition checks passed"); exit(0) }
    catch { fputs("Provider click checks failed: \(error)\n", stderr); exit(1) }
}
if CommandLine.arguments.contains("--cursor-window-fade-owned-check") {
    // Fixture-only watchdog: report failure and terminate this diagnostic;
    // never synthesize animation completion or resume the production waiter.
    DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
        fputs("{\"ownedFadeCheckTimedOut\":true,\"completionVerified\":false,\"sentInput\":false}\n", stderr)
        exit(1)
    }
    let report = await runCursorWindowFadeOwnedCheck()
    let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self))
    exit(0)
}
if CommandLine.arguments.contains("--cursor-owner-hide-owned-check") {
    let report = await runCursorOwnerHideOwnedCheck()
    let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self))
    exit(0)
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
