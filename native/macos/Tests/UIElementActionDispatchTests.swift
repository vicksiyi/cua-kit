@main
struct UIElementActionDispatchTests {
    enum Failure: Error { case injected }

    static func main() throws {
        let directions: [(UIElementAction, UIElementScrollDirection)] = [
            (.scrollUpByPage, .up), (.scrollDownByPage, .down),
            (.scrollLeftByPage, .left), (.scrollRightByPage, .right),
        ]
        for (action, direction) in directions {
            precondition(UIElementScrollDirection(action: action) == direction)
            for handled in [false, true] {
                var events: [String] = []
                try dispatchUIElementActionAfterMenuPreparation(action,
                    toggleDisclosure: { fatalError("scroll must not toggle") },
                    scrollUsingScrollBar: {
                        precondition($0 == direction)
                        events.append("scroll"); return handled
                    },
                    performAXAction: {
                        precondition($0 == action); events.append("ax")
                    })
                precondition(events == (handled ? ["scroll"] : ["scroll", "ax"]))
            }
        }
        for action in [UIElementAction.expand, .collapse] {
            var calls = 0
            try dispatchUIElementActionAfterMenuPreparation(action,
                toggleDisclosure: { calls += 1 },
                scrollUsingScrollBar: { _ in fatalError("toggle must not scroll") },
                performAXAction: { _ in fatalError("synthetic action must not reach AX") })
            precondition(calls == 1)
        }
        for action in [UIElementAction.press, .scrollToVisible, UIElementAction("custom") ] {
            precondition(UIElementScrollDirection(action: action) == nil)
            var calls = 0
            try dispatchUIElementActionAfterMenuPreparation(action,
                toggleDisclosure: { fatalError("ordinary action must not toggle") },
                scrollUsingScrollBar: { _ in fatalError("ordinary action must not scroll") },
                performAXAction: { precondition($0 == action); calls += 1 })
            precondition(calls == 1)
        }
        // Errors must propagate from all three branches without falling back,
        // retrying, or reporting success after a possibly partial operation.
        for action in [UIElementAction.expand, .scrollDownByPage, .press] {
            var calls = 0
            do {
                try dispatchUIElementActionAfterMenuPreparation(action,
                    toggleDisclosure: { calls += 1; throw Failure.injected },
                    scrollUsingScrollBar: { _ in calls += 1; throw Failure.injected },
                    performAXAction: { _ in calls += 1; throw Failure.injected })
                fatalError("lost action error")
            } catch Failure.injected { precondition(calls == 1) }
        }
        let oldUp = UIElementAction.scrollUpByPage
        let oldExpand = UIElementAction.expand
        defer { UIElementAction.scrollUpByPage = oldUp; UIElementAction.expand = oldExpand }
        UIElementAction.scrollUpByPage = .scrollDownByPage
        precondition(UIElementScrollDirection(action: .scrollDownByPage) == .up)
        UIElementAction.expand = .scrollDownByPage
        var toggled = false
        try dispatchUIElementActionAfterMenuPreparation(.scrollDownByPage,
            toggleDisclosure: { toggled = true },
            scrollUsingScrollBar: { _ in fatalError("disclosure must have precedence") },
            performAXAction: { _ in fatalError("disclosure must have precedence") })
        precondition(toggled)
        print("native action dispatch preserves disclosure precedence, scroll fallback and error propagation")
    }
}
