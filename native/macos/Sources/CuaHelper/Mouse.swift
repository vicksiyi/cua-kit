import Foundation
import AppKit
import ApplicationServices
import ScreenCaptureKit
import os

struct CapturedWindow {
    let windowId: UInt32
    let frame: CGRect
    let contentRect: CGRect
    let pixelWidth: Int
    let pixelHeight: Int
    let scale: Double
    let snapshotId: String?
    let focus: AXUIElement?
}
func screenshotPoint(_ point: CGPoint, capture: CapturedWindow) throws -> CGPoint {
    guard point.x.isFinite, point.y.isFinite, point.x >= 0, point.y >= 0,
          capture.pixelWidth > 0, capture.pixelHeight > 0,
          point.x < CGFloat(capture.pixelWidth), point.y < CGFloat(capture.pixelHeight),
          [capture.contentRect.minX,capture.contentRect.minY,capture.contentRect.width,capture.contentRect.height].allSatisfy({$0.isFinite}),
          capture.contentRect.width > 0, capture.contentRect.height > 0 else { throw fail("INVALID_ARGUMENT","Point must be inside the observed screenshot.") }
    return CGPoint(x:capture.contentRect.minX + point.x * capture.contentRect.width / CGFloat(capture.pixelWidth),
                   y:capture.contentRect.minY + point.y * capture.contentRect.height / CGFloat(capture.pixelHeight))
}
func mouseModifiers(_ chord: String?) throws -> CGEventFlags {
    var flags = CGEventFlags()
    guard let chord = chord, !chord.isEmpty else { return flags }
    for key in chord.lowercased().split(separator:"+",omittingEmptySubsequences:false) {
        guard let modifier = modifierFlag(String(key)) else { throw fail("UNSUPPORTED_CAPABILITY","Mouse key chords currently support modifiers only.") }
        flags.formUnion(modifier)
    }
    return flags
}
func mouseClickEvents(point: CGPoint, button: String, count: Int, flags: CGEventFlags, window: MouseWindow? = nil) throws -> [CGEvent] {
    guard point.x.isFinite, point.y.isFinite, (1...10).contains(count) else { throw fail("INVALID_ARGUMENT","Click count must be 1..10 and coordinates finite.") }
    let mouse: CGMouseButton, down: CGEventType, up: CGEventType
    switch button {
    case "left","l": mouse = .left; down = .leftMouseDown; up = .leftMouseUp
    case "right","r": mouse = .right; down = .rightMouseDown; up = .rightMouseUp
    case "middle","m": mouse = .center; down = .otherMouseDown; up = .otherMouseUp
    default: throw fail("INVALID_ARGUMENT","Unknown mouse button.")
    }
    var events: [CGEvent] = []
    for click in 1...count {
        // One process-wide number per down/up pair, separate from clickCount.
        let eventNumber = Int(SynthesizedEvent.nextEventNumber)
        for type in [down,up] {
            let nsType: NSEvent.EventType
            switch type {
            case .leftMouseDown: nsType = .leftMouseDown
            case .leftMouseUp: nsType = .leftMouseUp
            case .rightMouseDown: nsType = .rightMouseDown
            case .rightMouseUp: nsType = .rightMouseUp
            case .otherMouseDown: nsType = .otherMouseDown
            default: nsType = .otherMouseUp
            }
            // Source SynthesizedEvent.mouseEvent (0x1007547d4) starts with
            // NSEvent, preserving the AppKit window number in the CG event.
            guard let event = NSEvent.mouseEvent(with: nsType, location: point,
                modifierFlags: [], timestamp: 0, windowNumber: Int(window?.id ?? 0),
                context: nil, eventNumber: eventNumber, clickCount: click, pressure: 1)?.cgEvent else {
                throw fail("PROVIDER_DISCONNECTED", "Cannot allocate mouse event.")
            }
            event.flags = flags
            event.location = point
            event.setIntegerValueField(.mouseEventButtonNumber, value: Int64(mouse.rawValue))
            event.setIntegerValueField(.mouseEventSubtype, value: 3)
            if let window { try applyMouseWindow(window, to: event) }
            events.append(event)
        }
    }
    return events
}
extension Target {
    func observedInputPoint(_ params: [String: Any]) async throws -> CGPoint {
        try validateSnapshot(params)
        let point: CGPoint
        if let id = params["elementId"] as? Int {
            guard params["x"] == nil, params["y"] == nil, id > 0, id <= nodes.count,
                  let frame = axElementFrame(nodes[id-1].element) else { throw fail("INVALID_ARGUMENT","Indexed click requires an element with valid geometry and no coordinates.") }
            point = CGPoint(x:frame.midX,y:frame.midY)
        } else {
            guard let x = params["x"] as? Double, let y = params["y"] as? Double,
                  let capture = capturedWindow, capture.snapshotId == snapshot else { throw fail("STALE_OBSERVATION","Coordinate click requires the current app screenshot.") }
            let current = try await captureWindows()
            guard let window = current.first(where: {$0.windowID == capture.windowId}), window.frame == capture.frame else { throw fail("STALE_OBSERVATION","Captured window moved or closed before click.") }
            let filter = SCContentFilter(desktopIndependentWindow:window)
            guard filter.contentRect == capture.contentRect, Double(filter.pointPixelScale) == capture.scale else { throw fail("STALE_OBSERVATION","Capture coordinates changed before click.") }
            if let focus = capture.focus {
                guard let currentFocus = try focusedCaptureWindow(), CFEqual(focus,currentFocus.element) else { throw fail("STALE_OBSERVATION","Focused window changed before click.") }
            }
            point = try screenshotPoint(CGPoint(x:x,y:y),capture:capture)
        }
        return point
    }
    func mouseInput(_ params: [String: Any]) async throws -> [String: Any] {
        let held = try clickHoldNanoseconds(params["duration"] as? Double)
        let button = params["mouseButton"] as? String ?? "left"
        let count = params["clickCount"] as? Int ?? 1
        guard (1...10).contains(count) else { throw fail("INVALID_ARGUMENT", "Click count must be 1..10.") }
        let mouse: CGMouseButton
        switch button {
        case "left", "l": mouse = .left
        case "right", "r": mouse = .right
        case "middle", "m": mouse = .center
        default: throw fail("INVALID_ARGUMENT", "Unknown mouse button.")
        }
        let flags = try mouseModifiers(params["key"] as? String)
        let report: (Error) -> Void = { error in
            Logger(subsystem: "core.cua", category: "Accessibility").error("Click AX read failed: \(String(describing: error))")
        }
        var focusPreparationSentEvents = false
        func checkDeadline() throws {
            try Task.checkCancellation()
            if let deadline = params["deadlineUnixMilliseconds"] as? Double,
               Date().timeIntervalSince1970 * 1000 + Double(held) / 1_000_000 >= deadline {
                throw fail("INVALID_ARGUMENT", "Click deadline expired before dispatch; earlier clicks may have been dispatched.")
            }
        }
        func activationWindow(for element: UIElement) throws -> SyntheticActivationWindow? {
            guard let raw = attribute(element.axElement, kAXWindowAttribute),
                  let ax = try unwrapAXUIElement(raw, throwingOnFailure: false) else { return nil }
            return SyntheticActivationWindow(element: UIElement(element: ax), reportError: report)
        }
        func sendFocusEvent(_ event: SynthesizedEvent) throws {
            for cgEvent in event.cgEvents {
                try Task.checkCancellation()
                try validateIdentity()
                try checkDeadline()
                dispatchNativeEvent(cgEvent, to: app.processIdentifier)
                focusPreparationSentEvents = true
            }
        }
        func simulate(at point: CGPoint, element: UIElement? = nil,
                      initiallyInsideWebView: Bool = false) async throws -> [String: Any] {
            try validateSnapshot(params)
            try checkDeadline()
            let application = UIElement(element: root)
            let target: MouseEventTarget<UIElement, UIElement>
            if let element {
                guard let raw = attribute(element.axElement, kAXWindowAttribute),
                      let ax = try unwrapAXUIElement(raw, throwingOnFailure: false) else {
                    throw fail("TARGET_NOT_FOUND", "Clicked element has no containing window.")
                }
                target = try application.mouseEventTarget(at: point, accessibilityWindow: UIElement(element: ax),
                    hitElement: element, reportError: report)
            } else {
                // Coordinate input uses the same native hit-test/PID/window
                // resolver as indexed input. Capture geometry validates the
                // supplied pixels; it is not itself a mouse event destination.
                let available = application.elementCollectionValue(for: UIElementAttribute("AXWindows"), reportError: report)
                // Snapshot the current AX window map before the native order
                // read. Full notification-driven registry ownership remains
                // separate; never use AX array order as a stacking fallback.
                var known: [UInt32: UIElement] = [:]
                for window in available {
                    if let id = try? window.axElement.windowID { known[id] = window }
                }
                let windows = orderedMouseWindows(windows: { known }, orderedWindowIDs: { onScreenMouseWindowIDs() })
                target = try application.mouseEventTarget(at: point, windows: windows, reportError: report)
            }
            let window = target.mouseWindow
            let destinationPID = target.pid
            let enforcer = activateFocusEnforcer()
            let prepared = try await application.prepareSyntheticClickFocus(element: target.element,
                insideWebView: initiallyInsideWebView, clickingByCoordinate: true,
                hasHeldKey: false,
                window: SyntheticActivationWindow(element: target.accessibilityWindow, reportError: report), enforcer: enforcer,
                applicationIsActive: {
                    let pid = try self.root.pid
                    return NSRunningApplication(processIdentifier: pid)?.isActive ?? false
                }, reportError: report, send: sendFocusEvent)
            let eventFlags = applicationClickEventFlags(flags, applicationBelievesItHasFocus: prepared)
            let events = try mouseClickEvents(point: point, button: button, count: count, flags: eventFlags, window: window)
            try validateSnapshot(params, allowingFocusChange: focusPreparationSentEvents)
            defer { invalidateInputState() }
            for index in stride(from: 0, to: events.count, by: 2) {
                try checkDeadline()
                try await dispatchHeldPair(events[index], events[index+1], nanoseconds: held,
                    post: { dispatchNativeEvent($0, to: destinationPID) }, validate: { try self.validateIdentity() },
                    wait: { try await Task.sleep(nanoseconds: $0) })
                if index + 2 < events.count {
                    try await Task.sleep(for: SynthesizedEvent.defaultClickDuration)
                }
            }
            return ["outcome": "dispatched", "eventCount": events.count, "targetPid": Int(destinationPID), "windowId": Int(window.id), "point": ["x": point.x, "y": point.y]]
        }
        guard let id = params["elementId"] as? Int else {
            return try await simulate(at: observedInputPoint(params))
        }
        try validateSnapshot(params)
        guard params["x"] == nil, params["y"] == nil, id > 0, id <= nodes.count else {
            throw fail("INVALID_ARGUMENT", "Indexed click requires a valid element ID and no coordinates.")
        }
        let item = UIElement(element: nodes[id - 1].element)
        let insideWebView: () -> Bool = {
            item.isInsideWebView(reportError: report)
        }
        let preparation = prepareUIElementClick(mouseButton: mouse, count: count,
            holdDuration: (params["duration"] as? Double).map { _ in Duration.nanoseconds(Int64(held)) },
            heldKeyIsPresent: false, flags: flags,
            alwaysSimulateClick: params["alwaysSimulateClick"] as? Bool ?? false,
            readActions: { item.actions }, isInsideWebView: insideWebView)
        // VirtualCursor remains absent. AX actions now use the restored native
        // enforcer and window context rather than the nil-enforcer probe.
        return try await executePreparedUIElementClick(preparation, isInsideWebView: insideWebView,
            webClickHitsTarget: {
                await item.webClickHitsTarget(app: UIElement(element: root), reportError: report)
            }, cursorPress: nil,
            prepareActionFocus: {
                try Task.checkCancellation()
                try validateSnapshot(params)
                try checkDeadline()
                let window = try activationWindow(for: item)
                let enforcer = activateFocusEnforcer()
                try await UIElement(element: root).prepareAccessibilityClickFocus(element: item,
                    window: window, enforcer: enforcer,
                    probeApplicationIsActive: { try probeSystemApplicationIsActiveForAXAction(root) },
                    reportError: report, send: sendFocusEvent)
            },
            performAction: { action in
                try validateSnapshot(params, allowingFocusChange: focusPreparationSentEvents)
                try checkDeadline()
                defer { invalidateInputState() }
                try item.perform(action: action)
                return ["outcome": "dispatched", "eventCount": 0, "action": action.name]
            }, simulateClick: { initiallyInsideWebView in
                guard let point = try await item.clickablePoint(reportError: report) else {
                    throw SynthesizedEvent.Error.cannotClickOffscreenElement
                }
                return try await simulate(at: point, element: item, initiallyInsideWebView: initiallyInsideWebView)
            })
    }
}
