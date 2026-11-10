import Foundation

// Native all-storage initializer 0x100090468 uses NSHashTable.weakObjects;
// each concrete owner is added at the end of initialization (0x100091114).
// The eventual ComputerUseCursor owns one shared instance of this boundary.
@MainActor
final class CursorOwnerRegistry<Owner: AnyObject> {
    private let members = NSHashTable<AnyObject>.weakObjects()

    func insert(_ owner: Owner) { members.add(owner) }
    var all: [Owner] { members.allObjects.compactMap { $0 as? Owner } }
}
