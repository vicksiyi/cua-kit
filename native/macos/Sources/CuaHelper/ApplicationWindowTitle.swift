import AppKit
import CoreGraphics

//0x10077f830..0x10077fb98. Present CG title prevents AX lookup even when
// empty. Only nil/empty candidates reach the Finder desktop specialization.
func applicationWindowTitle(cgTitle: String?, readAXTitle: () -> String?,
    isDesktopLevel: () -> Bool, readBundleIdentifier: () -> String?) -> String? {
    let candidate = cgTitle ?? readAXTitle()
    if let candidate, !candidate.isEmpty { return candidate }
    if isDesktopLevel(), readBundleIdentifier() == "com.apple.finder" { return "Desktop" }
    return candidate
}

extension ApplicationWindow {
    var title: String? {
        applicationWindowTitle(cgTitle: cgWindow.name, readAXTitle: { axWindow.title },
            isDesktopLevel: { cgWindow.level == CGWindowLevelForKey(CGWindowLevelKey(rawValue: 18)!) },
            readBundleIdentifier: { NSRunningApplication(processIdentifier: cgWindow.ownerPID)?.bundleIdentifier })
    }
}
