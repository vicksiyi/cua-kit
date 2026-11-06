@main struct UIElementActionFocusPreparationTests {
    enum Failure: Error { case query, enforce }
    static func main() async throws {
        for enforcer in [false, true] {
            for focused in [false, true] {
                for catalyst in [false, true] {
                    for selection in [false, true] {
                        for role: UIElementRole? in [nil, .button, .menuButton] {
                            var events: [String] = []
                            try await prepareUIElementAccessibilityActionFocus(hasFocusEnforcer: enforcer,
                                applicationBelievesItHasFocus: { events.append("focus"); return focused },
                                isCatalystApp: { events.append("catalyst"); return catalyst },
                                clickingMayCauseSelection: { events.append("selection"); return selection },
                                role: { events.append("role"); return role },
                                probeApplicationIsActive: { events.append("probe") },
                                safelyEnforceWindowActiveState: { events.append("enforce") })
                            var expected: [String] = []
                            if !enforcer { expected = ["probe"] }
                            else {
                                expected.append("focus")
                                if !focused {
                                    expected.append("catalyst")
                                    if catalyst {
                                        expected.append("selection")
                                        if !selection { expected.append("role") }
                                        if selection || role == .menuButton { expected.append("enforce") }
                                    }
                                }
                            }
                            precondition(events == expected)
                        }
                    }
                }
            }
        }
        for enforcer in [false, true] {
            var actionRan = false
            do {
                try await prepareUIElementAccessibilityActionFocus(hasFocusEnforcer: enforcer,
                    applicationBelievesItHasFocus: { false }, isCatalystApp: { true },
                    clickingMayCauseSelection: { true }, role: { fatalError() },
                    probeApplicationIsActive: { throw Failure.query },
                    safelyEnforceWindowActiveState: { throw Failure.enforce })
                actionRan = true
            } catch let error as Failure {
                switch (enforcer, error) {
                case (false, .query), (true, .enforce): break
                default: preconditionFailure()
                }
            }
            precondition(!actionRan)
        }
        print("AX action focus preparation preserves Catalyst gates and error propagation")
    }
}
