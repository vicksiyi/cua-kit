import Foundation
import MCP

@main struct NativeAppApprovalResponseTests {
    static func main() async throws {
        let tests = Self()
        tests.testNativeServerErrorMapping()
        try tests.testIPCInterruptionSelectionAndWireShape()
        try await tests.testApprovalFailureBecomesNativeWireResult()
        try tests.testVendorToolResultSurvivesCodecAndContextMerge()
        tests.testErrorContextPreservesUserFlowDistinction()
        tests.testErrorContextPrecedenceAndSingleUnwrap()
        try tests.testResultContextMergePreservesPayloadAndUnknownMetadata()
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

    func testResultContextMergePreservesPayloadAndUnknownMetadata() throws {
        // Decode through the SDK so the fixture checks wire fields as well as Swift values.
        let raw = #"{"content":[{"type":"text","text":"failure"},{"type":"image","data":"AA==","mimeType":"image/png"}],"structuredContent":{"fixture":true},"isError":true,"_meta":{"progressToken":"running","other":{"keep":42},"codex/telemetry":{"old":true}}}"#
        let input = try JSONDecoder().decode(CallTool.Result.self, from: Data(raw.utf8))
        equal(NativeMCPResultContext.applying(nil, to: input), input)
        let context = NativeMCPErrorContext(targetID: "fixture.app", didTriggerServerUserFlow: true)
        let output = NativeMCPResultContext.applying(context, to: input)
        equal(output.content, input.content)
        equal(output.structuredContent, input.structuredContent)
        equal(output.isError, input.isError)
        equal(output._meta?["other"], input._meta?["other"])
        equal(output._meta?["codex/telemetry"], context.value)
        precondition(output._meta?["progressToken"] == nil)
        equal(input._meta?.progressToken, .string("running"))
        equal(input._meta?["codex/telemetry"], .object(["old": .bool(true)]))
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(output)) as! [String: Any]
        let meta = encoded["_meta"] as! [String: Any]
        precondition(meta["progressToken"] == nil && meta["other"] != nil)
        let span = (meta["codex/telemetry"] as! [String: Any])["span"] as! [String: Any]
        precondition(span["target_id"] as? String == "fixture.app")
        precondition(span["did_trigger_server_user_flow"] as? Bool == true)
        let absent = CallTool.Result(content: [])
        equal(NativeMCPResultContext.applying(nil, to: absent), absent)
        let added = NativeMCPResultContext.applying(context, to: absent)
        equal(added._meta?.fields, ["codex/telemetry": context.value])
        precondition(added.isError == nil && added.structuredContent == nil && added.content.isEmpty)
        // Clearing the token is unconditional once context exists, even for an invalid token shape.
        let malformed = try JSONDecoder().decode(CallTool.Result.self,
            from: Data(#"{"content":[],"_meta":{"progressToken":{"invalid":true}}}"#.utf8))
        precondition(NativeMCPResultContext.applying(context, to: malformed)._meta?["progressToken"] == nil)
    }

    func testVendorToolResultSurvivesCodecAndContextMerge() throws {
        let raw = #"{"content":[{"type":"text","text":"outer"}],"isError":true,"toolResult":{"content":[{"type":"text","text":"inner"}],"isError":false},"_meta":{"progressToken":9,"keep":true}}"#
        let original = try JSONDecoder().decode(NativeCallToolResult.self, from: Data(raw.utf8))
        equal(original.toolResult?.isError, false)
        equal(original.result.isError, true)
        equal(original.toolResult?.content?.count, 1)
        equal(NativeMCPResultContext.applying(nil, to: original), original)
        let updated = NativeMCPResultContext.applying(.init(targetID: nil, didTriggerServerUserFlow: true), to: original)
        equal(updated.toolResult, original.toolResult)
        equal(updated.result.content, original.result.content)
        precondition(updated.result._meta?["progressToken"] == nil)
        equal(updated.result._meta?["keep"], .bool(true))
        let encoded = try JSONEncoder().encode(updated)
        let object = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
        let nested = object["toolResult"] as! [String: Any]
        precondition(nested["isError"] as? Bool == false)
        equal(try JSONDecoder().decode(NativeCallToolResult.self, from: encoded), updated)
        for suffix in ["", #", "toolResult":null"#] {
            let absent = try JSONDecoder().decode(NativeCallToolResult.self, from: Data("{\"content\":[]\(suffix)}".utf8))
            precondition(absent.toolResult == nil)
            let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(absent)) as! [String: Any]
            precondition(object["toolResult"] == nil)
        }
        let empty = try JSONDecoder().decode(NativeCallToolResult.self, from: Data(#"{"content":[],"toolResult":{}}"#.utf8))
        precondition(empty.toolResult != nil && empty.toolResult?.content == nil && empty.toolResult?.isError == nil)
        for value in ["[]", "true", #"{"content":false}"#, #"{"isError":"false"}"#] {
            do {
                _ = try JSONDecoder().decode(NativeCallToolResult.self, from: Data("{\"content\":[],\"toolResult\":\(value)}".utf8))
                fatalError("Malformed nested result accepted")
            } catch {}
        }
    }

    func testApprovalFailureBecomesNativeWireResult() async throws {
        let store = NativeAppApprovalStore(storageURL: nil)
        for (action, expected) in [
            ("decline", NativeMCPToolError.appApprovalDenied(bundleIdentifier: "fixture.app")),
            ("cancel", NativeMCPToolError.appApprovalCanceled(bundleIdentifier: "fixture.app")),
            ("accept", NativeMCPToolError.appApprovalPersistenceUnavailable(bundleIdentifier: "fixture.app"))
        ] {
            let response = try JSONDecoder().decode(CreateElicitation.Result.self,
                from: Data("{\"action\":\"\(action)\",\"_meta\":{\"persist\":\"always\"}}".utf8))
            do {
                try await NativeAppApprovalResponse.record(response, bundleIdentifier: "fixture.app", store: store)
                fatalError("Approval path should throw")
            } catch let error as NativeMCPToolError {
                equal(error, expected)
                let resolved = NativeMCPErrorResolution.resolve(error)
                let result = NativeCallToolResult.genericFailure(resolved.error, context: resolved.context)
                let data = try JSONEncoder().encode(result)
                let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
                precondition(object["isError"] as? Bool == true)
                precondition(object["toolResult"] == nil && object["structuredContent"] == nil)
                let content = object["content"] as! [[String: Any]]
                precondition(content.count == 1 && content[0]["type"] as? String == "text")
                equal(content[0]["text"] as? String, expected.description)
                let meta = object["_meta"] as! [String: Any]
                let span = (meta["codex/telemetry"] as! [String: Any])["span"] as! [String: Any]
                precondition(span["did_trigger_server_user_flow"] as? Bool == true)
                equal(try JSONDecoder().decode(NativeCallToolResult.self, from: data), result)
            }
        }
        // A non-contextual argument error has no invented metadata.
        let result = NativeCallToolResult.genericFailure(NativeMCPToolError.invalidArgument("exact\n原因"))
        equal(result.result.content, [.text("exact\n原因")])
        precondition(result.result._meta == nil)
    }

    func testIPCInterruptionSelectionAndWireShape() throws {
        let selected: [NativeIPCClientError] = [
            .noActiveSession(app: "fixture.app"), .userStoppedSession(app: "fixture.app"),
            .userIntervened(message: "user\n介入"), .screenLocked(message: "locked"), .permissionsPending
        ]
        for error in selected {
            let result = NativeCallToolResult.interruption(error)!
            let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(result)) as! [String: Any]
            precondition(object["isError"] == nil && object["toolResult"] == nil && object["_meta"] == nil)
            let content = object["content"] as! [[String: Any]]
            precondition(content.count == 1 && content[0]["type"] as? String == "text")
            equal(content[0]["text"] as? String, error.interruptionDescription)
        }
        equal(selected[2].interruptionDescription, "user\n介入")
        equal(selected[3].interruptionDescription, "locked")
        precondition(selected[0].interruptionDescription!.contains("'fixture.app'"))
        equal(NativeIPCClientError.userStoppedSession(app: "different").interruptionDescription,
              selected[1].interruptionDescription)
        let excluded: [NativeIPCClientError] = [
            .serverError(errorNumber: -1, errorString: "failure"), .invalidApp("fixture"),
            .ambiguousApp(message: "ambiguous"), .appNotAllowed(bundleIdentifier: "fixture"),
            .runningApplicationNotFound(bundleIdentifier: "fixture"), .accessibilityError(.failure),
            .blockedURL(url: "https://example.test"), .messagesInvalidRequest("invalid"),
            .messagesAmbiguousDestination("ambiguous"), .messagesSendPlanUnavailable(.missing),
            .messagesSendRateLimited(message: "limited"), .calendarInvalidRequest("invalid"),
            .couldNotFindServiceApp, .permissionsNotGranted, .turnEnded, .messagesPermissionsPending,
            .messagesPermissionsDenied, .messagesQueryTimedOut, .messagesSendOutcomeUncertain,
            .calendarPermissionsPending, .calendarPermissionsDenied
        ]
        for error in excluded { precondition(NativeCallToolResult.interruption(error) == nil) }
        let context = NativeMCPErrorContext(targetID: "fixture", didTriggerServerUserFlow: true)
        let withContext = NativeCallToolResult.interruption(.permissionsPending, context: context)!
        equal(withContext.result._meta?["codex/telemetry"], context.value)
        precondition(withContext.result.isError == nil)
        equal(NativeIPCClientError.SendPlanUnavailableReason.alreadyConsumed.rawValue, "already_consumed")
    }

    func testNativeServerErrorMapping() {
        let payload = "fixture\n原始说明"
        let cases: [(Int32, NativeIPCClientError)] = [
            (-10006, .appNotAllowed(bundleIdentifier: payload)), (-10007, .runningApplicationNotFound(bundleIdentifier: payload)),
            (-10009, .permissionsNotGranted), (-10010, .invalidApp(payload)), (-10011, .noActiveSession(app: payload)),
            (-10012, .userStoppedSession(app: payload)), (-10014, .permissionsPending), (-10015, .blockedURL(url: payload)),
            (-10016, .userIntervened(message: payload)), (-10018, .ambiguousApp(message: payload)),
            (-10020, .screenLocked(message: payload)), (-10021, .turnEnded), (-10022, .messagesPermissionsPending),
            (-10023, .messagesPermissionsDenied), (-10024, .messagesQueryTimedOut), (-10025, .messagesInvalidRequest(payload)),
            (-10026, .messagesAmbiguousDestination(payload)), (-10028, .messagesSendOutcomeUncertain),
            (-10029, .messagesSendRateLimited(message: payload)), (-10030, .calendarPermissionsPending),
            (-10031, .calendarPermissionsDenied), (-10032, .calendarInvalidRequest(payload))
        ]
        for (number, expected) in cases {
            equal(NativeIPCClientError.mappedServerError(errorNumber: number, errorString: payload), expected)
            do {
                try NativeIPCClientError.throwMappedServerError(errorNumber: number, errorString: payload)
                fatalError("Mapper must throw")
            } catch let error as NativeIPCClientError { equal(error, expected) }
            catch { fatalError("Wrong error type") }
        }
        for number: Int32 in [-10033, -10019, -10017, -10013, -10005, 0, Int32.min, Int32.max] {
            equal(NativeIPCClientError.mappedServerError(errorNumber: number, errorString: payload),
                  .serverError(errorNumber: number, errorString: payload))
        }
        for reason in [NativeIPCClientError.SendPlanUnavailableReason.missing, .expired, .alreadyConsumed] {
            equal(NativeIPCClientError.mappedServerError(errorNumber: -10027, errorString: reason.rawValue),
                  .messagesSendPlanUnavailable(reason))
        }
        for value in ["", "MISSING", " missing", "alreadyConsumed", "unknown"] {
            equal(NativeIPCClientError.mappedServerError(errorNumber: -10027, errorString: value),
                  .serverError(errorNumber: -10027, errorString: value))
        }
        for value in ["-25200", "+25200", "0", "-2147483648", "2147483647", "00042"] {
            let mapped = NativeIPCClientError.mappedServerError(errorNumber: -10008, errorString: value)
            guard case let .accessibilityError(error) = mapped else { fatalError("Int32 not parsed") }
            equal(error.rawValue, Int32(value)!)
        }
        for value in ["", "+", "-", " 1", "1\n", "1.0", "2147483648", "-2147483649", "１２"] {
            equal(NativeIPCClientError.mappedServerError(errorNumber: -10008, errorString: value),
                  .serverError(errorNumber: -10008, errorString: value))
        }
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
