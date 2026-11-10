import Foundation
import ApplicationServices
struct Node { let element: AXUIElement; let data: [String: Any] }
@main struct Check {
 static func main() {
  let parent = AXUIElementCreateApplication(111), target = AXUIElementCreateApplication(112), sibling = AXUIElementCreateApplication(113)
  func node(_ element: AXUIElement, _ id: Int, _ parentID: Int? = nil, _ name: String = "stable", _ x: Int = 10) -> Node {
   var data: [String: Any] = ["id": id, "role": "AXButton", "name": name, "frame": ["x": x, "y": 10], "properties": ["AXEnabled": true, "AXFocused": false]]
   data["parentId"] = parentID
   return Node(element: element, data: data)
  }
  let old = [node(parent,0),node(target,1,0),node(sibling,2,0)]
  let dynamic = [node(parent,10),node(target,11,10),node(sibling,12,10,"changed"),node(AXUIElementCreateApplication(114),13,10)]
  precondition(inputTargetSnapshotEqual(old,dynamic,targetID:1,allowingFocusChange:false))
  precondition(!inputTargetSnapshotEqual(old,[node(parent,0),node(target,1,0,"different")],targetID:1,allowingFocusChange:false))
  precondition(!inputTargetSnapshotEqual(old,[node(parent,0),node(target,1,0,"stable",20)],targetID:1,allowingFocusChange:false))
  precondition(!inputTargetSnapshotEqual(old,[node(parent,0),node(sibling,1,0)],targetID:1,allowingFocusChange:false))
  precondition(!inputTargetSnapshotEqual(old,[node(parent,0),node(target,1)],targetID:1,allowingFocusChange:false))
  precondition(!inputTargetSnapshotEqual(old,[node(parent,0,nil,"stable",20),node(target,1,0)],targetID:1,allowingFocusChange:false))
  print("Target snapshot dynamic-sibling and stale-target checks passed")
 }
}
