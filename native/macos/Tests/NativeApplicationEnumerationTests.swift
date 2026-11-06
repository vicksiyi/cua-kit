import Foundation

@main struct NativeApplicationEnumerationTests {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        func makeBundle(_ name: String, _ identifier: String?) throws -> URL {
            let url = root.appendingPathComponent(name)
            let contents = url.appendingPathComponent("Contents")
            try fm.createDirectory(at: contents, withIntermediateDirectories: true)
            var info = ["CFBundlePackageType": "APPL"]
            if let identifier { info["CFBundleIdentifier"] = identifier }
            try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
                .write(to: contents.appendingPathComponent("Info.plist"))
            return url
        }
        let a = try makeBundle("A.app", "fixture.test")
        let b = try makeBundle("B.app", "fixture.test")
        let wrong = try makeBundle("Wrong.app", "fixture.Test")
        let noID = try makeBundle("NoID.app", nil)
        let alias = root.appendingPathComponent("Alias.app")
        try fm.createSymbolicLink(at: alias, withDestinationURL: a)
        var events = [String]()
        let enumeration = NativeApplicationEnumeration(installedURLs: { id in
            precondition(id == "fixture.test"); events.append("installed")
            return [b, alias, noID, wrong]
        }, runningURLs: { id in
            precondition(id == "fixture.test"); events.append("running")
            return [a, alias, wrong]
        }, bundleIdentifier: { url in
            events.append(url.lastPathComponent)
            return Bundle(url: url)?.bundleIdentifier
        })
        let targets = enumeration.applicationTargets("fixture.test")
        precondition(targets.map(\.identifier) == [a, b].map(NativeApplicationTarget.identifier))
        precondition(events == ["installed", "running", "A.app", "A.app", "Wrong.app", "A.app", "B.app", "A.app", "NoID.app", "Wrong.app"])
        // A rejected URL must not occupy the deduplication set. A later read of
        // the same URL may have become valid; source re-reads before insertion.
        var reads = 0
        let changing = NativeApplicationEnumeration(installedURLs: { _ in [] }, runningURLs: { _ in [] }, bundleIdentifier: { _ in
            reads += 1; return reads == 1 ? "wrong" : "fixture.test"
        })
        precondition(changing.validatedTargets("fixture.test", urls: [a, alias]).count == 1)
        precondition(reads == 2)
        print("native application enumeration order, validation and canonical deduplication passed")
    }
}
