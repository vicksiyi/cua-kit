import CoreGraphics

@main struct UIElementClickPreparationTests {
    static func main() {
        let candidates: [([UIElementAction], UIElementAction?)] = [
            ([], nil), ([.showMenu], nil), ([.press], .press), ([.pick], .pick),
            ([.press, .pick], .pick), ([.pick, .press], .pick), ([.press, .press], .press)]
        var checked = 0
        for (actions, expectedAction) in candidates {
            for count in [Int.min, -1, 0, 1, 2, 3, Int.max] {
                for button in [CGMouseButton.left, .right, .center] {
                    for duration: Duration? in [nil, .zero, .milliseconds(10)] {
                        for heldKey in [false, true] {
                            for flags in [CGEventFlags(), .maskShift] {
                                for simulate in [false, true] {
                                    for inside in [false, true] {
                                        var reads: [String] = []
                                        let result = prepareUIElementClick(mouseButton: button, count: count,
                                            holdDuration: duration, heldKeyIsPresent: heldKey, flags: flags,
                                            alwaysSimulateClick: simulate,
                                            readActions: { reads.append("actions"); return actions },
                                            isInsideWebView: { reads.append("web"); return inside })
                                        precondition(result.action == expectedAction)
                                        precondition(result.initiallyInsideWebView == inside)
                                        let mustSimulate = expectedAction == nil || count >= 2 || button != .left
                                            || duration != nil || heldKey || !flags.isEmpty || simulate
                                        precondition(result.useAccessibilityAction == !mustSimulate)
                                        precondition(reads == ["actions", "web"])
                                        checked += 1
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        print("click preparation preserves pick priority and parameter gating: \(checked) cases")
    }
}
