import AccessibilitySupport
import CoreGraphics
import SystemSoftware

@main struct Check {
    static func main() throws {
        let start = CGPoint(x: -400, y: 90), end = CGPoint(x: -200, y: 190)
        let midpoint = CGPoint(x: -300, y: 140)
        let bounds = CGRect(x: -500, y: 40, width: 600, height: 400)
        let buttons: [(CGMouseButton, CGEventType, CGEventType, CGEventType)] = [
            (CGMouseButton.left, CGEventType.leftMouseDown, .leftMouseDragged, .leftMouseUp),
            (.right, .rightMouseDown, .rightMouseDragged, .rightMouseUp),
            (.center, .otherMouseDown, .otherMouseDragged, .otherMouseUp)
        ]
        for (button, down, drag, up) in buttons {
            for count in [1, 2, 12] {
                for destination: CGPoint? in [nil, end] {
                    let before = SynthesizedEvent.nextEventNumber
                    let value = try SynthesizedEvent.click(at: start, andDragTo: destination,
                        mouseButton: button, count: count, flags: .maskShift,
                        inWindow: 123, windowBounds: bounds, windowUsesFlippedCoordinates: false)
                    let stride = destination == nil ? 2 : 5
                    precondition(value.cgEvents.count == count * stride)
                    for index in 0..<count {
                        let group = Array(value.cgEvents[(index * stride)..<((index + 1) * stride)])
                        precondition(group.map { $0.type } == (destination == nil ? [down, up] : [down, drag, drag, drag, up]))
                        precondition(group.map { $0.location } == (destination == nil ? [start, start] : [start, start, midpoint, end, end]))
                        precondition(group.map { $0.getIntegerValueField(.mouseEventClickState) } == (destination == nil
                            ? [Int64(index + 1), Int64(index + 1)] : [Int64(index + 1), 0, 0, 0, Int64(index + 1)]))
                        let number = before + 1 + Int64(index * (destination == nil ? 1 : 2))
                        precondition(group.map { $0.getIntegerValueField(.mouseEventNumber) } == (destination == nil
                            ? [number, number] : [number, number + 1, number + 1, number + 1, number]))
                        precondition(group.allSatisfy { $0.flags == .maskShift && $0.getIntegerValueField(.mouseEventWindowUnderMousePointer) == 123 })
                    }
                    precondition(SynthesizedEvent.nextEventNumber == before + 1 + Int64(count * (destination == nil ? 1 : 2)))
                }
            }
        }
        for count in [-1, 0] {
            do {
                _ = try SynthesizedEvent.click(at: start, andDragTo: nil, mouseButton: .left,
                    count: count, flags: [], inWindow: nil, windowBounds: nil, windowUsesFlippedCoordinates: false)
                preconditionFailure("invalid click count accepted")
            } catch SynthesizedEvent.Error.invalidParameter {}
        }
        print("Original click/drag factory count, five-event geometry and numbering checks passed; no event posting")
    }
}
