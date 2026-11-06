import Foundation

// Original descriptor 0x1012cd3b4: one immutable Swift.String field `name`.
// Mutable statics match the original action storage; expand/collapse are SAI actions.
struct UIElementAction: Hashable {
    let name: String
    init(_ name: String) { self.name = name }

    static var press = UIElementAction("AXPress")
    static var pick = UIElementAction("AXPick")
    static var increment = UIElementAction("AXIncrement")
    static var decrement = UIElementAction("AXDecrement")
    static var confirm = UIElementAction("AXConfirm")
    static var cancel = UIElementAction("AXCancel")
    static var showDefaultUI = UIElementAction("AXShowDefaultUI")
    static var showAlternateUI = UIElementAction("AXShowAlternateUI")
    static var raise = UIElementAction("AXRaise")
    static var showMenu = UIElementAction("AXShowMenu")
    static var scrollToVisible = UIElementAction("AXScrollToVisible")
    static var scrollLeftByPage = UIElementAction("AXScrollLeftByPage")
    static var scrollRightByPage = UIElementAction("AXScrollRightByPage")
    static var scrollUpByPage = UIElementAction("AXScrollUpByPage")
    static var scrollDownByPage = UIElementAction("AXScrollDownByPage")
    static var delete = UIElementAction("AXDelete")
    static var expand = UIElementAction("SAIExpand")
    static var collapse = UIElementAction("SAICollapse")
}
