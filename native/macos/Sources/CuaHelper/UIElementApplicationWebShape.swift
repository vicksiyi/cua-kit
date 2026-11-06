import AppKit
import ApplicationServices

// 0x10071e484..<0x10071e608: resolve the AX PID, running application,
// bundle URL, then Bundle. Failure at any step returns false. No launch,
// bundle-ID fallback, cache, or access-policy decision is made here.
func uiElementApplicationIsWebShaped<Application, ApplicationBundle>(
    processID: () throws -> pid_t,
    runningApplication: (pid_t) -> Application?,
    bundleURL: (Application) -> URL?,
    loadBundle: (URL) -> ApplicationBundle?,
    supportsHTTP: (ApplicationBundle) -> Bool,
    isElectron: (ApplicationBundle) -> Bool,
    isChromium: (ApplicationBundle) -> Bool
) -> Bool {
    guard let pid = try? processID(),
          let application = runningApplication(pid),
          let url = bundleURL(application),
          let bundle = loadBundle(url) else { return false }
    return supportsHTTP(bundle) || isElectron(bundle) || isChromium(bundle)
}

func uiElementApplicationIsWebShaped(_ element: AXUIElement) -> Bool {
    uiElementApplicationIsWebShaped(
        processID: { try copiedAXProcessID { AXUIElementGetPid(element, &$0) } },
        runningApplication: NSRunningApplication.init(processIdentifier:),
        bundleURL: { $0.bundleURL }, loadBundle: Bundle.init(url:),
        supportsHTTP: { $0.supportsHTTPScheme },
        isElectron: { $0.isElectronApp }, isChromium: { $0.isChromiumApp })
}
