import Foundation

@main
struct BundleWebClassificationTests {
    static func main() throws {
        let fixtures: [(Any?, Bool)] = [
            (nil, false), ("http", false), ([], false),
            ([["CFBundleURLSchemes": ["http"]]], true),
            ([["CFBundleURLSchemes": ["https"]]], false),
            ([["CFBundleURLSchemes": ["HTTP"]]], false),
            ([["CFBundleURLSchemes": ["http", 1]]], false),
            ([["CFBundleURLSchemes": ["http"]], 1], false),
            ([["CFBundleURLSchemes": 1], ["CFBundleURLSchemes": ["http"]]], true)
        ]
        for (value, expected) in fixtures {
            var keys: [String] = []
            precondition(bundleSupportsHTTPScheme { key in keys.append(key); return value } == expected)
            precondition(keys == ["CFBundleURLTypes"])
        }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        for (index, name) in ["AtomApplication", "BrowserCrApplication", "atomapplication", "NSApplication"].enumerated() {
            let path = root.appendingPathComponent("App\(index).app")
            let contents = path.appendingPathComponent("Contents")
            try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
            let info: [String: Any] = ["CFBundleIdentifier": "test.cua.\(UUID().uuidString)", "CFBundlePackageType": "APPL", "NSPrincipalClass": name]
            try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
            let bundle = Bundle(url: path)!
            precondition(bundle.isElectronApp == (index == 0))
            precondition(bundle.isChromiumApp == (index == 1))
            precondition(bundle.isWebShapedForUIElements == (index < 2))
        }
        print("bundle classification preserves exact schemes, typed arrays and principal-class predicates")
    }
}
