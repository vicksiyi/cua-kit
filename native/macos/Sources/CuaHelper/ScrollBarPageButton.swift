// ScrollBarUIElement.incrementPageButton / decrementPageButton select the first
// matching AXChildren element, keeping its existing AX reference and cache.
// Original entries: 0x1007277a4 and 0x100727cb0. Children decoding and the
// ScrollBarUIElement protocol wrapper are separate, not replaced by this helper.
enum ScrollBarPageButton {
    case increment, decrement

    var subrole: String {
        switch self {
        case .increment: return "AXIncrementPage"
        case .decrement: return "AXDecrementPage"
        }
    }

    func find(in children: [UIElement]) -> UIElement? {
        children.first { $0.role == .button && $0.subrole == subrole }
    }
}
