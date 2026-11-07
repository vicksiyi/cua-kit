import ApplicationServices

extension UIElement {
    // ApplicationUIElement.isCatalystApp (0x100715974). The attribute is
    // _AXExhibitsMacCatalystBehavior, not a bundle/path heuristic.
    func isCatalystApplication(reportError: (Error) -> Void) -> Bool {
        booleanValue(for: UIElementAttribute("_AXExhibitsMacCatalystBehavior"),
            ignoringTypeMismatch: true, reportError: reportError) ?? false
    }

    func prepareSyntheticClickFocus(element: UIElement?, insideWebView: Bool,
        clickingByCoordinate: Bool, hasHeldKey: Bool, window: SyntheticActivationWindow?,
        enforcer: SyntheticAppFocusEnforcer?, applicationIsActive: () throws -> Bool,
        reportError: @escaping (Error) -> Void, send: (SynthesizedEvent) throws -> Void) async throws -> Bool {
        try await prepareApplicationForSyntheticClick(hasFocusEnforcer: enforcer != nil,
            applicationBelievesItHasFocus: { enforcer!.state.applicationBelievesItHasFocus },
            hasHeldKey: hasHeldKey, clickingByCoordinate: clickingByCoordinate, isInsideWebView: insideWebView,
            clickingMayCauseSelection: {
                element?.clickingMayCauseSelection(transaction: UIElementTreeTransaction.current?.cache,
                    environment: .provider, reportError: reportError) ?? false
            }, isCatalystApp: { self.isCatalystApplication(reportError: reportError) },
            catalystRoleRequiresActivation: { element?.role == .menuButton },
            applicationIsActive: applicationIsActive,
            safelyEnforceWindowActiveState: {
                try await enforcer!.safelyEnforceActiveState(for: window, send: send, reportError: reportError)
            })
    }

    func prepareAccessibilityClickFocus(element: UIElement, window: SyntheticActivationWindow?,
        enforcer: SyntheticAppFocusEnforcer?, probeApplicationIsActive: () throws -> Void,
        reportError: @escaping (Error) -> Void, send: (SynthesizedEvent) throws -> Void) async throws {
        try await prepareUIElementAccessibilityActionFocus(hasFocusEnforcer: enforcer != nil,
            applicationBelievesItHasFocus: { enforcer!.state.applicationBelievesItHasFocus },
            isCatalystApp: { self.isCatalystApplication(reportError: reportError) },
            clickingMayCauseSelection: {
                element.clickingMayCauseSelection(transaction: UIElementTreeTransaction.current?.cache,
                    environment: .provider, reportError: reportError)
            }, role: { element.role }, probeApplicationIsActive: probeApplicationIsActive,
            safelyEnforceWindowActiveState: {
                try await enforcer!.safelyEnforceActiveState(for: window, send: send, reportError: reportError)
            })
    }
}
