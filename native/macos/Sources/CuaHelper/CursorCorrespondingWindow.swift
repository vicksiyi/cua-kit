import AppKit

// Cursor Window helper 0x10009b03c. No corresponding ID means unrestricted;
// otherwise query visible windows of all apps on the active space only.
func cursorCorrespondingWindowIsPresent(_ id: UInt32?,
    windowNumbers: () -> [NSNumber]?
) -> Bool {
    guard let id else { return true }
    guard let numbers = windowNumbers() else { return false }
    return numbers.contains { $0.uint32Value == id }
}

@MainActor
func nativeCursorCorrespondingWindowIsPresent(_ id: UInt32?) -> Bool {
    cursorCorrespondingWindowIsPresent(id) {
        NSWindow.windowNumbers(options: .allApplications)
    }
}
