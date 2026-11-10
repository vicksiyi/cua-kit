import ScreenCaptureKit

// Acquisition routefb4a78: select one SDK method and propagate its error;
// errors do not trigger a second scope or replace the content with empty data.
public func acquireScreenshotContent<Content>(currentProcessOnly: Bool, supportsCurrentProcess: Bool,
    includedWindowIDs: [UInt32]?, visibleWindowIDs: () -> [UInt32],
    acquire: (ScreenshotContentScope) async throws -> Content
) async throws -> Content {
    let scope = screenshotContentScope(currentProcessOnly: currentProcessOnly,
        supportsCurrentProcess: supportsCurrentProcess, includedWindowIDs: includedWindowIDs,
        visibleWindowIDs: visibleWindowIDs)
    return try await acquire(scope)
}

public func screenshotShareableContent(currentProcessOnly: Bool,
    includedWindowIDs: [UInt32]?
) async throws -> SCShareableContent {
    let supportsCurrentProcess: Bool
    if #available(macOS 14.4, *) { supportsCurrentProcess = true }
    else { supportsCurrentProcess = false }
    return try await acquireScreenshotContent(currentProcessOnly: currentProcessOnly,
        supportsCurrentProcess: supportsCurrentProcess, includedWindowIDs: includedWindowIDs,
        visibleWindowIDs: { onScreenMouseWindowIDs() }, acquire: { scope in
            switch scope {
            case .currentProcess:
                if #available(macOS 14.4, *) { return try await SCShareableContent.currentProcess }
                preconditionFailure("Scope policy selected unavailable current-process API")
            case .onScreenExcludingDesktop:
                return try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            case .all:
                return try await SCShareableContent.current
            }
        })
}
