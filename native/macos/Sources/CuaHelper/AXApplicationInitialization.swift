import Foundation
import Darwin

// 0x100701e04..0x1007020b4. Keep the native descendant search and polling
// boundaries explicit until their complete provider implementation is composed.
// The condition is a WebAreaUIElement descendant lookup, not generic AX tree
// availability, window activation, or successful screenshot capture.
func initializeAXApplication<Window>(window: Window?,
    initialDelay: (UInt32) -> Void = { _ = usleep($0) },
    poll: (_ timeout: Double, _ delay: Double, _ condition: () -> Bool) throws -> Void,
    hasWebAreaDescendant: @escaping (Window) -> Bool,
    reportError: (Error) -> Void) -> Bool {
    guard let window else { return false }
    initialDelay(100_000)
    do {
        try poll(1, 0.05) { hasWebAreaDescendant(window) }
        return true
    } catch {
        reportError(error)
        return false
    }
}
