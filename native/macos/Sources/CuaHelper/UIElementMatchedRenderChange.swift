import DequeModule

extension UIElementRenderDifference {
    typealias Cursor = UIElementTraversalCursor<UIElementRender<Identity>>
    typealias PendingChildren = (old: [Cursor], new: [Cursor])

    // 0x1006409e4: matched siblings queue their child lists for later processing,
    // even if only one side has children. Classification compares text only.
    static func matchedChange(offset: Int, new: Cursor, old: Cursor,
        pending: inout Deque<PendingChildren>
    ) -> Change {
        if !old.item.children.isEmpty || !new.item.children.isEmpty {
            pending.append((old: old.childCursors(), new: new.childCursors()))
        }
        return old.item.text == new.item.text
            ? .none(offset: offset, new: new, old: old)
            : .update(offset: offset, new: new, old: old)
    }
}
