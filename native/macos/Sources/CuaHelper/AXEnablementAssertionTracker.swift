// Declaration order recovered from AXEnablementAssertion.Kind descriptor
// 0x1012cc788 / field records 0x10132305c..0x101323074. Internal tags only.
enum AXEnablementKind: CaseIterable, Hashable {
    case enableElectronAccessibility
    case enableEnhancedUserInterface
    case enableVoiceOverOnPreference
}

// AXEnablementOperation.AssertionTracker acquire 0x100703360 and release
// 0x1007036a8. The source dictionary is keyed by (running application, kind),
// not PID alone. Application stays generic for isolated lifecycle tests;
// the native owner will supply NSRunningApplication with its own equality.
// Like the source, callers must serialize access; no invented global lock or
// process-wide count across all applications/kinds is introduced here.
final class AXEnablementAssertionTracker<Application: Hashable> {
    private struct Key: Hashable {
        let application: Application
        let kind: AXEnablementKind
    }
    private var activeAssertions: [Key: Int] = [:]
    private let reportFirstAcquisition: (Application, AXEnablementKind) -> Void
    private let reportMissingRelease: (Application) -> Void

    init(reportFirstAcquisition: @escaping (Application, AXEnablementKind) -> Void,
         reportMissingRelease: @escaping (Application) -> Void) {
        self.reportFirstAcquisition = reportFirstAcquisition
        self.reportMissingRelease = reportMissingRelease
    }

    // True only on 0 -> 1: only that owner attempts the native enable.
    // The count is published BEFORE reporting or returning the decision.
    func acquire(for application: Application, kind: AXEnablementKind) -> Bool {
        let key = Key(application: application, kind: kind)
        let previous = activeAssertions[key] ?? 0
        activeAssertions[key] = previous + 1
        if previous == 0 { reportFirstAcquisition(application, kind) }
        return previous == 0
    }

    // True only on 1 -> 0: only that owner performs native disable. Remove
    // the dictionary entry, including its retained app, instead of storing 0.
    func release(for application: Application, kind: AXEnablementKind) -> Bool {
        let key = Key(application: application, kind: kind)
        guard let count = activeAssertions[key], count > 0 else {
            reportMissingRelease(application)
            return false
        }
        if count == 1 {
            activeAssertions.removeValue(forKey: key)
            return true
        }
        activeAssertions[key] = count - 1
        return false
    }
}
