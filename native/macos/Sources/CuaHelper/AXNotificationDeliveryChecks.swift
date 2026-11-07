import ApplicationServices
import Foundation
import AppKit
import os

// Opt-in real delivery check. Owns and terminates the exact sibling fixture;
// no pre-existing user app is targeted and no mouse/keyboard input is sent.
func runAXNotificationDeliveryChecks() async throws {
    guard CommandLine.arguments.contains("--allow-owned-ui") else {
        throw UIElementError.failedInit("Requires --allow-owned-ui")
    }
    let session = CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:]
    guard session["CGSSessionScreenIsLocked"] as? Bool != true,
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier != "com.apple.loginwindow" else {
        throw UIElementError.failedInit("Desktop is locked; owned-window delivery acceptance was not run")
    }
    let fixture = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
        .deletingLastPathComponent().appendingPathComponent("CuaFixture")
    guard FileManager.default.isExecutableFile(atPath: fixture.path) else {
        throw UIElementError.failedInit("Missing sibling CuaFixture")
    }
    let child = Process()
    child.executableURL = fixture
    child.arguments = ["--ax-event-probe"]
    child.standardOutput = FileHandle.nullDevice
    child.standardError = FileHandle.nullDevice
    try child.run()
    defer { if child.isRunning { child.terminate() } }
    let pid = child.processIdentifier
    let root = AXUIElementCreateApplication(pid)
    if CommandLine.arguments.contains("--full-window-owner") {
        try await verifyOwnedWindowObservation(application: root, processID: pid, child: child)
    } else {
        let events = OSAllocatedUnfairLock<Int>(initialState: 0)
        let published = OSAllocatedUnfairLock<(count: Int, ids: [UInt32])>(initialState: (0, []))
        let windows = AppControllerWindows<UIElement>(observedWindowIDsChanged: { ids in
            published.withLock { $0.count += 1; $0.ids = ids }
        }, menuDidOpen: {}, menuDidClose: {})
        // Accessed only on the observer's serial callback thread after monitoring
        // starts; the async test reads only the separate acceptance counters.
        var seededWindow = false
        let observer = try AXNotificationObserver(processID: pid) { event in
            var eventPID: pid_t = 0
            if event.notification == .windowMoved,
                AXUIElementGetPid(event.element, &eventPID) == .success, eventPID == pid {
                // Seed from our owned event's real window, then exercise the same
                // geometry route that production controller composition will use.
                if !seededWindow { windows.registerWindow(event.element); seededWindow = true }
                dispatchAppControllerWindowEvent(event.notification, element: event.element,
                    registerWindow: windows.registerWindow, registerSheet: windows.registerSheet,
                    clearApplicationAttention: {}, windowCreatedFocusHandling: { _ in },
                    removeDestroyedSubscription: { _ in }, menuOpened: windows.openMenu,
                    menuClosed: windows.closeMenu, stopSuppressingMenuDismissal: {},
                    republishObservedWindowIDs: windows.republishObservedWindowIDs)
                events.withLock { $0 += 1 }
            }
        }
        defer { observer.stopMonitoring() }
        let deadline = ContinuousClock.now.advanced(by: .seconds(8))
        // Wait only for our child application to finish exposing its AX root.
        var registered = false
        var lastRegistrationError: Error?
        while ContinuousClock.now < deadline, child.isRunning {
            if !registered {
                do { try observer.register(AppControllerAXNotifications.root, for: root); registered = true
                    observer.startMonitoring(qos: .utility)
                } catch { lastRegistrationError = error; try await Task.sleep(for: .milliseconds(50)); continue }
            }
            if events.withLock({ $0 }) > 0 { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        guard events.withLock({ $0 }) > 0 else {
            throw UIElementError.failedInit("No owned windowMoved notification received; registration error: \(String(describing: lastRegistrationError))")
        }
        let publication = published.withLock { $0 }
        guard publication.count >= 2, publication.ids.count == 1, publication.ids[0] != 0 else {
            throw UIElementError.failedInit("Owned event did not register and republish a native window ID")
        }
        try observer.remove(AppControllerAXNotifications.root, for: root)
        observer.stopMonitoring()
    }
    child.terminate()
    let cleanupDeadline = ContinuousClock.now.advanced(by: .seconds(2))
    while child.isRunning && ContinuousClock.now < cleanupDeadline {
        try await Task.sleep(for: .milliseconds(20))
    }
    guard !child.isRunning else { throw UIElementError.failedInit("Owned fixture did not terminate") }
}

// Exercises the same owner constructor and serial delivery adapter as Target.
// Ordering stays inactive: this check proves AX ownership/delivery/registry
// composition, not WindowServer ordering restoration or actual input effects.
@MainActor
private func verifyOwnedWindowObservation(application: AXUIElement, processID: Int32, child: Process) async throws {
    let deadline = ContinuousClock.now.advanced(by: .seconds(8))
    var ready = false
    while ContinuousClock.now < deadline, child.isRunning {
        var value: CFTypeRef?
        if AXUIElementCopyAttributeValue(application, kAXWindowsAttribute as CFString, &value) == .success,
            let windows = value as? [AXUIElement], !windows.isEmpty {
            ready = true
            break
        }
        try await Task.sleep(for: .milliseconds(50))
    }
    guard ready else { throw UIElementError.failedInit("Owned application did not expose its AX windows") }
    let delivered = OSAllocatedUnfairLock<Int>(initialState: 0)
    let errors = OSAllocatedUnfairLock<[String]>(initialState: [])
    var owner: AppControllerWindowObservation<MenuBarItemUIElement>? = try AppControllerWindowObservation(
        application: application, processID: processID, bundleIdentifier: "",
        focusEnforcer: { nil }, reportError: { error in
            errors.withLock { $0.append(String(describing: error)) }
        }, deliverEvent: { operation in
            DispatchQueue.main.async {
                operation()
                delivered.withLock { $0 += 1 }
            }
        })
    weak var weakOwner = owner
    let initialIDs = Set(owner!.windows.windows().keys)
    guard initialIDs.count == 1, !initialIDs.contains(0) else {
        throw UIElementError.failedInit("Owner initialization did not discover the owned native window")
    }
    while delivered.withLock({ $0 }) == 0, ContinuousClock.now < deadline, child.isRunning {
        try await Task.sleep(for: .milliseconds(20))
    }
    guard delivered.withLock({ $0 }) > 0,
        Set(owner!.windows.windows().keys) == initialIDs else {
        throw UIElementError.failedInit("Owner did not deliver native AX events with its window registry intact")
    }
    guard errors.withLock({ $0.isEmpty }) else {
        throw UIElementError.failedInit("Owner initialization reported errors: \(errors.withLock { $0 })")
    }
    owner = nil
    guard weakOwner == nil else { throw UIElementError.failedInit("Owned window observation was retained after release") }
}
