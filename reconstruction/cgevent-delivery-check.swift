import Darwin
import CoreGraphics
import SystemSoftware

@main struct Check {
    static func main() {
        setbuf(stdout, nil)
        print("Begin injected dispatch check")
        let event = CGEventAPI.create(source: nil)!
        var order: [String] = []
        dispatchNativeEvent(event, to: 4321, timestamp: { order.append("timestamp"); return 987654321 },
            post: { sent, pid in
                order.append("post")
                precondition(sent === event && pid == 4321)
                precondition(CGEventAPI.getTimestamp(sent) == 987654321)
            })
        precondition(order == ["timestamp", "post"])
        // Read state only; do not create a tap or post any event.
        print("Injected dispatch passed; begin source-state reads")
        for state: CGEventSourceStateID in [.combinedSessionState, .hidSystemState] {
            print("Reading source state \(state.rawValue)")
            let flags = CGEventAPI.sourceFlagsState(state)
            print("CGEvent source state \(state.rawValue) flags=\(flags.rawValue)")
        }
        print("CGEvent delivery/tap signatures typechecked; source flags read; no tap creation or event posting")
    }
}

// Compiled only. These functions must never be invoked by this fixture.
func checkDeliverySignatures(_ event: CGEvent, _ port: CFMachPort, _ callback: CGEventTapCallBack) {
    CGEventAPI.post(event, tap: .cghidEventTap)
    CGEventAPI.postToPid(event, pid: 123)
    let _: CFMachPort? = CGEventAPI.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
        options: .listenOnly, eventsOfInterest: 1, callback: callback, userInfo: nil)
    let _: CFMachPort? = CGEventAPI.tapCreateForPid(pid: 123, place: .tailAppendEventTap,
        options: .defaultTap, eventsOfInterest: UInt64.max, callback: callback, userInfo: nil)
    CGEventAPI.tapEnable(tap: port, enable: false)
    let _: Bool = CGEventAPI.tapIsEnabled(tap: port)
}
