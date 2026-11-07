import Foundation

// Stored value layout from descriptor 0x1012c9c80. Construction of the original
// bidirectional lookup table is separate; no inferred IDs or paths are inserted.
struct UIElementTreeTable<Identity: Hashable, Value: Hashable> {
    var values: [Identity: Value]
    var elements: [Value: Identity]
    var paths: [Value: IndexPath]
}

// Descriptor 0x1012c9b14 and constructor 0x10064fc24. This restores the tree
// owner; transformations, lookup-table construction and rendering are separate.
struct UIElementTree<Element: AccessibilityNode>: Sequence {
    struct Item {
        var element: Element
        var subtree: UIElementTree<Element>
        var availableSubset: AXArraySubsetDescriptor?

        init(element: Element, subtree: UIElementTree<Element>, availableSubset: AXArraySubsetDescriptor? = nil) {
            self.element = element
            self.subtree = subtree
            self.availableSubset = availableSubset
        }
        var children: [Item] { subtree.items }
        var availableSubsetDescription: String? { uiElementAvailableSubsetDescription(availableSubset) }
    }

    var items: [Item] {
        didSet {
            // Setter/normal _modify completion -> 0x10064fac4. Retain capacity,
            // clear both predicate caches and the derived identity/path table.
            descendantProperties.removeAll(keepingCapacity: true)
            leafProperties.removeAll(keepingCapacity: true)
            cachedTable = nil
        }
    }
    private(set) var focusedElement: Element?
    private var descendantProperties: [KeyPath<Element, Bool> & Sendable: Bool] = [:]
    private var leafProperties: [KeyPath<Element, Bool> & Sendable: Bool] = [:]
    private var cachedTable: UIElementTreeTable<Element.ID, Int>?

    init(items: [Item], focusedElement: Element?) {
        self.items = items
        self.focusedElement = focusedElement
    }
    init(items: Item..., focusedElement: Element?) {
        self.init(items: items, focusedElement: focusedElement)
    }

    // 0x100650d50: cached predicate lookup, then parent-before-child checks.
    // Mutating a child's cache writes back through items and invalidates this
    // tree's derived caches, matching the native modify-completion call.
    mutating func hasDescendant(where property: KeyPath<Element, Bool> & Sendable) -> Bool {
        if let cached = descendantProperties[property] { return cached }
        var found = false
        for index in items.indices {
            if items[index].element[keyPath: property] || items[index].subtree.hasDescendant(where: property) {
                found = true
                break
            }
        }
        descendantProperties[property] = found
        return found
    }

    // 0x100650ff4: only nodes with an empty stored subtree are candidates.
    // availableSubset is deliberately not consulted by this original predicate.
    mutating func hasLeafDescendant(where property: KeyPath<Element, Bool> & Sendable) -> Bool {
        if let cached = leafProperties[property] { return cached }
        var found = false
        for index in items.indices {
            if items[index].subtree.items.isEmpty && items[index].element[keyPath: property] {
                found = true
                break
            }
            if items[index].subtree.hasLeafDescendant(where: property) {
                found = true
                break
            }
        }
        leafProperties[property] = found
        return found
    }

    // Native Iterator is a class (descriptor 0x1012c9b8c), eagerly populated by
    // pre-order enumeration at construction. Aliases share a cursor; each call
    // to makeIterator creates an independent snapshot. No identity deduplication.
    final class Iterator: IteratorProtocol {
        private var elements: [Element] = []
        private var currentIndex: Int = 0

        fileprivate init(tree: UIElementTree<Element>) {
            func append(_ tree: UIElementTree<Element>) {
                for item in tree.items {
                    elements.append(item.element)
                    append(item.subtree)
                }
            }
            append(tree)
        }
        func next() -> Element? {
            guard currentIndex < elements.count else { return nil }
            let element = elements[currentIndex]
            currentIndex += 1
            return element
        }
    }
    func makeIterator() -> Iterator { Iterator(tree: self) }
}
