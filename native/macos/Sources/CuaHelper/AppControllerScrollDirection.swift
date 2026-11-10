import CoreGraphics

// Native direction tags0/1/2/3: up/down/left/right (raw getter0x100082d2c).
enum AppControllerScrollDirection: String {
    case up, down, left, right

    // Shared arithmetic at 0x100161100, 0x1001613ac and 0x100161660.
    // The caller still owns selection of the size; do not standardize a CGRect
    // or substitute screen dimensions here. The ordered comparison preserves
    // the native FCSEL behavior for NaN as well as negative dimensions.
    func pageExtent(size: CGSize) -> Double {
        let dimension: Double
        switch self {
        case .up, .down: dimension = Double(size.height)
        case .left, .right: dimension = Double(size.width)
        }
        return dimension <= 100 ? 100 : dimension
    }

    // IPC scroll helper0x100165bcc: round product away from zero at ties,
    // convert to Int, then map axes/signs. Extent selection is a caller step.
    func deltas(pages: Double, pageExtent: Double) -> (x: Int, y: Int) {
        let amount = Int((pages * pageExtent).rounded(.toNearestOrAwayFromZero))
        switch self {
        case .up: return (0, amount)
        case .down: return (0, -amount)
        case .left: return (-amount, 0)
        case .right: return (amount, 0)
        }
    }
}
