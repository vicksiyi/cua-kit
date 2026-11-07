import AppKit

// Lifecycle 0x1007007e4 / 0x100700c3c: mark disabled BEFORE cleanup so
// reentry and deinit cannot release twice. The release closure captures the
// native operation/context by value until after cleanup finishes.
final class AXEnablementAssertion {
    typealias Kind = AXEnablementKind
    private let kinds: [Kind]
    private let release: ([Kind]) -> Void
    private var isEnabled = true

    init(kinds: [Kind], release: @escaping ([Kind]) -> Void) {
        self.kinds = kinds
        self.release = release
    }
    func disable() {
        guard isEnabled else { return }
        isEnabled = false
        release(kinds)
    }
    deinit { disable() }
}

// 0x10070083c: preserve acquisition order and duplicates. Release accounting
// precedes each kind's native cleanup, and only the final owner performs it.
func releaseAXEnablementKinds<Application: Hashable>(_ kinds: [AXEnablementKind],
    application: Application, tracker: AXEnablementAssertionTracker<Application>,
    reportRelease: (AXEnablementKind) -> Void,
    setManualAccessibility: (Bool) throws -> Void,
    setEnhancedUserInterface: (Bool) throws -> Void, releaseVoiceOverPreference: () -> Void) {
    for kind in kinds {
        guard tracker.release(for: application, kind: kind) else { continue }
        reportRelease(kind)
        switch kind {
        case .enableElectronAccessibility: try? setManualAccessibility(false)
        case .enableEnhancedUserInterface: try? setEnhancedUserInterface(false)
        case .enableVoiceOverOnPreference: releaseVoiceOverPreference()
        }
    }
}

extension UIElement {
    // Native release composition; the acquisition policy must supply its
    // acquired kinds and shared tracker. This does not itself enable anything.
    func makeAccessibilityEnablementAssertion(kinds: [AXEnablementKind], application: NSRunningApplication,
        tracker: AXEnablementAssertionTracker<NSRunningApplication>, reportRelease: @escaping (AXEnablementKind) -> Void) -> AXEnablementAssertion {
        AXEnablementAssertion(kinds: kinds) { kinds in
            releaseAXEnablementKinds(kinds, application: application, tracker: tracker, reportRelease: reportRelease,
                setManualAccessibility: { try self.setValue($0, forAttribute: UIElementAttribute("AXManualAccessibility")) },
                setEnhancedUserInterface: { try self.setValue($0, forAttribute: UIElementAttribute("AXEnhancedUserInterface")) },
                releaseVoiceOverPreference: releaseSystemVoiceOverOnPreference)
        }
    }
}
