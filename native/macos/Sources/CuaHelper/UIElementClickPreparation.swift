import CoreGraphics

// Explicit extracted result, not an original public type. The async click state
// machine continues after this decision (including a second web-view query).
struct UIElementClickPreparation {
    let action: UIElementAction?
    let initiallyInsideWebView: Bool
    let useAccessibilityAction: Bool
}

// click entry 0x1007b0f08..<0x1007b11b8. Read actions once, prefer pick over
// press regardless of list order, then query web-view state before eligibility.
// heldKeyIsPresent exposes only the nil check until SAIVirtualKeyPress is restored.
func prepareUIElementClick(
    mouseButton: CGMouseButton,
    count: Int,
    holdDuration: Duration?,
    heldKeyIsPresent: Bool,
    flags: CGEventFlags,
    alwaysSimulateClick: Bool,
    readActions: () -> [UIElementAction],
    isInsideWebView: () -> Bool
) -> UIElementClickPreparation {
    let actions = readActions()
    let action: UIElementAction?
    if actions.contains(.pick) { action = .pick }
    else if actions.contains(.press) { action = .press }
    else { action = nil }
    let insideWebView = isInsideWebView()
    // Original signed comparison is count < 2, not count == 1. Validation of
    // user input belongs elsewhere; do not silently change this internal branch.
    let useAction = count < 2 && action != nil && mouseButton == .left
        && holdDuration == nil && !heldKeyIsPresent && flags.isEmpty && !alwaysSimulateClick
    return UIElementClickPreparation(action: action,
        initiallyInsideWebView: insideWebView, useAccessibilityAction: useAction)
}
