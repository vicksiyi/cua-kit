@main
struct UIElementScrollUsingScrollBarTests {
    enum Failure: Error { case pressed }

    static func main() throws {
        let cases: [(UIElementAction, String, String)] = [
            (.scrollUpByPage, "vertical", "decrement"),
            (.scrollDownByPage, "vertical", "increment"),
            (.scrollLeftByPage, "horizontal", "decrement"),
            (.scrollRightByPage, "horizontal", "increment"),
        ]
        // Compose with the real restored dispatch tail. Only source getters and
        // external action execution are injected; no UI or model is called.
        for (action, axis, page) in cases {
            for hasBar in [false, true] {
                for hasButton in [false, true] {
                    for fails in [false, true] {
                        var events: [String] = []
                        func bar(_ name: String) -> String? {
                            precondition(name == axis)
                            events.append(name)
                            return hasBar ? name : nil
                        }
                        func button(_ parent: String, _ name: String) -> String? {
                            precondition(parent == axis && name == page)
                            events.append(name)
                            return hasButton ? name : nil
                        }
                        do {
                            try dispatchUIElementActionAfterMenuPreparation(action,
                                toggleDisclosure: { fatalError("unexpected toggle") },
                                scrollUsingScrollBar: { direction in
                                    try uiElementScrollUsingScrollBar(direction: direction,
                                        verticalScrollBar: { bar("vertical") },
                                        horizontalScrollBar: { bar("horizontal") },
                                        decrementPageButton: { button($0, "decrement") },
                                        incrementPageButton: { button($0, "increment") },
                                        perform: { target, request in
                                            precondition(target == page && request == .press)
                                            events.append("press")
                                            if fails { throw Failure.pressed }
                                        })
                                },
                                performAXAction: {
                                    precondition($0 == action); events.append("fallback")
                                })
                            precondition(!(hasBar && hasButton && fails))
                        } catch Failure.pressed {
                            precondition(hasBar && hasButton && fails)
                        }
                        var expected = [axis]
                        if hasBar { expected.append(page) }
                        expected.append(hasBar && hasButton ? "press" : "fallback")
                        precondition(events == expected)
                    }
                }
            }
        }
        let original = UIElementAction.press
        defer { UIElementAction.press = original }
        UIElementAction.press = UIElementAction("custom-press")
        let handled = try uiElementScrollUsingScrollBar(direction: .up,
            verticalScrollBar: { 17 }, horizontalScrollBar: { fatalError("wrong axis") },
            decrementPageButton: { value -> Int? in precondition(value == 17); return 42 },
            incrementPageButton: { _ -> Int? in fatalError("wrong page") },
            perform: { value, action in
                precondition(value == 42 && action.name == "custom-press")
            })
        precondition(handled)
        print("native scrollbar dispatch preserves axis, page button, fallback and thrown errors")
    }
}
