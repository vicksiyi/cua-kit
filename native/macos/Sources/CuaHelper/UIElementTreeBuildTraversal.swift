import Foundation

// Recursive builder769a74 checks IndexPath.count <201 before reading AX
// identity/inserting into its shared visited set. Do not use cursor.depth:
// that accessor subtracts one and would shift this boundary.
func beginUIElementTreeVisit<Identity: Hashable>(path: IndexPath,
    identity: () -> Identity, visited: inout Set<Identity>,
    reportDepthLimit: () -> Void) -> Bool {
    guard path.count < 201 else { reportDepthLimit(); return false }
    return visited.insert(identity()).inserted
}

// Native76a06c..76a12c filters original child indices before appending those
// same indices to path. Rejected children do not compact subsequent paths.
func enumerateFilteredTreeChildren<Element>(_ children: [Element], path: IndexPath,
    filter: (Int, Element) -> Bool, visit: (Element, IndexPath) -> Void) {
    for (index, child) in children.enumerated() {
        if filter(index, child) { visit(child, path.appending(index)) }
    }
}
