import AppKit

extension UIElement {
    // Names recovered from field descriptor 0x101323fa4; native tags 0/1/2.
    enum ProcessType: Hashable {
        case regularApp
        case viewService
        case nonEventHandlingProcess

        static func processType(for pid: Int32) -> Self {
            uiElementProcessType(application: { NSRunningApplication(processIdentifier: pid) },
                activationPolicy: { $0.activationPolicy.rawValue },
                isFinishedLaunching: { $0.isFinishedLaunching })
        }
        static func containingElement(for element: any UIElementProtocol, ofTypes types: Set<Self>,
            reportError: @escaping (Error) -> Void
        ) -> (element: any UIElementProtocol, processType: Self, pid: Int32)? {
            containingProcessElement(for: element, ofTypes: types,
                parent: { $0.parentValue(reportError: reportError) },
                actualPID: { try $0.axElement.actualPID }, classify: processType,
                reportError: reportError)
        }

        static func containingElement(for element: UIElement, ofTypes types: Set<Self>,
            reportError: @escaping (Error) -> Void
        ) -> (element: UIElement, processType: Self, pid: Int32)? {
            containingProcessElement(for: element, ofTypes: types,
                parent: { $0.parentValue(reportError: reportError) },
                actualPID: { try $0.axElement.actualPID }, classify: processType,
                reportError: reportError)
        }
    }
}

// 0x10078e4c4: read activation policy before finished-launching, even for
// prohibited apps. Missing or unfinished application cannot handle events.
func uiElementProcessType<Application>(application: () -> Application?,
    activationPolicy: (Application) -> Int,
    isFinishedLaunching: (Application) -> Bool) -> UIElement.ProcessType {
    guard let application = application() else { return .nonEventHandlingProcess }
    let policy = activationPolicy(application)
    let finished = isFinishedLaunching(application)
    guard finished else { return .nonEventHandlingProcess }
    return policy == 2 ? .viewService : .regularApp
}

// 0x10078e178: reuse source parentChain (including self, depth 300 and
// lookahead). Actual-PID errors report/skip that node. No PID/cycle dedup.
// Even an empty type set traverses and classifies before membership checks.
func containingProcessElement<Node>(for element: Node, ofTypes types: Set<UIElement.ProcessType>,
    parent: @escaping (Node) -> Node?, actualPID: (Node) throws -> Int32,
    classify: (Int32) -> UIElement.ProcessType,
    reportError: (Error) -> Void
) -> (element: Node, processType: UIElement.ProcessType, pid: Int32)? {
    for node in uiElementParentChain(of: element, maxDepth: 300, includingSelf: true, parent: parent) {
        let pid: Int32
        do { pid = try actualPID(node) }
        catch { reportError(error); continue }
        let type = classify(pid)
        if types.contains(type) { return (node, type, pid) }
    }
    return nil
}
