import Foundation
private final class FixtureFailure: Error {}

@main struct NativeAppPolicyEvaluationTests {
    @MainActor static func main() async throws {
        let policy = try NativeComputerUsePolicy.parse(requirementsResponse: ["requirements": NSNull()], configResponse: ["config": [:]])
        var events = [String]()
        let evaluation = NativeAppPolicyEvaluation(resolve: { reference in
            events.append("resolve:\(reference)")
            return NativeApplicationTarget(bundleIdentifier: "example.fixture", bundleURL: URL(fileURLWithPath: "/fixture/app.app"))
        }, loadPolicy: { events.append("policy"); return policy })
        let result = try await evaluation.evaluate("app")
        precondition(events == ["resolve:app", "policy"])
        precondition(result.decision == .allowed && result.bundleIdentifier == "example.fixture")
        precondition(result.ipcObject["decision"] as? String == "allowed")
        let original = FixtureFailure()
        let unresolved = NativeAppPolicyEvaluation(resolve: { _ in throw original }, loadPolicy: { preconditionFailure("No policy fetch before successful resolution") })
        do { _ = try await unresolved.evaluate("bad"); preconditionFailure("Expected resolution error") }
        catch { precondition(error as AnyObject === original) }
        let unavailable = NativeAppPolicyEvaluation(resolve: evaluation.resolve, loadPolicy: { throw original })
        do { _ = try await unavailable.evaluate("app"); preconditionFailure("Expected provider error") }
        catch { precondition(error as AnyObject === original) }
        let denied = try NativeComputerUsePolicy.parse(requirementsResponse: ["requirements": ["computerUse": ["defaultAppAccess": "deny"]]], configResponse: ["config": [:]])
        let blocked = NativeAppPolicyEvaluation(resolve: evaluation.resolve, loadPolicy: { denied })
        let blockedResult = try await blocked.evaluate("app")
        precondition(blockedResult.decision == .denied)
        print("native app policy evaluation ordering, decisions and failure propagation passed")
    }
}
