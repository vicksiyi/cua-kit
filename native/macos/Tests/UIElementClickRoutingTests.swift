import CoreGraphics

@main struct UIElementClickRoutingTests {
    enum Failure: Error { case cursor, focus, action, simulation }
    static func main() async throws {
        for eligible in [false, true] {
            for initialWeb in [false, true] {
                for secondWeb in [false, true] {
                    for hit in [false, true] {
                        for cursor in [false, true] {
                            var events: [String] = []
                            let preparation = UIElementClickPreparation(action: .pick, initiallyInsideWebView: initialWeb, useAccessibilityAction: eligible)
                            let press: (() async throws -> Void)? = cursor ? { events.append("cursor") } : nil
                            let result = try await executePreparedUIElementClick(preparation,
                                isInsideWebView: { events.append("web"); return secondWeb },
                                webClickHitsTarget: { events.append("hit"); return hit }, cursorPress: press,
                                prepareActionFocus: { events.append("focus") },
                                performAction: { action in precondition(action == .pick); events.append("action"); return "AX" },
                                simulateClick: { web in precondition(web == initialWeb); events.append("simulate"); return "CG" })
                            var expected: [String] = []
                            if eligible { expected.append("web"); if secondWeb { expected.append("hit") } }
                            let simulated = !eligible || (secondWeb && hit)
                            if simulated { expected.append("simulate") }
                            else { if cursor { expected.append("cursor") }; expected += ["focus", "action"] }
                            precondition(events == expected && result == (simulated ? "CG" : "AX"))
                        }
                    }
                }
            }
        }
        for failing in [Failure.cursor, .focus, .action, .simulation] {
            var events: [String] = []
            do {
                let _: Void = try await executePreparedUIElementClick(
                    UIElementClickPreparation(action: .press, initiallyInsideWebView: false, useAccessibilityAction: failing != .simulation),
                    isInsideWebView: { false }, webClickHitsTarget: { fatalError() },
                    cursorPress: { events.append("cursor"); if failing == .cursor { throw failing } },
                    prepareActionFocus: { events.append("focus"); if failing == .focus { throw failing } },
                    performAction: { _ in events.append("action"); throw failing },
                    simulateClick: { _ in events.append("simulate"); throw failing })
                preconditionFailure()
            } catch let error as Failure { precondition(error == failing) }
            switch failing {
            case .cursor: precondition(events == ["cursor"])
            case .focus: precondition(events == ["cursor", "focus"])
            case .action: precondition(events == ["cursor", "focus", "action"])
            case .simulation: precondition(events == ["simulate"])
            }
        }
        try await actorIsolation()
        print("Click routing preserves second WebView read, cursor-focus-action order and no error retry")
    }
    @MainActor static func actorIsolation() async throws {
        let _: Void = try await executePreparedUIElementClick(
            UIElementClickPreparation(action: .press, initiallyInsideWebView: false, useAccessibilityAction: true),
            isInsideWebView: { MainActor.preconditionIsolated(); return false },
            webClickHitsTarget: { fatalError() },
            cursorPress: { await Task.yield(); MainActor.preconditionIsolated() },
            prepareActionFocus: { await Task.yield(); MainActor.preconditionIsolated() },
            performAction: { _ in MainActor.preconditionIsolated() }, simulateClick: { _ in fatalError() })
    }

}
