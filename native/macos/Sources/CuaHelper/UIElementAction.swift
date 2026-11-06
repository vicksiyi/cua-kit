import Foundation

// Original descriptor 0x1012cd3b4: one immutable Swift.String field `name`.
// These two mutable statics are SAI synthetic actions, not AXExpand/AXCollapse.
struct UIElementAction: Hashable {
    let name: String
    init(_ name: String) { self.name = name }

    static var expand = UIElementAction("SAIExpand")
    static var collapse = UIElementAction("SAICollapse")
}
