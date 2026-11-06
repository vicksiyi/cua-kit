import CoreGraphics

@main struct UIElementChessClickPointTests {
    enum Failure: Error { case hit }
    static func main() {
        for file in "abcdefgh" { for rank in "12345678" {
            precondition(uiElementHasChessSquareTitle("White piece \(file)\(rank)"))
        } }
        for title: String? in [nil, "", "a", "A1", "a9", "a1 ", "a1piece", "棋子a１", "a\u{301}1"] {
            precondition(!uiElementHasChessSquareTitle(title))
        }
        precondition(uiElementHasChessSquareTitle("♟a1"))
        let frame = CGRect(x: 200, y: 200, width: 10, height: 10)
        let parent = CGRect(x: 10, y: 20, width: 64, height: 64)
        var calls = 0
        let point = uiElementChessClickPoint(role: { .button }, title: { "piece a1" },
            bundleIdentifier: { "com.apple.Chess" }, resolveApp: { _ in 1 }, elementFrame: { frame },
            hitTest: { _, p -> Int? in
                calls += 1
                if calls == 1 { return 0 }
                let index = calls - 2
                precondition(p == CGPoint(x: 10.5 + Double(index % 64), y: 20.5 + Double(index / 64)))
                if index == 2 { throw Failure.hit }
                return index == 0 || index == 65 ? 1 : nil
            }, matchesTarget: { $0 == 1 }, parentFrame: { parent })
        precondition(calls == 4097 && point == CGPoint(x: 11, y: 21))
        // Gate must precede lookup and expensive hit testing.
        let gated: CGPoint? = uiElementChessClickPoint(role: { .button }, title: { "a1" },
            bundleIdentifier: { "com.apple.Chess.extra" }, resolveApp: { _ -> Int? in fatalError() },
            elementFrame: { fatalError() }, hitTest: { _, _ -> Int? in fatalError() },
            matchesTarget: { _ in fatalError() }, parentFrame: { fatalError() })
        precondition(gated == nil)
        for initial: Int? in [nil, 1] {
            let result = uiElementChessClickPoint(role: { .button }, title: { "a1" },
                bundleIdentifier: { "com.apple.Chess" }, resolveApp: { _ in 1 }, elementFrame: { frame },
                hitTest: { _, _ in initial }, matchesTarget: { $0 == 1 }, parentFrame: { fatalError() })
            precondition(result == nil)
        }
        print("Chess preferred point preserves suffix gate, exact app and 64x64 hit averaging")
    }
}
