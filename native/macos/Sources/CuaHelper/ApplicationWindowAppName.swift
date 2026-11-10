import AppKit

extension ApplicationWindow {
    //0x10077f770: resolve running application from CG owner PID, prefer its
    // localizedName, then fall back to stored CG ownerName. Empty is present.
    var appName: String? {
        appName(readLocalizedName: { NSRunningApplication(processIdentifier: $0)?.localizedName })
    }

    func appName(readLocalizedName: (Int32) -> String?) -> String? {
        if let name = readLocalizedName(cgWindow.ownerPID) { return name }
        return cgWindow.ownerName
    }
}
