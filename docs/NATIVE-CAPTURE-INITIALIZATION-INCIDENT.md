# Native capture initialization failure (2026-11-07)

The local 07:57:41 UTC demo trace progressed beyond model inference and app
approval, but getApp failed with AX -25204, followed on subsequent attempts by
native pipe closure and service startup failures. One model HTTP 503 retry was
separate from these native errors.

Two macOS crash reports at 15:58:05 and 15:58:22 local time show cua-helper
SIGABRT in SLSGetDisplaysWithRect, called by SCContentFilter's
initWithDesktopIndependentWindow, from Target.screenshot (Capture.swift).
This is process termination, not a throwable Swift screenshot error.

Inspection of the installed macOS 26.2 framework in an owned debug probe
identifies the abort branch as CGS_REQUIRE_INIT, CGInitialization.c line 44,
asserting did_initialize. In that probe the initialization byte was 0 before
NSApplication.sharedApplication and 1 after it. No vendor service was launched.
SCShareableContent enumeration alone had not initialized this subsystem in
the failing command-line helper.

Fix: initialize NSApplication.shared on the main actor before ScreenCaptureKit
window enumeration/filter construction and before screen-audio setup. This
creates no app window and does not grant or request capture permission. Existing
permission checks run first. Coordinate input also goes through captureWindows,
so its filter constructor receives the same initialization.

Validation: Swift build, graphics initialization/idempotence self-test, and
owned provider composition tests passed. The rebuilt default debug helper is
used by the next demo invocation. A separate live capture probe was denied
screen-capture access by its host (SCStreamError -3801); therefore successful
Multica screenshot/input has NOT been verified from this agent environment.
The original AX -25204 is a distinct recoverable read failure; no claim is made
that this graphics fix eliminates it. No model requests were used for testing.

Retry in the user's already-authorized terminal after starting a fresh demo
process. A persisted helper session that already crashed cannot be repaired by
reusing that process. If AX -25204 recurs, inspect the next trace separately.
