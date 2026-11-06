import Foundation

@main struct NativeApplicationResolutionTests {
    static func main() throws {
        let target = NativeApplicationTarget(bundleIdentifier: "fixture.app", bundleURL: URL(fileURLWithPath: "/fixture.app"))
        enum SelectionError: Error { case ambiguous }
        // Exercise every fallback and ensure ambiguity cannot become a name lookup.
        for mode in 0..<6 {
            var events = [String]()
            let resolver = NativeApplicationResolution(targetAtPath: { value in
                events.append("path:\(value)")
                return (mode == 0 || (mode == 3 && value == "/named.app")) ? target : nil
            }, installedTargets: { _ in
                events.append("installed"); return mode == 1 || mode == 5 ? [target] : []
            }, runningTargets: { _ in
                events.append("running"); return mode == 2 ? [target] : []
            }, pathForName: { _ in events.append("name"); return mode == 3 ? "/named.app" : nil
            }, selectTarget: { _, values in
                events.append("select")
                if mode == 5 { throw SelectionError.ambiguous }
                return values[0]
            })
            do {
                let result = try resolver.resolvePreferringRunningApplication("query")
                precondition(mode != 4 && mode != 5)
                precondition(result.identifier == target.identifier)
            } catch is NativeApplicationResolution.NotFound { precondition(mode == 4)
            } catch SelectionError.ambiguous { precondition(mode == 5) }
            let expected = [
                ["path:query"],
                ["path:query", "running", "path:query", "installed", "select"],
                ["path:query", "running", "select"],
                ["path:query", "running", "path:query", "installed", "name", "path:/named.app"],
                ["path:query", "running", "path:query", "installed", "name"],
                ["path:query", "running", "path:query", "installed", "select"],
            ][mode]
            precondition(events == expected)
        }
        // A genuine temporary bundle verifies the native path probe, including
        // a non-.app suffix that the old independent resolver rejects.
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let contents = root.appendingPathComponent("Fixture.bundle/Contents")
        try fm.createDirectory(at: contents, withIntermediateDirectories: true)
        let data = try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": "fixture.bundle", "CFBundlePackageType": "BNDL"], format: .xml, options: 0)
        try data.write(to: contents.appendingPathComponent("Info.plist"))
        let resolved = NativeApplicationResolution.targetAtPath(contents.deletingLastPathComponent().path)
        precondition(resolved?.bundleIdentifier == "fixture.bundle")
        precondition(NativeApplicationResolution.targetAtPath(root.appendingPathComponent("missing").path) == nil)
        print("native application resolution path and fallback ordering passed")
    }
}
