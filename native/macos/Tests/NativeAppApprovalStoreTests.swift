import Foundation

@main struct NativeAppApprovalStoreTests {
    static func main() async throws {
        // Expected descriptions come from the pinned native description branches.
        let descriptions: [(NativeMCPToolError, String)] = [
            (.missingArgument("target"), "Missing required argument: target"),
            (.invalidArgument("原始说明\nunchanged"), "原始说明\nunchanged"),
            (.unknownTool("fixture"), "Unknown tool: fixture"),
            (.appBlockedByPolicy(bundleIdentifier: "fixture.app"), "Computer Use is blocked from using the app 'fixture.app' by your organization's policy."),
            (.appNotAllowed(bundleIdentifier: "fixture.app"), "Computer Use is not allowed to use the app 'fixture.app' for safety reasons."),
            (.appApprovalDenied(bundleIdentifier: "fixture.app"), "Computer Use approval denied via MCP elicitation for app 'fixture.app'."),
            (.appApprovalCanceled(bundleIdentifier: "fixture.app"), "Computer Use permission request canceled for app 'fixture.app'."),
            (.appApprovalPersistenceUnavailable(bundleIdentifier: "fixture.app"), "Computer Use could not persist the approval permanently for app 'fixture.app'.")
        ]
        for (error, expected) in descriptions { precondition(String(describing: error) == expected) }

        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("core-approval-store-\(UUID())")
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let file = root.appendingPathComponent("nested/approvals.json")
        let store = NativeAppApprovalStore(storageURL: file)
        try await store.recordApproval(bundleIdentifier: "fixture.session", persist: false)
        precondition(!fm.fileExists(atPath: file.path))
        try await store.recordApproval(bundleIdentifier: "fixture.persistent", persist: true)
        var state = await store.snapshot()
        precondition(state.session == ["fixture.session", "fixture.persistent"])
        precondition(state.persistent == ["fixture.persistent"] && state.modificationDate != nil)
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
        precondition(Set(json.keys) == ["approvedBundleIdentifiers"])
        precondition(json["approvedBundleIdentifiers"] as? [String] == ["fixture.persistent"])
        let reloaded = NativeAppApprovalStore(storageURL: file)
        let initial = await reloaded.snapshot()
        precondition(initial.session.isEmpty && initial.persistent == ["fixture.persistent"])

        // Same timestamp: no reload even if bytes changed. A changed timestamp
        // replaces rather than merges approvals; local session grants remain.
        // Use a whole-second baseline before the actor reads metadata. Reapplying
        // a freshly observed fractional timestamp can round in Foundation/filesystem
        // conversion and is not a valid unchanged-mtime fixture.
        let originalDate = Date(timeIntervalSince1970: 1_700_000_000)
        try fm.setAttributes([.modificationDate: originalDate], ofItemAtPath: file.path)
        let cache = NativeAppApprovalStore(storageURL: file)
        try await cache.recordApproval(bundleIdentifier: "fixture.session", persist: false)
        try await cache.recordApproval(bundleIdentifier: "fixture.persistent", persist: false)
        try Data(#"{"approvedBundleIdentifiers":["fixture.external","fixture.external"]}"#.utf8).write(to: file)
        try fm.setAttributes([.modificationDate: originalDate], ofItemAtPath: file.path)
        await cache.refreshPersistentApprovals()
        state = await cache.snapshot()
        precondition(state.persistent == ["fixture.persistent"])
        try fm.setAttributes([.modificationDate: originalDate.addingTimeInterval(10)], ofItemAtPath: file.path)
        await cache.refreshPersistentApprovals()
        state = await cache.snapshot()
        precondition(state.persistent == ["fixture.external"] && state.session.count == 2)
        try Data("broken json".utf8).write(to: file)
        try fm.setAttributes([.modificationDate: originalDate.addingTimeInterval(20)], ofItemAtPath: file.path)
        await cache.refreshPersistentApprovals()
        state = await cache.snapshot()
        precondition(state.persistent.isEmpty && state.session.count == 2)
        try fm.removeItem(at: file)
        await cache.refreshPersistentApprovals()
        state = await cache.snapshot()
        precondition(state.persistent.isEmpty && state.modificationDate == nil)

        // The native MCP caller checks session membership before refreshing disk.
        // Changing the file therefore does not invalidate a session entry, and
        // querying that entry alone does not refresh unrelated persistent state.
        let lookupFile = root.appendingPathComponent("lookup.json")
        try Data(#"{"approvedBundleIdentifiers":["fixture.saved"]}"#.utf8).write(to: lookupFile)
        let lookup = NativeAppApprovalStore(storageURL: lookupFile)
        try await lookup.recordApproval(bundleIdentifier: "fixture.session-only", persist: false)
        try fm.removeItem(at: lookupFile)
        let sessionHit = await lookup.hasRecordedApproval(bundleIdentifier: "fixture.session-only")
        precondition(sessionHit)
        let beforeRefresh = await lookup.snapshot()
        precondition(beforeRefresh.persistent == ["fixture.saved"])
        let removedHit = await lookup.hasRecordedApproval(bundleIdentifier: "fixture.saved")
        precondition(!removedHit)
        let afterRefresh = await lookup.snapshot()
        precondition(afterRefresh.persistent.isEmpty && afterRefresh.session == ["fixture.session-only"])
        try Data(#"{"approvedBundleIdentifiers":["fixture.new"]}"#.utf8).write(to: lookupFile)
        let newHit = await lookup.hasRecordedApproval(bundleIdentifier: "fixture.new")
        let wrongCase = await lookup.hasRecordedApproval(bundleIdentifier: "FIXTURE.NEW")
        let missingHit = await lookup.hasRecordedApproval(bundleIdentifier: "fixture.absent")
        precondition(newHit && !wrongCase && !missingHit)

        let missing = NativeAppApprovalStore(storageURL: nil)
        do {
            try await missing.recordApproval(bundleIdentifier: "fixture.missing", persist: true)
            fatalError("Missing storage must throw")
        } catch let error as NativeMCPToolError {
            precondition(error == .appApprovalPersistenceUnavailable(bundleIdentifier: "fixture.missing"))
        }
        let missingState = await missing.snapshot()
        precondition(missingState.session == ["fixture.missing"] && missingState.persistent.isEmpty)

        let blocker = root.appendingPathComponent("not-a-directory")
        try Data().write(to: blocker)
        let failing = NativeAppApprovalStore(storageURL: blocker.appendingPathComponent("approvals.json"))
        do {
            try await failing.recordApproval(bundleIdentifier: "fixture.failed", persist: true)
            fatalError("Directory creation must fail")
        } catch { precondition(!(error is NativeMCPToolError)) }
        let failedState = await failing.snapshot()
        precondition(failedState.session == ["fixture.failed"] && failedState.persistent == ["fixture.failed"])
        precondition(failedState.modificationDate == nil)

        for raw in ["{}", "[]", "null", #"{"approvedBundleIdentifiers":null}"#, #"{"approvedBundleIdentifiers":[1]}"#] {
            do {
                _ = try JSONDecoder().decode(NativePersistentAppApprovals.self, from: Data(raw.utf8))
                fatalError("Malformed approval record must not decode")
            } catch {}
        }
        print("native approval store load, refresh, session and persistence failure semantics passed")
    }
}
