import AppKit

// 0x1007000cc..0x1007002a0: PID errors, missing running applications and
// missing bundle identifiers all return nil before tracker/acquisition work.
func withAXEnablementApplication<Application, Result>(pid: () throws -> Int32,
    runningApplication: (Int32) -> Application?, bundleIdentifier: (Application) -> String?,
    operation: (Application, String) -> Result?) -> Result? {
    guard let pid = try? pid(), let application = runningApplication(pid),
          let bundle = bundleIdentifier(application) else { return nil }
    return operation(application, bundle)
}

extension UIElementProtocol {
    func windowHasChromeNodeForInitialization() -> Bool {
        uiElementWindowHasChromeNode(readChildren: { index, maximum, knownCount in
            // The source consumes a supplied partial even alongside an AX
            // error; this probe does not use the UIElement cache or construct
            // child UIElement caches merely to inspect supported attributes.
            let result = axElement.arrayValue(for: UIElementAttribute("AXChildren"),
                index: index, maxValues: maximum, countIfKnown: knownCount)
            return result.value.flatMap { unwrapAXUIElementArray($0.value.value) }
        }, supportedAttributes: { $0.supportedAttributes })
    }
}

extension UIElement {
    // Complete native operation composition. The owning controller must retain
    // its returned assertion and provide its shared running-application tracker;
    // creating a fresh tracker per call would break cross-owner accounting.
    func enableAccessibilityIfNeeded(window: UIElement?, for context: UIElementContextType,
        tracker: AXEnablementAssertionTracker<NSRunningApplication>,
        reportError: @escaping (Error) -> Void,
        reportInitialized: (NSRunningApplication) -> Void,
        reportRelease: @escaping (AXEnablementKind) -> Void) -> AXEnablementAssertion? {
        withAXEnablementApplication(pid: { try axElement.pid },
            runningApplication: { NSRunningApplication(processIdentifier: $0) },
            bundleIdentifier: { $0.bundleIdentifier }) { application, bundle in
                acquireAXEnablementAssertion(application: application, tracker: tracker,
                    context: context, bundleIdentifier: bundle,
                    supportsManualAccessibility: {
                        uiElementIsAttributeSupported(UIElementAttribute("AXManualAccessibility"), readCache: { cache },
                            freshSupportedAttributes: { Set(axElement.supportedAttributes) })
                    }, enableElectron: { enableElectronAccessibility(changed: &$0, reportError: reportError) },
                    enableEnhancedUI: {
                        enableEnhancedUserInterface(changed: &$0, bundleIdentifier: bundle,
                            application: application, window: window, reportError: reportError)
                    }, enableVoiceOverPreference: { enableSystemVoiceOverOnPreference(bundleIdentifier: bundle) },
                    windowInitializationEligibility: { window?.windowHasChromeNodeForInitialization() ?? false },
                    initializeApplication: {
                        initializeAXApplication(window: window,
                            hasWebAreaDescendant: { $0.descendant(withRole: .webArea, reportError: reportError) != nil },
                            reportError: reportError)
                    }, reportInitialized: reportInitialized,
                    makeAssertion: { makeAccessibilityEnablementAssertion(kinds: $0, application: application,
                        tracker: tracker, reportRelease: reportRelease) })
            }
    }
}
