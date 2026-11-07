import ApplicationServices

// 0x1007002a0: manual support is queried before context/bundle selection.
// iWork is a prefix; Spotify is exact (different verified Swift imports).
func primaryAXEnablementKind(context: UIElementContextType, bundleIdentifier: String,
    supportsManualAccessibility: () -> Bool) -> AXEnablementKind? {
    if supportsManualAccessibility() && context == .fullUIContext { return .enableElectronAccessibility }
    if bundleIdentifier.hasPrefix("com.apple.iWork") || bundleIdentifier == "com.spotify.client" || context == .fullUIContext {
        return .enableEnhancedUserInterface
    }
    return nil
}

// 0x1007019f8: Excel/Music exact, Arc/Dia exact only in full UI context,
// Atlas prefix in every context. This is not a generic browser classification.
func shouldEnableVoiceOverOnPreference(context: UIElementContextType, bundleIdentifier: String) -> Bool {
    if bundleIdentifier == "com.microsoft.Excel" { return true }
    if (bundleIdentifier == "company.thebrowser.Browser" || bundleIdentifier == "company.thebrowser.dia") && context == .fullUIContext {
        return true
    }
    return bundleIdentifier == "com.apple.Music" || bundleIdentifier.hasPrefix("com.openai.atlas")
}

extension UIElement {
    func primaryAccessibilityEnablementKind(context: UIElementContextType, bundleIdentifier: String) -> AXEnablementKind? {
        primaryAXEnablementKind(context: context, bundleIdentifier: bundleIdentifier,
            supportsManualAccessibility: {
                uiElementIsAttributeSupported(UIElementAttribute("AXManualAccessibility"), readCache: { cache },
                    freshSupportedAttributes: { Set(axElement.supportedAttributes) })
            })
    }
}

// 0x1007002a0..0x10070067c. Native operations/initialization are supplied until
// all their implementations and controller owner are restored. No no-op native
// fallback is provided. A failed first enable rolls back its count but the
// original acquired-kind list is preserved for assertion teardown.
func acquireAXEnablementAssertion<Application: Hashable>(application: Application,
    tracker: AXEnablementAssertionTracker<Application>, context: UIElementContextType,
    bundleIdentifier: String, supportsManualAccessibility: () -> Bool,
    enableElectron: (inout Bool) -> Bool, enableEnhancedUI: (inout Bool) -> Bool,
    enableVoiceOverPreference: () -> Bool, windowInitializationEligibility: () -> Bool,
    initializeApplication: () -> Bool, reportInitialized: (Application) -> Void,
    makeAssertion: ([AXEnablementKind]) -> AXEnablementAssertion) -> AXEnablementAssertion? {
    var changed = false
    var kinds: [AXEnablementKind] = []
    if let kind = primaryAXEnablementKind(context: context, bundleIdentifier: bundleIdentifier,
        supportsManualAccessibility: supportsManualAccessibility) {
        kinds.append(kind)
        if tracker.acquire(for: application, kind: kind) {
            let attempted: Bool
            switch kind {
            case .enableElectronAccessibility: attempted = enableElectron(&changed)
            case .enableEnhancedUserInterface: attempted = enableEnhancedUI(&changed)
            case .enableVoiceOverOnPreference: preconditionFailure("VoiceOver is not a primary kind")
            }
            if !attempted { _ = tracker.release(for: application, kind: kind) }
        }
    }
    if shouldEnableVoiceOverOnPreference(context: context, bundleIdentifier: bundleIdentifier) {
        let kind = AXEnablementKind.enableVoiceOverOnPreference
        kinds.append(kind)
        if tracker.acquire(for: application, kind: kind), !enableVoiceOverPreference() {
            _ = tracker.release(for: application, kind: kind)
        }
    }
    // Initialization is independent of whether an assertion will be returned.
    // Electron kinds can initialize again even for a previously marked app.
    if changed || windowInitializationEligibility() {
        if kinds.contains(.enableElectronAccessibility) || !tracker.hasInitialized(application) {
            if initializeApplication() { tracker.markInitialized(application, report: reportInitialized) }
        }
    }
    guard !kinds.isEmpty else { return nil }
    return makeAssertion(kinds)
}
