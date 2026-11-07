import ApplicationServices

// These protocol getters are throwing. Their exported demangled names omit
// that effect; error-register propagation in the native bodies establishes it.
func providerAXProcessID(_ element: AXUIElement, system: () throws -> Int32) throws -> Int32 {
    try withAXProvider(element, mock: { try $0.pid }, system: system)
}
func providerAXActualProcessID(_ element: AXUIElement, system: () throws -> Int32) throws -> Int32 {
    try withAXProvider(element, mock: { try $0.actualPID }, system: system)
}
func providerAXWindowID(_ element: AXUIElement, system: () throws -> UInt32) throws -> UInt32 {
    try withAXProvider(element, mock: { try $0.windowID }, system: system)
}

// Bundle identity is nonthrowing and has its own lookup. Only the system
// branch queries PID, swallowing its failure without querying an application.
func providerAXBundleIdentifier(_ element: AXUIElement,
    readPID: () throws -> Int32, applicationBundleIdentifier: (Int32) -> String?
) -> String? {
    withAXProvider(element, mock: { $0.bundleIdentifier }, system: {
        guard let pid = try? readPID() else { return nil }
        return applicationBundleIdentifier(pid)
    })
}

func copiedAXWindowID(copy: (inout UInt32) -> AXError) throws -> UInt32 {
    var identifier: UInt32 = 0
    let error = copy(&identifier)
    guard error == .success else { throw UIElementError.axError(error) }
    return identifier
}
