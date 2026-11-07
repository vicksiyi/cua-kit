import AppKit

// Command-line helpers do not pass through NSApplicationMain. ScreenCaptureKit
// can enumerate windows before SkyLight initialization, but SCContentFilter's
// display lookup asserts CGS_REQUIRE_INIT/did_initialize on macOS 26.2.
// Initialize AppKit on the main actor without creating a window or prompting
// for capture permission. NSApplication.shared is process-wide and idempotent.
@MainActor
func initializeNativeGraphics() {
    _ = NSApplication.shared
}
