import SystemSoftware
import AppKit
import ApplicationServices
import os

func resolveAXWindowDescriptionFallback(isScrollArea: () -> Bool,
    applicationPID: () throws -> Int32, bundleIdentifier: (Int32) -> String?,
    desktopWindows: () -> [NativeWindowDescription], isDesktopLevel: (NativeWindowDescription) -> Bool,
    frame: () -> CGRect?, title: () -> String?, ordinaryWindows: () -> [NativeWindowDescription],
    reportAmbiguity: (Int) -> Void
) -> NativeWindowDescription? {
    if isScrollArea(), let pid = try? applicationPID(), bundleIdentifier(pid) == "com.apple.finder" {
        if let desktop = desktopWindows().first(where: { isDesktopLevel($0) && $0.ownerPID == pid }) {
            return desktop
        }
    }
    guard let bounds = frame(), !bounds.isEmpty, let name = title() else { return nil }
    let pid = (try? applicationPID()) ?? 0
    return matchAXWindowDescription(ordinaryWindows(), processID: pid, frame: bounds, title: name,
        reportAmbiguity: reportAmbiguity)
}

private func nativeWindowDescriptions(_ options: CGWindowListOption) -> [NativeWindowDescription] {
    CGWindow.allWindows(options, relativeToWindow: 0)
}

extension WindowUIElement {
    func applicationWindowDescription(axApplication: ApplicationUIElement,
        reportError: (Error) -> Void
    ) -> NativeWindowDescription? {
        resolveAXWindowDescription(readWindowID: { try axElement.windowID },
            lookupWindow: systemNativeWindowDescription, fallback: {
                resolveAXWindowDescriptionFallback(isScrollArea: { role == .scrollArea },
                    applicationPID: { try axApplication.axElement.pid },
                    bundleIdentifier: { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier },
                    desktopWindows: { nativeWindowDescriptions(.optionOnScreenOnly) },
                    isDesktopLevel: { $0.level == CGWindowLevelForKey(CGWindowLevelKey(rawValue: 18)!) },
                    frame: { frameValue(reportError: reportError) },
                    title: { cachedStringValue(for: UIElementAttribute(kAXTitleAttribute)) },
                    ordinaryWindows: {
                        nativeWindowDescriptions([.optionOnScreenOnly, .excludeDesktopElements]).filter {
                            $0.level < CGWindowLevelForKey(CGWindowLevelKey(rawValue: 8)!) && $0.ownerPID != getpid()
                        }
                    }, reportAmbiguity: { count in
                        Logger(subsystem: "core.cua", category: "WindowSelection").error("Multiple exact AX/CG window matches: \(count)")
                    })
            })
    }
}
