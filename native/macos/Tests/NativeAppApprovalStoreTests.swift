import Foundation

@main struct NativeAppApprovalStoreTests {
    static func main() async throws {
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
        let originalDate = state.modificationDate!
        try Data(#"{"approvedBundleIdentifiers":["fixture.external","fixture.external"]}"#.utf8).write(to: file)
        try fm.setAttributes([.modificationDate: originalDate], ofItemAtPath: file.path)
        await store.refreshPersistentApprovals()
        state = await store.snapshot()
        precondition(state.persistent == ["fixture.persistent"])
        try fm.setAttributes([.modificationDate: originalDate.addingTimeInterval(10)], ofItemAtPath: file.path)
        await store.refreshPersistentApprovals()
        state = await store.snapshot()
        precondition(state.persistent == ["fixture.external"] && state.session.count == 2)
        try Data("broken json".utf8).write(to: file)
        try fm.setAttributes([.modificationDate: originalDate.addingTimeInterval(20)], ofItemAtPath: file.path)
        await store.refreshPersistentApprovals()
        state = await store.snapshot()
        precondition(state.persistent.isEmpty && state.session.count == 2)
        try fm.removeItem(at: file)
        await store.refreshPersistentApprovals()
        state = await store.snapshot()
        precondition(state.persistent.isEmpty && state.modificationDate == nil)

        let missing = NativeAppApprovalStore(storageURL: nil)
        do {
            try await missing.recordApproval(bundleIdentifier: "fixture.missing", persist: true)
            fatalError("Missing storage must throw")
        } catch let error as NativeAppApprovalStore.MissingStorageURL {
            precondition(error.bundleIdentifier == "fixture.missing")
        }
        let missingState = await missing.snapshot()
        precondition(missingState.session == ["fixture.missing"] && missingState.persistent.isEmpty)

        let blocker = root.appendingPathComponent("not-a-directory")
        try Data().write(to: blocker)
        let failing = NativeAppApprovalStore(storageURL: blocker.appendingPathComponent("approvals.json"))
        do {
            try await failing.recordApproval(bundleIdentifier: "fixture.failed", persist: true)
            fatalError("Directory creation must fail")
        } catch { precondition(!(error is NativeAppApprovalStore.MissingStorageURL)) }
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
