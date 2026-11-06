@main
struct UIElementFocusCapabilityTests {
    enum Failure: Error { case query }
    static func main() {
        var cases = 0
        for supported in [false, true] {
            for role in [UIElementRole.textArea, .textField, .dateTimeArea, .button, .unknown] {
                for status in 0...2 {
                    for enabled in [false, true] {
                        var trace: [String] = []
                        let result = uiElementIsFocusable(
                            focusedIsSupported: { trace.append("support"); return supported },
                            role: { trace.append("role"); return role },
                            focusedIsSettable: {
                                trace.append("settable")
                                if status == 2 { throw Failure.query }
                                return status == 1
                            }, isEnabled: { trace.append("enabled"); return enabled })
                        let fallback = role == .textArea || role == .textField || role == .dateTimeArea
                        precondition(result == (supported && (status == 1 || (status == 2 && fallback && enabled))))
                        let expected = supported ? ["support", "role", "settable"] + (status == 2 && fallback ? ["enabled"] : []) : ["support"]
                        precondition(trace == expected)
                        cases += 1
                    }
                }
            }
        }
        precondition(cases == 60)
        print("native focus capability preserves support gating and role-specific error fallback: 60 cases")
    }
}
