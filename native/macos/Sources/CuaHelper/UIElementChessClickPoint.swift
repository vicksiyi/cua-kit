import CoreGraphics

// 0x1007a3520: title must end in a lowercase file a...h and rank 1...8.
// Character suffix semantics matter; no trimming/case folding or prefix match.
func uiElementHasChessSquareTitle(_ title: String?) -> Bool {
    guard let title, title.count >= 2 else { return false }
    let suffix = Array(title.suffix(2))
    return Array("abcdefgh").contains(suffix[0]) && Array("12345678").contains(suffix[1])
}

// 0x10079eb20..<0x10079f380, extracted app-specific preferred-point path.
// App lookup, hit-test provider and target equality remain explicit dependencies.
// This is only for com.apple.Chess; it must not become a generic 4096-hit fallback.
func uiElementChessClickPoint<App, Hit>(
    role: () -> UIElementRole,
    title: () -> String?,
    bundleIdentifier: () -> String?,
    resolveApp: (String) -> App?,
    elementFrame: () -> CGRect?,
    hitTest: (App, CGPoint) throws -> Hit?,
    matchesTarget: (Hit) -> Bool,
    parentFrame: () -> CGRect?
) -> CGPoint? {
    guard role() == .button else { return nil }
    guard uiElementHasChessSquareTitle(title()) else { return nil }
    guard bundleIdentifier() == "com.apple.Chess" else { return nil }
    guard let app = resolveApp("com.apple.Chess"), let frame = elementFrame() else { return nil }
    let center = CGPoint(x: frame.midX, y: frame.midY)
    guard let hit = try? hitTest(app, center) else { return nil }
    // If the normal center already hits the target, leave normal processing alone.
    guard !matchesTarget(hit), let parent = parentFrame() else { return nil }
    let dx = parent.width * (1.0 / 64.0)
    let dy = parent.height * (1.0 / 64.0)
    var matches: [CGPoint] = []
    for row in 0..<64 {
        let yOffset = dy * (Double(row) + 0.5)
        for column in 0..<64 {
            let point = CGPoint(x: parent.minX + dx * (Double(column) + 0.5), y: parent.minY + yOffset)
            if let candidate = try? hitTest(app, point), matchesTarget(candidate) { matches.append(point) }
        }
    }
    guard !matches.isEmpty else { return nil }
    var sum = CGPoint.zero
    for point in matches { sum.x += point.x; sum.y += point.y }
    return CGPoint(x: sum.x / Double(matches.count), y: sum.y / Double(matches.count))
}
