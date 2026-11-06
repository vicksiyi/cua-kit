import Foundation

// NSBundle.supportsHTTPScheme 0x1002561f0..<0x10025644c.
// Preserve whole-array dynamic casts and exact lowercase "http" matching.
func bundleSupportsHTTPScheme(read: (String) -> Any?) -> Bool {
    guard let types = read("CFBundleURLTypes") as? [[String: Any]] else { return false }
    for type in types {
        if let schemes = type["CFBundleURLSchemes"] as? [String], schemes.contains("http") { return true }
    }
    return false
}

extension Bundle {
    var supportsHTTPScheme: Bool { bundleSupportsHTTPScheme(read: object(forInfoDictionaryKey:)) }
    // 0x100256494..<0x1002565d0 and 0x1002565d0..<0x100256708.
    var isElectronApp: Bool { object(forInfoDictionaryKey: "NSPrincipalClass") as? String == "AtomApplication" }
    var isChromiumApp: Bool { object(forInfoDictionaryKey: "NSPrincipalClass") as? String == "BrowserCrApplication" }
    var isWebShapedForUIElements: Bool { supportsHTTPScheme || isElectronApp || isChromiumApp }
}
