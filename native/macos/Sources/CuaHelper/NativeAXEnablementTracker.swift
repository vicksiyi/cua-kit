import AppKit
import os

// Native AssertionTracker singleton ownership. All production accesses occur
// on the same MainActor as Target and the helper request dispatcher.
@MainActor
enum NativeAXEnablementTracker {
    static let shared = AXEnablementAssertionTracker<NSRunningApplication>(
        reportFirstAcquisition: { application, kind in
            Logger(subsystem: "core.cua", category: "AXEnablement").debug("Acquire pid=\(application.processIdentifier) kind=\(String(describing: kind))")
        }, reportMissingRelease: { application in
            Logger(subsystem: "core.cua", category: "AXEnablement").error("Missing assertion release pid=\(application.processIdentifier)")
        })
}
