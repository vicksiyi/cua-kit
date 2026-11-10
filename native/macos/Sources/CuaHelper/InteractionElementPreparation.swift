// Prefix of prepareToInteract0x100072f54..0x1000733ac. The later
// actual-PID/focus checks are separate and must still run before dispatch.
// A scroll can invalidate the original element: resolve the same rendered ID
// again only when positionElement returns didScroll=true.
func prepareInteractionElement<Element>(positionElement: Bool,
    resolve: () throws -> Element,
    activateFocusEnforcer: () -> Void,
    position: (Element) async throws -> Bool
) async throws -> Element {
    var element = try resolve()
    activateFocusEnforcer()
    if positionElement, try await position(element) {
        element = try resolve()
    }
    return element
}

// Tail0x100073430..0x100073458: read the resolved element's actual PID,
// then reject system-security applications. This is not app activation.
func prepareInteraction<Element>(positionElement: Bool,
    resolve: () throws -> Element, activateFocusEnforcer: () -> Void,
    position: (Element) async throws -> Bool,
    validateProcess: (Element) throws -> Void
) async throws -> Element {
    let element = try await prepareInteractionElement(positionElement: positionElement,
        resolve: resolve, activateFocusEnforcer: activateFocusEnforcer, position: position)
    try validateProcess(element)
    return element
}

// Helper0x100086fc4: absent application/bundle returns without reading the
// security list; compare the resolved application's bundle, not the bound app.
func validateInteractionProcess<Application>(pid: Int32,
    application: (Int32) -> Application?, bundleIdentifier: (Application) -> String?,
    securityBundleIdentifiers: () -> [String], reject: (String) throws -> Void
) rethrows {
    guard let app = application(pid), let bundle = bundleIdentifier(app) else { return }
    if securityBundleIdentifiers().contains(bundle) { try reject(bundle) }
}
