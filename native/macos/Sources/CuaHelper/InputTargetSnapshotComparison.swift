import Foundation
import ApplicationServices

// Host snapshot adapter: unrelated siblings may change without invalidating an
// indexed target. Target contents/geometry and its AX ancestor identity remain
// checked. Coordinate-only input continues to require the full snapshot.
func inputTargetSnapshotEqual(_ previous: [Node], _ current: [Node], targetID: Int,
    allowingFocusChange: Bool
) -> Bool {
    guard let old = previous.first(where: { $0.data["id"] as? Int == targetID }),
          let fresh = current.first(where: { CFEqual($0.element, old.element) }) else { return false }
    func targetData(_ data: [String: Any]) -> [String: Any] {
        var result = data
        result.removeValue(forKey: "id"); result.removeValue(forKey: "parentId")
        return result
    }
    guard inputSnapshotDataEqual(targetData(old.data), targetData(fresh.data),
        allowingFocusChange: allowingFocusChange) else { return false }
    var left = old, right = fresh
    var visited: Set<Int> = []
    while let parentID = left.data["parentId"] as? Int {
        guard visited.insert(parentID).inserted,
              let oldParent = previous.first(where: { $0.data["id"] as? Int == parentID }),
              let newParentID = right.data["parentId"] as? Int,
              let newParent = current.first(where: { $0.data["id"] as? Int == newParentID }),
              CFEqual(oldParent.element, newParent.element) else { return false }
        for key in ["role", "frame"] {
            guard NSDictionary(dictionary: [key: oldParent.data[key] ?? NSNull()])
                .isEqual(to: [key: newParent.data[key] ?? NSNull()]) else { return false }
        }
        let oldEnabled = (oldParent.data["properties"] as? [String: Any])?["AXEnabled"]
        let newEnabled = (newParent.data["properties"] as? [String: Any])?["AXEnabled"]
        guard NSDictionary(dictionary: ["enabled": oldEnabled ?? NSNull()])
            .isEqual(to: ["enabled": newEnabled ?? NSNull()]) else { return false }
        left = oldParent; right = newParent
    }
    return right.data["parentId"] == nil
}
