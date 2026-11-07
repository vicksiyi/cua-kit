import ApplicationServices
import os

extension TransformedUIElement {
    // Specialized UIElementProtocol witness 0x1007925e0 -> 0x10073440c.
    // Self role/disclosure flags come from the transformed snapshot. Parent
    // and scrollbar objects use the shared underlying identity/cache readers.
    func perform(action: UIElementAction) throws {
        func report(_ error: Error) {
            NativeLogger.logger(for: Self.self).error("log[baa09d44b6c8dd36e77f] [0]=\(error as NSError)")
        }
        try dispatchUIElementAction(action, role: role,
            parentChain: { element.parentChain(includingSelf: false, reportError: report) },
            childrenAreEmpty: { $0.childrenPreferringVisible(reportError: report).isEmpty },
            actions: { $0.actions },
            performAncestor: { try $0.perform(action: $1) },
            toggleDisclosure: { try toggleDisclosure() },
            scrollUsingScrollBar: { direction in
                try element.scrollUsingScrollBar(direction: direction,
                    perform: { try $0.perform(action: $1) }, reportError: report)
            }, performAXAction: { try axElement.perform($0) })
    }
}
