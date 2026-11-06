import Foundation

@main struct NativeCLILaunchConfigurationTests {
    static func main() throws {
        let first = URL(fileURLWithPath: "/fixture/first.app"), second = URL(fileURLWithPath: "/fixture/second.app")
        let suffixes = NativeCLIExecutableLocator.bundledPaths
        let running: [NativeCLIExecutableLocator.RunningApplication] = [
            .init(bundleIdentifier: "other", bundleURL: first),
            .init(bundleIdentifier: nil, bundleURL: first),
            .init(bundleIdentifier: "com.openai.codex", bundleURL: nil),
            .init(bundleIdentifier: "com.openai.codex.beta", bundleURL: first),
            .init(bundleIdentifier: "com.openai.codex", bundleURL: second),
        ]
        var probes = [String]()
        let explicit = NativeCLIExecutableLocator.launchConfiguration(environment: ["CODEX_CLI_PATH": " \n/tmp/explicit\t"],
            runningApplications: running, fallbackBundleURLs: [second], isExecutable: { probes.append($0); return true })
        precondition(explicit.executableURL.path == "/tmp/explicit" && explicit.argumentPrefix.isEmpty)
        precondition(probes == ["/tmp/explicit"])
        for override in ["", " \n", "/missing"] {
            probes = []
            let expected = first.appendingPathComponent(suffixes[1], isDirectory: false)
            let actual = NativeCLIExecutableLocator.launchConfiguration(environment: ["CODEX_CLI_PATH": override],
                runningApplications: running, fallbackBundleURLs: [second], isExecutable: {
                    probes.append($0); return $0 == expected.path
                })
            precondition(actual.executableURL == expected && actual.argumentPrefix.isEmpty)
            precondition(probes == (override == "/missing" ? ["/missing"] : []) + suffixes.map { first.appendingPathComponent($0).path })
        }
        probes = []
        let fallback = NativeCLIExecutableLocator.launchConfiguration(environment: [:], runningApplications: running,
            fallbackBundleURLs: [first], isExecutable: { probes.append($0); return false })
        precondition(probes == [first, second, first].flatMap { bundle in suffixes.map { bundle.appendingPathComponent($0).path } })
        precondition(fallback == .init(executableURL: URL(fileURLWithPath: "/usr/bin/env"), argumentPrefix: ["codex"]))
        precondition(fallback.appServerArguments(disablePlugins: false) == ["codex", "app-server", "--listen", "stdio://"])
        precondition(explicit.appServerArguments(disablePlugins: true) == ["app-server", "--listen", "stdio://", "--config", "features.plugins=false"])
        // Real filesystem permission probing; fixture is never executed.
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("fixture")
        try Data("fixture".utf8).write(to: file)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        let denied = NativeCLIExecutableLocator.launchConfiguration(environment: ["CODEX_CLI_PATH": file.path], runningApplications: [], fallbackBundleURLs: [])
        precondition(denied.argumentPrefix == ["codex"])
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: file.path)
        let allowed = NativeCLIExecutableLocator.launchConfiguration(environment: ["CODEX_CLI_PATH": file.path], runningApplications: [], fallbackBundleURLs: [])
        precondition(allowed.executableURL == file && allowed.argumentPrefix.isEmpty)
        print("native CLI locator precedence, executable checks and app-server arguments passed")
    }
}
