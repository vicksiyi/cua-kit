import ApplicationServices
import Foundation
import os

// Opt-in real delivery check. Owns and terminates the exact sibling fixture;
// no pre-existing user app is targeted and no mouse/keyboard input is sent.
func runAXNotificationDeliveryChecks() async throws {
    guard CommandLine.arguments.contains("--allow-owned-ui") else {
        throw UIElementError.failedInit("Requires --allow-owned-ui")
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
    let events = OSAllocatedUnfairLock<Int>(initialState: 0)
    let observer = try AXNotificationObserver(processID: pid) { event in
        var eventPID: pid_t = 0
        if event.notification == .windowMoved,
            AXUIElementGetPid(event.element, &eventPID) == .success, eventPID == pid {
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
    try observer.remove(AppControllerAXNotifications.root, for: root)
    observer.stopMonitoring()
    child.terminate()
    let cleanupDeadline = ContinuousClock.now.advanced(by: .seconds(2))
    while child.isRunning && ContinuousClock.now < cleanupDeadline {
        try await Task.sleep(for: .milliseconds(20))
    }
    guard !child.isRunning else { throw UIElementError.failedInit("Owned fixture did not terminate") }
}
