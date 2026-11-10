// Native helper0x10022ee20..0x10022f734 first reconstructs the same concrete
// element from its AX reference. Only a comparison miss triggers tree work.
// Error names below describe branches; original wire/error mapping is separate.
enum ElementRefreshLookupFailure {
    case previousMatchNotUnique(Int)
    case noRefreshedMatch
    case refreshedMatchNotUnique(Int)
}

func recoverRefetchableElement<Element, Selection, Candidate, Result>(
    _ previous: Element, ignoreValueChange: Bool,
    reconstruct: (Element) -> Element,
    matches: (Element, Element, Bool) -> Bool,
    currentSelection: () -> Selection,
    matchingElements: (Selection, Element, Bool) -> [Candidate],
    refetchTree: () throws -> Selection,
    lookupError: (ElementRefreshLookupFailure) -> any Error = nativeElementRefreshLookupError,
    wrapFresh: (Element) -> Result,
    wrapCandidate: (Candidate) -> Result
) throws -> Result {
    let fresh = reconstruct(previous)
    if matches(previous, fresh, ignoreValueChange) { return wrapFresh(fresh) }
    // Old observation must uniquely identify the original target, even when
    // the caller permits value changes in the new observation.
    let oldMatches = matchingElements(currentSelection(), previous, false)
    guard oldMatches.count == 1 else {
        throw lookupError(.previousMatchNotUnique(oldMatches.count))
    }
    let selection = try refetchTree()
    let candidates = matchingElements(selection, previous, ignoreValueChange)
    guard !candidates.isEmpty else { throw lookupError(.noRefreshedMatch) }
    guard candidates.count == 1 else {
        throw lookupError(.refreshedMatchNotUnique(candidates.count))
    }
    return wrapCandidate(candidates[0])
}

extension SystemSelection {
    // Native0x100230190 iterates the full windowRevision.tree (field offset
    // supplied by revision metadata at0x68), retaining every match in order.
    // It does not restrict to the focus tree, stop at the first hit or use IDs.
    func elementsMatching(_ previous: any UIElementProtocol,
        ignoreValueChange: Bool) -> [TransformedUIElement] {
        windowRevision.tree.filter {
            refetchableElementMatches(previous, candidate: $0, ignoreValueChange: ignoreValueChange)
        }
    }
}


// Single-payload enum empty-case tags at0x10022f4c0/0x10022f5c0/
//0x10022f684 map to reflection field order (payload case excluded).
func nativeElementRefreshLookupError(_ failure: ElementRefreshLookupFailure) -> any Error {
    switch failure {
    case .previousMatchNotUnique: return RefetchableSkyshotAXTree.Error.elementAmbiguousBeforeRefetch
    case .noRefreshedMatch: return RefetchableSkyshotAXTree.Error.elementNoLongerValidAfterRefetch
    case .refreshedMatchNotUnique: return RefetchableSkyshotAXTree.Error.elementAmbiguousAfterRefetch
    }
}

extension RefetchableSkyshotAXTree {
    // Concrete composition of helper0x10022ee20. Reconstruction uses the
    // dynamic UIElementProtocol initializer, retaining the original element's
    // concrete type rather than replacing every node with a plain UIElement.
    // The complete extraction body remains explicit; publication is owned here.
    func recoverElement(_ previous: any UIElementProtocol, ignoreValueChange: Bool,
        extractSelection: () throws -> SystemSelection
    ) throws -> RefetchableUIElement {
        try recoverRefetchableElement(previous, ignoreValueChange: ignoreValueChange,
            reconstruct: { type(of: $0).init(element: $0.axElement) },
            matches: { refetchableElementMatches($0, candidate: $1, ignoreValueChange: $2) },
            currentSelection: { self.systemSelection },
            matchingElements: { $0.elementsMatching($1, ignoreValueChange: $2) },
            refetchTree: { try self.refetchTree(extract: extractSelection) },
            wrapFresh: { RefetchableUIElement(element: $0, containingTree: self) },
            wrapCandidate: { RefetchableUIElement(element: $0, containingTree: self) })
    }
}
