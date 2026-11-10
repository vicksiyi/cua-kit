// Source0x1007a546c expands an inclusive visible span toward a requested
// minimum count. Start on the left, alternate sides, and use the other side
// when a collection boundary prevents that turn. Never shrink an existing span.
func expandUIElementVisibleRange(_ range: ClosedRange<Int>, minimumCount: Int,
    totalCount: Int) -> ClosedRange<Int> {
    guard minimumCount > 0, range.count < minimumCount, totalCount > 0 else { return range }
    var lower = range.lowerBound
    var upper = range.upperBound
    var remaining = minimumCount - range.count
    var rightTurn = false
    while remaining > 0 && (lower != 0 || upper != totalCount - 1) {
        if lower != 0 && (!rightTurn || upper == totalCount - 1) {
            lower -= 1
        } else {
            upper += 1
        }
        remaining -= 1
        rightTurn.toggle()
    }
    return lower...upper
}
