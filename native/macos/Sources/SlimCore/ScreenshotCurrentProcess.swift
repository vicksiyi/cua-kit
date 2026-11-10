import AppKit

// fb4740..fb49c8: absent IDs skip NSApp entirely. Present IDs (including an
// empty list) collect visible positive-numbered ordered windows, then use subset.
// windowNumber is read again for checked UInt32 conversion after visibility.
public func screenshotUsesCurrentProcess<Window>(includedWindowIDs: [UInt32]?,
    orderedWindows: () -> [Window], windowNumber: (Window) -> Int,
    isVisible: (Window) -> Bool
) -> Bool {
    guard let includedWindowIDs else { return false }
    var numbers: [UInt32] = []
    for window in orderedWindows() {
        if windowNumber(window) > 0 && isVisible(window) {
            numbers.append(UInt32(windowNumber(window)))
        }
    }
    return Set(includedWindowIDs).isSubset(of: Set(numbers))
}

public func screenshotUsesCurrentProcess(includedWindowIDs: [UInt32]?) -> Bool {
    screenshotUsesCurrentProcess(includedWindowIDs: includedWindowIDs,
        orderedWindows: { NSApp.orderedWindows },
        windowNumber: { $0.windowNumber }, isVisible: { $0.isVisible })
}
