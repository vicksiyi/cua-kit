import CoreGraphics

@main struct Check {
    struct Window { let id: UInt32; let frame: CGRect }
    struct Display { let id: Int; let frame: CGRect }
    final class Missing: Error {}
    static func main() throws {
        let left = Display(id: 1, frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        let right = Display(id: 2, frame: CGRect(x: 100, y: 0, width: 100, height: 100))
        let window = Window(id: 7, frame: CGRect(x: 120, y: 10, width: 20, height: 30))
        var events: [String] = [], displayReads = 0
        let plan = try screenshotIncludedDisplayPlan(includedWindowIDs: [7, 99, 7], cropToFirstWindow: true,
            lookup: { id in events.append("lookup:\(id)"); return id == 7 ? window : nil },
            windowFrame: { events.append("window:\($0.id)"); return $0.frame },
            displays: { displayReads += 1; events.append("displays"); return [left, right] },
            displayFrame: { events.append("display:\($0.id)"); return $0.frame },
            missingDisplay: { preconditionFailure("display exists") })
        precondition(plan.windows.map(\.id) == [7, 7] && plan.display.id == 2 && plan.region == window.frame)
        precondition(Array(events.prefix(7)) == ["lookup:7", "lookup:99", "lookup:7", "displays", "lookup:7", "window:7", "displays"])
        precondition(displayReads == 2)
        // A missing first requested window falls through to union; it does not
        // change the crop anchor to the first resolved window.
        var frameReads = 0
        let union = try screenshotIncludedDisplayPlan(includedWindowIDs: [99, 7, 7], cropToFirstWindow: true,
            lookup: { $0 == 7 ? window : nil }, windowFrame: { frameReads += 1; return $0.frame },
            displays: { [left, right] }, displayFrame: { $0.frame }, missingDisplay: { Missing() })
        precondition(union.region == window.frame && frameReads == 2)
        // Initial display is retained when the second content read becomes empty.
        displayReads = 0
        let retained = try screenshotIncludedDisplayPlan(includedWindowIDs: [7], cropToFirstWindow: false,
            lookup: { _ in window }, windowFrame: { $0.frame },
            displays: { displayReads += 1; return displayReads == 1 ? [left] : [] },
            displayFrame: { $0.frame }, missingDisplay: { Missing() })
        precondition(retained.display.id == left.id && displayReads == 2)
        // Missing display fails after resolving all IDs, before reading a frame.
        events = []; let failure = Missing()
        do {
            _ = try screenshotIncludedDisplayPlan(includedWindowIDs: [7, 7], cropToFirstWindow: true,
                lookup: { id in events.append("lookup"); return window },
                windowFrame: { _ in preconditionFailure("no frame read") },
                displays: { () -> [Display] in events.append("displays"); return [] },
                displayFrame: { $0.frame }, missingDisplay: { failure })
            preconditionFailure("missing display must fail")
        } catch { precondition(error as AnyObject === failure && events == ["lookup", "lookup", "displays"]) }
        do {
            _ = try screenshotIncludedDisplayPlan(includedWindowIDs: [], cropToFirstWindow: false,
                lookup: { (_: UInt32) -> Window? in nil }, windowFrame: { $0.frame },
                displays: { [] as [Display] }, displayFrame: { $0.frame })
            preconditionFailure("default missing display must fail")
        } catch ScreenshotImplementation.Error.screenCaptureFailed { }
        let invalid = ScreenshotImplementation.Error.invalidCaptureSize(CGSize(width: 0, height: -1))
        if case let .invalidCaptureSize(size) = invalid {
            precondition(size.width == 0 && size.height == -1)
        } else { preconditionFailure("size payload missing") }
        print("Screenshot included display plan checks passed")
    }
}
