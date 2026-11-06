import Foundation

@main struct UIElementClickSelectionTests {
    static func main() {
        // Exhaustive role/capability matrix verifies precedence and lazy reads.
        for application in [false, true] {
            for selectable in [false, true] {
                for selectionAttributes in [false, true] {
                    var calls: [String] = []
                    let result = uiElementClickingMayCauseSelection(0,
                        parent: { _ in calls.append("parent"); return nil },
                        role: { _ in calls.append("role"); return application ? .application : .button },
                        isSelectable: { _ in calls.append("selectable"); return selectable },
                        hasSupportedSelectionAttributes: { _ in calls.append("attributes"); return selectionAttributes })
                    precondition(result == (!application && (selectable || selectionAttributes)))
                    var expected = ["parent", "role"]
                    if !application { expected.append("selectable") }
                    if !application && !selectable { expected.append("attributes") }
                    precondition(calls == expected)
                }
            }
        }
        // A selectable ancestor matters; an application boundary stops traversal
        // even when a later ancestor would qualify. Parent lookahead is retained.
        for boundary in [false, true] {
            var visited: [Int] = []
            let result = uiElementClickingMayCauseSelection(0,
                parent: { $0 < 3 ? $0 + 1 : nil },
                role: { visited.append($0); return boundary && $0 == 1 ? .application : .button },
                isSelectable: { $0 == 2 },
                hasSupportedSelectionAttributes: { _ in false })
            precondition(result == !boundary)
            precondition(visited == (boundary ? [0, 1] : [0, 1, 2]))
        }
        // Original inclusive depth 300: no visited-set/cycle shortcut.
        for selectedDepth in [300, 301] {
            var parents = 0
            var visits = 0
            let result = uiElementClickingMayCauseSelection(0,
                parent: { parents += 1; return $0 + 1 },
                role: { _ in visits += 1; return .button },
                isSelectable: { $0 == selectedDepth },
                hasSupportedSelectionAttributes: { _ in false })
            precondition(result == (selectedDepth == 300))
            precondition(parents == 301 && visits == 301)
        }
        print("click selection ancestry, application boundary, lazy queries and depth passed")
    }
}
