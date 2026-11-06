import CoreGraphics

@main struct UIElementClippingFrameTests {
    struct Node { let role: UIElementRole; let frame: CGRect?; let scroll: Bool }
    static func main() {
        let wide = CGRect(x: 0, y: 0, width: 100, height: 100)
        let narrow = CGRect(x: 10, y: 20, width: 50, height: 60)
        func run(_ nodes: [Node], expected: CGRect?, visited: Int) {
            for fresh in [false, true] {
                var reads: [Int] = []
                let result = uiElementClippingFrame(of: 0, uncached: fresh,
                    role: { nodes[$0].role }, frameAttribute: { i, uncached in
                        precondition(uncached == fresh); reads.append(i); return nodes[i].frame
                    }, hasScrollAction: { nodes[$0].scroll }, parent: { i, uncached in
                        precondition(uncached == fresh); return i + 1 < nodes.count ? i + 1 : nil
                    })
                precondition(result == expected)
                precondition(reads.count == visited)
            }
        }
        run([Node(role: .button, frame: narrow, scroll: false), Node(role: .window, frame: wide, scroll: false)], expected: wide, visited: 2)
        run([Node(role: .scrollArea, frame: narrow, scroll: false), Node(role: .window, frame: wide, scroll: false)], expected: narrow, visited: 2)
        run([Node(role: .group, frame: narrow, scroll: true), Node(role: .window, frame: wide, scroll: false)], expected: narrow, visited: 2)
        run([Node(role: .group, frame: narrow, scroll: false), Node(role: .window, frame: wide, scroll: false)], expected: wide, visited: 2)
        run([Node(role: .button, frame: wide, scroll: false)], expected: nil, visited: 1)
        run([Node(role: .application, frame: nil, scroll: false)], expected: nil, visited: 0)
        run([Node(role: .button, frame: nil, scroll: false), Node(role: .window, frame: wide, scroll: false)], expected: nil, visited: 1)
        run([Node(role: .scrollArea, frame: .zero, scroll: false)], expected: nil, visited: 1)
        run([Node(role: .window, frame: .infinite, scroll: false)], expected: nil, visited: 1)
        for boundary in [UIElementRole.window, .sheet, .menu, .popover] {
            run([Node(role: boundary, frame: narrow, scroll: false), Node(role: .window, frame: .zero, scroll: false)], expected: narrow, visited: 1)
        }
        var roleReads = 0
        precondition(uiElementClipsChildren(role: { roleReads += 1; return .scrollArea }, hasScrollAction: { fatalError() }))
        precondition(roleReads == 1)
        // Preserve repeated queries: changing roles can match a later branch.
        var values: [UIElementRole] = [.button, .sheet]
        precondition(uiElementIsClippingBoundary(role: { values.removeFirst() }))
        print("clipping preserves role boundaries, intersection, missing frames and fresh parent reads")
    }
}
