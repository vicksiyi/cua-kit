import Foundation
import MCP

@main struct NativeAppApprovalResponseTests {
    static func main() async throws {
        let tests = Self()
        try tests.testAcceptUsesOnlyExactMetadataString()
        try tests.testDeclineAndCancelDoNotBecomeAcceptFromMetadata()
        tests.testUpstreamDecoderRejectsInvalidActionsAndContainers()
        try await tests.testAcceptedDecisionFeedsRestoredStoreWithoutWritingDeclines()
        print("native MCP SDK approval response and storage composition passed")
    }
    private func equal<T: Equatable>(_ left: T, _ right: T) { precondition(left == right) }
    private func interpret(_ text: String) throws -> NativeAppApprovalResponse.Outcome {
        NativeAppApprovalResponse.interpret(try JSONDecoder().decode(CreateElicitation.Result.self, from: Data(text.utf8)))
    }

    func testAcceptUsesOnlyExactMetadataString() throws {
        equal(try interpret(#"{"action":"accept","_meta":{"persist":"always"}}"#), .accepted(persist: true))
        for value in [#""session""#, #""ALWAYS""#, #"" always ""#, #""""#, "true", "1", "null", "[]", "{}"] {
            equal(try interpret("{\"action\":\"accept\",\"_meta\":{\"persist\":\(value)}}"), .accepted(persist: false))
        }
        for suffix in ["", #", "_meta":null"#, #", "_meta":{}"#, #", "content":{"persist":"always","source":"computer-use-persisted-state"}"#] {
            equal(try interpret("{\"action\":\"accept\"\(suffix)}"), .accepted(persist: false))
        }
    }

    func testDeclineAndCancelDoNotBecomeAcceptFromMetadata() throws {
        equal(try interpret(#"{"action":"decline","_meta":{"persist":"always"}}"#), .declined)
        equal(try interpret(#"{"action":"cancel","_meta":{"persist":"always"}}"#), .cancelled)
    }

    func testUpstreamDecoderRejectsInvalidActionsAndContainers() {
        for text in ["{}", #"{"action":"ACCEPT"}"#, #"{"action":"unknown"}"#, #"{"action":true}"#,
                     #"{"action":"accept","_meta":[]}"#, #"{"action":"accept","content":"always"}"#] {
            do { _ = try interpret(text); fatalError("Invalid protocol result decoded") } catch {}
        }
    }

    func testAcceptedDecisionFeedsRestoredStoreWithoutWritingDeclines() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("core-response-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("approvals.json")
        let store = NativeAppApprovalStore(storageURL: file)
        for (id, text) in [
            ("fixture.declined", #"{"action":"decline","_meta":{"persist":"always"}}"#),
            ("fixture.cancelled", #"{"action":"cancel"}"#),
            ("fixture.session", #"{"action":"accept"}"#),
            ("fixture.saved", #"{"action":"accept","_meta":{"persist":"always"}}"#)
        ] {
            let response = try JSONDecoder().decode(CreateElicitation.Result.self, from: Data(text.utf8))
            do {
                try await NativeAppApprovalResponse.record(response, bundleIdentifier: id, store: store)
                precondition(id == "fixture.session" || id == "fixture.saved")
            } catch let error as NativeMCPToolError {
                switch id {
                case "fixture.declined": equal(error, .appApprovalDenied(bundleIdentifier: id))
                case "fixture.cancelled": equal(error, .appApprovalCanceled(bundleIdentifier: id))
                default: throw error
                }
            }
        }
        let snapshot = await store.snapshot()
        equal(snapshot.session, ["fixture.session", "fixture.saved"])
        equal(snapshot.persistent, ["fixture.saved"])
        let record = try JSONDecoder().decode(NativePersistentAppApprovals.self, from: Data(contentsOf: file))
        equal(record.approvedBundleIdentifiers, ["fixture.saved"])
    }
}
