import CoreGraphics

// Readable reconstruction of the three-case native scroll plan record.
enum UIElementScrollOperation<Element> {
    case action(Element)
    case attribute(Element)
    case frame(Element)
}

// Native ancestor collection0x10079f410..0x10079f97c. Plans are inserted
// at index0 (native array splice0x1007a3880), so outer containers run first.
func collectUIElementScrollOperations<Element>(from element: Element,
    isBoundary: (Element) -> Bool, hasScrollAction: (Element) -> Bool,
    isCell: (Element) -> Bool, isScrollAttributeSettable: (Element) -> Bool,
    isScrollArea: (Element) -> Bool, clipsChildren: (Element) -> Bool, parent: (Element) -> Element?
) -> [UIElementScrollOperation<Element>] {
    var operations: [UIElementScrollOperation<Element>] = []
    var current: Element? = element
    var alreadyRequested = false
    while let element = current {
        if isBoundary(element) { break }
        if !alreadyRequested {
            if hasScrollAction(element) {
                operations.insert(.action(element), at: 0)
                alreadyRequested = true
            } else if isCell(element), isScrollAttributeSettable(element) {
                operations.insert(.attribute(element), at: 0)
                alreadyRequested = true
            }
        }
        if isScrollArea(element) { operations.insert(.frame(element), at: 0) }
        // Source calls the shared clipping-container predicate, which also
        // includes groups with page-scroll actions, then reads parent.
        let clippingContainer = clipsChildren(element)
        current = parent(element)
        alreadyRequested = alreadyRequested && !clippingContainer
    }
    return operations
}

// Native execution0x10079f97c..0x10079fd84. Action/attribute success means a
// request was sent; frame helper's Bool is accumulated without short-circuit.
// The final geometry poll is best-effort, but operation errors propagate.
func executeUIElementScrollOperations<Element>(_ operations: [UIElementScrollOperation<Element>],
    frame: CGRect, performAction: (Element) throws -> Void,
    setScrollAttribute: (Element) throws -> Void,
    scrollFrame: (Element, CGRect) throws -> Bool,
    pollForGeometryChange: () throws -> Void
) throws -> Bool {
    var requested = false
    for operation in operations {
        switch operation {
        case .action(let element):
            try performAction(element)
            requested = true
        case .attribute(let element):
            try setScrollAttribute(element)
            requested = true
        case .frame(let element):
            let changed = try scrollFrame(element, frame)
            requested = changed || requested
        }
    }
    if requested { try? pollForGeometryChange() }
    return requested
}
