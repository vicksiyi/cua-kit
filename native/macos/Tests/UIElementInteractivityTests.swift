@main struct Test {
    static func main() {
        for focus in [false, true] {
            for select in [false, true] {
                for value in [false, true] {
                    var trace: [String] = []
                    let interactive = uiElementCanBeUserInteractive(
                        isFocusable: { trace.append("focus"); return focus },
                        isSelectable: { trace.append("select"); return select },
                        isValueSettable: { trace.append("value"); return value })
                    precondition(interactive == (focus || select || value))
                    precondition(trace == (focus ? ["focus"] : select ? ["focus", "select"] : ["focus", "select", "value"]))
                    trace = []
                    let capable = uiElementIsFocusableOrSelectable(
                        isFocusable: { trace.append("focus"); return focus },
                        isSelectable: { trace.append("select"); return select })
                    precondition(capable == (focus || select))
                    precondition(trace == (focus ? ["focus"] : ["focus", "select"]))
                }
            }
        }
        print("Interactivity defaults preserve capability order and short circuiting")
    }
}
