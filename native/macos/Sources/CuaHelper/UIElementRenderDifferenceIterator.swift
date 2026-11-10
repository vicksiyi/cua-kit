import Foundation
import DequeModule

extension UIElementRenderDifference {
    // Source0x10063f794 creates one root-pair work item and an empty output
    // deque. next0x10063ccc8 drains output before processing another pair.
    struct Iterator: IteratorProtocol {
        private var pending: Deque<PendingChildren>
        private var output: Deque<Change> = []

        init(old: [Cursor], new: [Cursor]) {
            pending = [(old: old, new: new)]
        }

        mutating func next() -> Change? {
            next(matching: UIElementRenderDifference.matchSiblings)
        }

        mutating func next(matching: (PendingChildren, inout Deque<PendingChildren>) -> [Change]) -> Change? {
            while output.isEmpty {
                guard let pair = pending.popFirst() else { return nil }
                output.append(contentsOf: matching(pair, &pending))
            }
            return output.popFirst()
        }
    }
}


extension UIElementRenderDifference: Sequence {
    func makeIterator() -> Iterator {
        Iterator(old: oldRender.enumerated().map { Cursor(item: $0.element, path: IndexPath(index: $0.offset)) },
            new: newRender.enumerated().map { Cursor(item: $0.element, path: IndexPath(index: $0.offset)) })
    }

    static func matchSiblings(_ pair: PendingChildren, pending: inout Deque<PendingChildren>) -> [Change] {
        let prefix = matchSiblingPrefix(old: pair.old, new: pair.new, pending: &pending)
        var remaining = residualIdentityMap(pair.old.dropFirst(prefix.consumed), offset: prefix.consumed)
        let residualNew = pair.new.dropFirst(prefix.consumed)
        let retained = retainedIdentities(for: residualNew.map { $0.item.id }, old: remaining)
        return prefix.changes + emitResidualMatches(new: residualNew, offset: prefix.consumed,
            retainedIdentities: retained, remaining: &remaining, pending: &pending)
    }
}
