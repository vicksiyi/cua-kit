@main
struct UIElementMenuPreparationTests {
    enum Failure: Error { case ancestor }
    static func main() throws {
        for role in [UIElementRole.menuItem, .button] {
            for firstWithChildren in 0...3 {
                for firstWithAction in 0...3 {
                    for fails in [false, true] {
                        var trace: [String] = []
                        let hasMatch = role == .menuItem && firstWithAction < firstWithChildren
                        do {
                            try dispatchUIElementAction(.press, role: role,
                                parentChain: { trace.append("parents"); return [0, 1, 2] },
                                childrenAreEmpty: { trace.append("children:\($0)"); return $0 < firstWithChildren },
                                actions: { trace.append("actions:\($0)"); return $0 >= firstWithAction ? [.press] : [] },
                                performAncestor: { parent, action in
                                    precondition(parent == firstWithAction && action == .press)
                                    trace.append("ancestor:\(parent)")
                                    if fails { throw Failure.ancestor }
                                }, toggleDisclosure: { fatalError("press is not disclosure") },
                                scrollUsingScrollBar: { _ in fatalError("press is not scroll") },
                                performAXAction: { precondition($0 == .press); trace.append("target") })
                            precondition(!(hasMatch && fails))
                        } catch Failure.ancestor { precondition(hasMatch && fails) }
                        var expected: [String] = []
                        if role == .menuItem {
                            expected.append("parents")
                            for i in 0..<min(firstWithChildren + 1, 3) { expected.append("children:\(i)") }
                            for i in 0..<min(firstWithAction + 1, firstWithChildren) { expected.append("actions:\(i)") }
                            if hasMatch { expected.append("ancestor:\(firstWithAction)") }
                        }
                        if !(hasMatch && fails) { expected.append("target") }
                        precondition(trace == expected)
                    }
                }
            }
        }
        // A parent with visible children ends the prefix, including iteration.
        // Ancestor preparation must also precede special target dispatch paths.
        for action in [UIElementAction.expand, .collapse, .scrollDownByPage] {
            var trace: [String] = []
            try dispatchUIElementAction(action, role: .menuItem,
                parentChain: {
                    var next = 0
                    return AnySequence<Int> {
                        AnyIterator {
                            precondition(next < 2, "must not consume beyond prefix boundary")
                            defer { next += 1 }
                            trace.append("next:\(next)")
                            return next
                        }
                    }
                }, childrenAreEmpty: { trace.append("children:\($0)"); return $0 == 0 },
                actions: { _ in trace.append("actions"); return [action] },
                performAncestor: { _, received in
                    precondition(received == action); trace.append("ancestor")
                }, toggleDisclosure: { trace.append("disclosure") },
                scrollUsingScrollBar: { direction in
                    precondition(direction == .down); trace.append("scroll"); return true
                }, performAXAction: { _ in fatalError("handled special action must not fall back") })
            precondition(trace == ["next:0", "children:0", "next:1", "children:1", "actions", "ancestor",
                action == .scrollDownByPage ? "scroll" : "disclosure"])
        }
        print("native menu preparation preserves prefix ordering, first match and error stop: 64 cases")
    }
}
