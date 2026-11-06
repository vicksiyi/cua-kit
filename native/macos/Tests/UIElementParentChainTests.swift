@main
struct UIElementParentChainTests {
    static func main() {
        for includes in [false, true] {
            for maximum in [-1, 0, 1, 2, 3, 300] {
                var reads: [Int] = []
                let chain = uiElementParentChain(of: 0, maxDepth: maximum, includingSelf: includes) {
                    reads.append($0); return $0 == 3 ? nil : $0 + 1
                }
                precondition(reads == (includes ? [] : [0]))
                let result = Array(chain)
                let expected = (0...3).filter { $0 <= maximum && (includes || $0 > 0) }
                precondition(result == expected)
                precondition(reads == (includes ? [] : [0]) + expected)
            }
        }
        // Cycles are bounded by depth, not identity; default excludes 0 and
        // yields exactly depths 1...300, reading the next parent before yield.
        var reads = 0
        let cycle = uiElementParentChain(of: 7, includingSelf: false) { node in reads += 1; return node }
        precondition(reads == 1)
        precondition(Array(cycle).count == 300 && reads == 301)
        // Early consumer stop performs only the eager lookup plus one lookahead.
        var trace: [Int] = []
        let partial = uiElementParentChain(of: 0, includingSelf: false) { trace.append($0); return $0 + 1 }
        var iterator = partial.makeIterator()
        precondition(iterator.next() == 1 && trace == [0, 1])
        print("native parent chain preserves eager seed, inclusive depth, lookahead and cycle bound")
    }
}
