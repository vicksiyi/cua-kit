import Foundation
import MCP

@main struct NativeAppApprovalResponseTests {
    static func main() async throws {
        let tests = Self()
        tests.testErrorContextPreservesUserFlowDistinction()
        tests.testErrorContextPrecedenceAndSingleUnwrap()
        try tests.testAcceptUsesOnlyExactMetadataString()
        try tests.testDeclineAndCancelDoNotBecomeAcceptFromMetadata()
        tests.testUpstreamDecoderRejectsInvalidActionsAndContainers()
        try await tests.testAcceptedDecisionFeedsRestoredStoreWithoutWritingDeclines()
        print("native MCP SDK approval response and storage composition passed")
    }
    func testErrorContextPreservesUserFlowDistinction() {
        struct OtherFailure: Error {}
        for error: Error in [NativeMCPToolError.missingArgument("app"),
                            NativeMCPToolError.invalidArgument("bad"),
                            NativeMCPToolError.unknownTool("tool"), OtherFailure()] {
            precondition(NativeMCPErrorContext.infer(from: error) == nil)
        }
        let cases: [(NativeMCPToolError, Bool)] = [
            (.appBlockedByPolicy(bundleIdentifier: "fixture"), false),
            (.appNotAllowed(bundleIdentifier: "fixture"), false),
            (.appApprovalDenied(bundleIdentifier: "fixture"), true),
            (.appApprovalCanceled(bundleIdentifier: "fixture"), true),
            (.appApprovalPersistenceUnavailable(bundleIdentifier: "fixture"), true)
        ]
        for (error, triggered) in cases {
            let context = NativeMCPErrorContext.infer(from: error)!
            equal(context.value, .object(["span": .object([
                "target_id": .string("fixture"), "did_trigger_server_user_flow": .bool(triggered)
            ])]))
        }
        let empty = NativeMCPErrorContext.infer(from: NativeMCPToolError.appNotAllowed(bundleIdentifier: ""))!
        equal(empty.value, .object(["span": .object(["did_trigger_server_user_flow": .bool(false)])]))
    }

    func testErrorContextPrecedenceAndSingleUnwrap() {
        let underlying = NativeMCPToolError.appApprovalDenied(bundleIdentifier: "inferred")
        let wrappedContext = NativeMCPErrorContext(targetID: nil, didTriggerServerUserFlow: false)
        let wrapped = NativeErrorWithCodexSpanTelemetry(underlyingError: underlying, codexSpanTelemetry: wrappedContext)
        let inferred = NativeMCPErrorResolution.resolve(underlying)
        equal(inferred.context, .init(targetID: "inferred", didTriggerServerUserFlow: true))
        let resolved = NativeMCPErrorResolution.resolve(wrapped)
        equal(resolved.error as? NativeMCPToolError, underlying)
        equal(resolved.context, wrappedContext)
        equal(resolved.context!.value, .object(["span": .object(["did_trigger_server_user_flow": .bool(false)])]))
        let explicit = NativeMCPErrorContext(targetID: "explicit", didTriggerServerUserFlow: true)
        equal(NativeMCPErrorResolution.resolve(wrapped, context: explicit).context, explicit)
        equal(NativeMCPErrorResolution.resolve(underlying, context: explicit).context, explicit)
        let outer = NativeErrorWithCodexSpanTelemetry(underlyingError: wrapped, codexSpanTelemetry: explicit)
        let nested = NativeMCPErrorResolution.resolve(outer)
        precondition(nested.error is NativeErrorWithCodexSpanTelemetry)
        equal(nested.context, explicit)
        precondition(NativeMCPErrorResolution.resolve(NativeMCPToolError.unknownTool("fixture")).context == nil)
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
