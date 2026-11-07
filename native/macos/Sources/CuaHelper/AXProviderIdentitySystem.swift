import ApplicationServices
import AppKit

func readAXProcessID(_ element: AXUIElement) throws -> Int32 {
    try providerAXProcessID(element) { try copiedAXProcessID { AXUIElementGetPid(element, &$0) } }
}
func readAXBundleIdentifier(_ element: AXUIElement) -> String? {
    providerAXBundleIdentifier(element, readPID: { try readAXProcessID(element) },
        applicationBundleIdentifier: { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier })
}
