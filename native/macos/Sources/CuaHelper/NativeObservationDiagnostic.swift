import Foundation

// Local opt-in phase markers only. Never include AX text, image bytes, input
// payloads or error descriptions; logging must not affect operation semantics.
func withNativeObservationPhase<Result>(_ phase: String, pid: Int32,
    record: ([String: Any], String) -> Void = { recordNativeInputDiagnostic($0, event: $1) },
    work: () throws -> Result
) rethrows -> Result {
    let start = ProcessInfo.processInfo.systemUptime
    var data: [String: Any] = ["phase": phase, "pid": Int(pid), "state": "started"]
    record(data, "native.observation.phase")
    do {
        let result = try work()
        data["state"] = "completed"
        data["elapsedMs"] = (ProcessInfo.processInfo.systemUptime - start) * 1000
        record(data, "native.observation.phase")
        return result
    } catch {
        data["state"] = "failed"
        data["elapsedMs"] = (ProcessInfo.processInfo.systemUptime - start) * 1000
        data["errorCode"] = (error as? Failure)?.code ?? "NATIVE_OBSERVATION_ERROR"
        record(data, "native.observation.phase")
        throw error
    }
}

@MainActor
func withNativeAsyncObservationPhase<Result>(_ phase: String, pid: Int32,
    work: () async throws -> Result
) async rethrows -> Result {
    let start = ProcessInfo.processInfo.systemUptime
    var data: [String: Any] = ["phase": phase, "pid": Int(pid), "state": "started"]
    recordNativeInputDiagnostic(data, event: "native.observation.phase")
    do {
        let result = try await work()
        data["state"] = "completed"
        data["elapsedMs"] = (ProcessInfo.processInfo.systemUptime - start) * 1000
        recordNativeInputDiagnostic(data, event: "native.observation.phase")
        return result
    } catch {
        data["state"] = "failed"
        data["elapsedMs"] = (ProcessInfo.processInfo.systemUptime - start) * 1000
        data["errorCode"] = (error as? Failure)?.code ?? "NATIVE_OBSERVATION_ERROR"
        recordNativeInputDiagnostic(data, event: "native.observation.phase")
        throw error
    }
}
