@main struct Check {
    struct Window { let number: Int; let visible: Bool }
    static func main() {
        let windows = [Window(number: -1, visible: true), Window(number: 0, visible: true),
            Window(number: 7, visible: false), Window(number: 8, visible: true), Window(number: 8, visible: true)]
        for ids in [nil, [], [8], [8, 8], [7], [8, 99]] as [[UInt32]?] {
            var events: [String] = []
            let result = screenshotUsesCurrentProcess(includedWindowIDs: ids,
                orderedWindows: { events.append("ordered"); return windows },
                windowNumber: { events.append("number:\($0.number)"); return $0.number },
                isVisible: { events.append("visible:\($0.number)"); return $0.visible })
            precondition(result == (ids != nil && ids!.allSatisfy { $0 == 8 }))
            if ids == nil { precondition(events.isEmpty) }
            else { precondition(events == ["ordered", "number:-1", "number:0", "number:7", "visible:7",
                "number:8", "visible:8", "number:8", "number:8", "visible:8", "number:8"]) }
        }
        var calls = 0
        precondition(screenshotUsesCurrentProcess(includedWindowIDs: [],
            orderedWindows: { calls += 1; return [] as [Window] },
            windowNumber: { $0.number }, isVisible: { $0.visible }))
        precondition(calls == 1)
        // Hidden windows do not perform the checked conversion, even with large IDs.
        precondition(!screenshotUsesCurrentProcess(includedWindowIDs: [1],
            orderedWindows: { [Window(number: Int.max, visible: false)] },
            windowNumber: { $0.number }, isVisible: { $0.visible }))
        print("Screenshot current-process policy checks passed")
    }
}
