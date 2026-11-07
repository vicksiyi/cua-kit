import Foundation

struct MissingRenderSourcePathError: Error {}

// Revision constructor callback 0x1006554c0. Display IDs are independent from
// source-tree traversal offsets. A focus render can reuse an existing identity.
func resolveRevisionRenderIdentity<Identity: Hashable>(
    _ node: UIElementRender<Identity>,
    identities: inout [Identity: Int],
    nextID: inout UIElementRenderTree<Identity>.NextAvailableElementIDIterator
) throws -> (identity: Identity, elementID: Int, sourcePath: IndexPath) {
    // Native validates the source path before allocating or mutating any ID.
    guard let path = node.sourcePath else { throw MissingRenderSourcePathError() }
    let id: Int
    if let existing = node.elementID { id = existing }
    else if let known = identities[node.id] { id = known }
    else { id = nextID.next() }
    node.elementID = id
    identities[node.id] = id
    return (node.id, id, path)
}
