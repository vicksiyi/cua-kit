import AppKit

// Native0x10071e484..0x10071e608 suppresses PID errors and returns false
// for absent running application, bundle URL or bundle. Classification uses
// the existing bundle predicates, without bundle-ID/name heuristics.
func applicationBundleMatches<BundleValue>(pid: () throws -> Int32,
    bundleURL: (Int32) -> URL?, makeBundle: (URL) -> BundleValue?,
    classify: (BundleValue) -> Bool
) -> Bool {
    guard let processID = try? pid(), let url = bundleURL(processID), let bundle = makeBundle(url) else { return false }
    return classify(bundle)
}

extension ApplicationUIElement {
    var isWebShaped: Bool {
        applicationBundleMatches(pid: { try axElement.pid },
            bundleURL: { NSRunningApplication(processIdentifier: $0)?.bundleURL },
            makeBundle: { Bundle(url: $0) }, classify: { $0.isWebShapedForUIElements })
    }
    var isElectronApp: Bool {
        applicationBundleMatches(pid: { try axElement.pid },
            bundleURL: { NSRunningApplication(processIdentifier: $0)?.bundleURL },
            makeBundle: { Bundle(url: $0) }, classify: { $0.isElectronApp })
    }
}
