import Foundation
import Darwin

@main struct NativeJSONRPCConnectionTests {
    static func peer() throws {
        var methods = [String]()
        while true {
            var bytes = Data()
            while let byte = try FileHandle.standardInput.read(upToCount: 1), !byte.isEmpty {
                if byte.first == 10 { break }
                bytes.append(byte)
            }
            if bytes.isEmpty { return }
            let request = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
            let method = request["method"] as! String
            methods.append(method)
            var result: [String: Any] = [:]
            switch method {
            case "initialize":
                precondition(methods == ["initialize"])
                let params = request["params"] as! [String: Any]
                precondition((params["clientInfo"] as? [String: String])?["name"] == "core-test")
            case "configRequirements/read":
                precondition(methods == ["initialize", "configRequirements/read"])
                precondition(request["params"] == nil)
                result = ["requirements": ["computerUse": ["defaultAppAccess": "deny",
                    "macos": ["bundleIds": ["example.fixture": "allow"]]]]]
            case "config/read":
                precondition(methods == ["initialize", "configRequirements/read", "config/read"])
                precondition((request["params"] as? [String: Any])?["includeLayers"] as? Bool == false)
                result = ["config": [:]]
            case "inspect": result = ["pid": getpid()]
            case "exit": return
            case "ignore": continue
            default: preconditionFailure("Unexpected method")
            }
            var response = try JSONSerialization.data(withJSONObject: ["id": request["id"]!, "result": result])
            response.append(10)
            try FileHandle.standardOutput.write(contentsOf: response)
        }
    }
    static func waitForExit(_ pid: Int32) async throws {
        for _ in 0..<300 {
            if kill(pid, 0) == -1 && errno == ESRCH { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        preconditionFailure("Owned fixture process did not exit")
    }
    static func main() async throws {
        if CommandLine.arguments.contains("--peer") { try peer(); return }
        let executable = URL(fileURLWithPath: CommandLine.arguments[0])
        func make(_ timeout: TimeInterval = 3) throws -> NativeJSONRPCConnection {
            try NativeJSONRPCConnection(executableURL: executable, arguments: ["--peer"], timeout: timeout)
        }
        let policy = try await NativeAppPolicyFetch.fetch(timeout: 3, makeConnection: { timeout, disablePlugins in
            precondition(!disablePlugins)
            return try make(timeout)
        }, clientInfo: { ["name": "core-test"] })
        precondition(policy.allowsApplication(bundleIdentifier: "example.fixture"))
        precondition(!policy.allowsApplication(bundleIdentifier: "example.other"))

        var connection: NativeJSONRPCConnection? = try make()
        weak var weakConnection = connection
        let info = try await connection!.request(method: "inspect", params: nil)
        let pid = Int32(info["pid"] as! Int)
        connection = nil
        precondition(weakConnection == nil)
        try await waitForExit(pid)

        let closed = try make()
        let closedPID = Int32(try await closed.request(method: "inspect", params: nil)["pid"] as! Int)
        closed.close(); closed.close()
        do { _ = try await closed.request(method: "inspect", params: nil); preconditionFailure("Expected closed") }
        catch { precondition(error is NativeJSONRPCRequestWriter.WriteError) }
        try await waitForExit(closedPID)

        let exited = try make()
        defer { exited.close() }
        do { _ = try await exited.request(method: "exit", params: nil); preconditionFailure("Expected EOF") }
        catch { precondition(error is NativeJSONRPCRequestWriter.WriteError) }

        let timed = try make(0.1)
        defer { timed.close() }
        do { _ = try await timed.request(method: "ignore", params: nil); preconditionFailure("Expected timeout") }
        catch { precondition(error as? NativeJSONRPCMessageReader.ReadError == .requestTimedOut("ignore")) }
        // Timeout does not itself close the connection or finish its reader.
        let recovered = try await timed.request(method: "inspect", params: nil)
        precondition(recovered["pid"] is Int)
        do {
            _ = try NativeJSONRPCConnection(executableURL: executable.appendingPathComponent("missing"), arguments: [], timeout: 1)
            preconditionFailure("Expected launch failure")
        } catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        print("native JSON-RPC connection process lifecycle and policy-fetch integration passed")
    }
}
