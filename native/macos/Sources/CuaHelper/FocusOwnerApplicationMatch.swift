import AppKit

// 0x100751c50: match localizedName, exclude policy2, accept exactly one.
// Zero or ambiguous candidates return nil; never choose by PID/order.
func matchingFocusOwnerApplication<Application>(
    ownerName: String?, runningApplications: () -> [Application],
    localizedName: (Application) -> String?, activationPolicy: (Application) -> Int
) -> Application? {
    guard let ownerName else { return nil }
    let candidates = runningApplications().filter {
        localizedName($0) == ownerName && activationPolicy($0) != 2
    }
    return candidates.count == 1 ? candidates[0] : nil
}

func systemFocusOwnerApplication(_ application: NSRunningApplication) -> NSRunningApplication? {
    matchingFocusOwnerApplication(ownerName: application.localizedName.flatMap(focusOwnerNameFromLocalizedName),
        runningApplications: { NSWorkspace.shared.runningApplications },
        localizedName: { $0.localizedName }, activationPolicy: { $0.activationPolicy.rawValue })
}
