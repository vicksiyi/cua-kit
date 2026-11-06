@main
struct UIElementActionsTests {
    enum Failure: Error { case read }
    static func main() {
        for fails in [false, true] {
            for disclosable in [false, true] {
                for disclosing in [false, true] {
                    for base: [UIElementAction] in [[], [.press], [.expand, .expand], [.collapse]] {
                        var trace: [String] = []
                        let result = uiElementActions(readActions: {
                            trace.append("read")
                            if fails { throw Failure.read }
                            return base
                        }, isDisclosable: { trace.append("disclosable"); return disclosable },
                            isDisclosing: { trace.append("disclosing"); return disclosing },
                            reportError: { error in
                                guard case Failure.read = error else { fatalError() }
                                trace.append("error")
                            })
                        let expected = fails ? [] : base + (disclosable ? [disclosing ? .collapse : .expand] : [])
                        precondition(result == expected)
                        precondition(trace == (fails ? ["read", "error"] :
                            ["read", "disclosable"] + (disclosable ? ["disclosing"] : [])))
                    }
                }
            }
        }
        print("native actions preserve read failure, lazy disclosure and append duplicates: 32 cases")
    }
}
