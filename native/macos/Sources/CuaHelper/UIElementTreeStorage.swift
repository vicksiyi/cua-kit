import Foundation

// Stored value layout from descriptor 0x1012c9c80. The initializer preserves
// supplied paths and derives only the reverse mapping from supplied values.
struct UIElementTreeTable<Identity: Hashable, Value: Hashable> {
    var values: [Identity: Value]
    var elements: [Value: Identity]
    var paths: [Value: IndexPath]

    // 0x1006569b4: reverse the final forward dictionary by ordinary assignment.
    // Duplicate values overwrite in dictionary iteration order; no uniqueness trap.
    init(values: [Identity: Value], paths: [Value: IndexPath]) {
        self.values = values
        self.paths = paths
        self.elements = [:]
        for (identity, value) in values { elements[value] = identity }
    }
    subscript(identity identity: Identity) -> Value? { values[identity] }
    subscript(value value: Value) -> Identity? { elements[value] }
    func path(to value: Value) -> IndexPath? { paths[value] }
}

// Descriptor 0x1012c9b14 and constructor 0x10064fc24. This restores the tree
// owner and lookup cache; transformations and rendering remain separate.
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

    // 0x10064ff84 + enumeration callback 0x1006503fc. IDs start at zero
    // and advance for every stored item, including repeated identities.
    mutating func table() -> UIElementTreeTable<Element.ID, Int> {
        if let cachedTable { return cachedTable }
        var values: [Element.ID: Int] = [:]
        var paths: [Int: IndexPath] = [:]
        var nextID = 0
        func visit(_ tree: UIElementTree<Element>, path: IndexPath) {
            for (index, item) in tree.items.enumerated() {
                let itemPath = path.appending(index)
                values[item.element.id] = nextID
                paths[nextID] = itemPath
                nextID += 1
                visit(item.subtree, path: itemPath)
            }
        }
        visit(self, path: IndexPath())
        let result = UIElementTreeTable(values: values, paths: paths)
        cachedTable = result
        return result
    }
    mutating func id(for identity: Element.ID) -> Int? { table()[identity: identity] }
    mutating func item(for id: Int) -> Item? {
        guard let path = table().path(to: id) else { return nil }
        return item(for: path)
    }
    mutating func element(for id: Int) -> Element? { item(for: id)?.element }
    // 0x100650908: a missing identity clears the previous focused element.
    @discardableResult
    mutating func setFocusedElement(identity: Element.ID) -> Element? {
        if let id = id(for: identity) { focusedElement = element(for: id) }
        else { focusedElement = nil }
        return focusedElement
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
