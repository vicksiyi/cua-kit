import CoreGraphics
import SystemSoftware

@main struct Check {
    static func main() {
        for state: CGEventSourceStateID in [.privateState, .combinedSessionState, .hidSystemState] {
            let source = CGEventAPI.sourceCreate(stateID: state)!
            for useSource in [false, true] {
                let selected = useSource ? source : nil
                let event = CGEventAPI.create(source: selected)!
                CGEventAPI.setTimestamp(event, timestamp: 123)
                precondition(CGEventAPI.getTimestamp(event) == 123)
                for down in [false, true] {
                    let key = CGEventAPI.createKeyboardEvent(source: selected, virtualKey: 0, keyDown: down)!
                    precondition(key.type == (down ? .keyDown : .keyUp))
                    precondition(key.getIntegerValueField(.keyboardEventKeycode) == 0)
                }
                let scroll = CGEventAPI.createScrollWheelEvent(source: selected, units: .pixel,
                    wheelCount: 1, wheel1: -5, wheel2: 0, wheel3: 0)!
                precondition(scroll.type == .scrollWheel)
                precondition(scroll.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == -5)
            }
        }
        print("SystemSoftware CGEvent owned source/event/keyboard/scroll construction checks passed; no event posting")
    }
}
