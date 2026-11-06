import Foundation

/// Value and lookup order recovered from SystemSoftware's CLI locator.
/// Resolving this value does not launch a process or change any policy.
struct NativeCLILaunchConfiguration: Equatable {
    let executableURL: URL
    let argumentPrefix: [String]

    func appServerArguments(disablePlugins: Bool) -> [String] {
        argumentPrefix + ["app-server", "--listen", "stdio://"]
            + (disablePlugins ? ["--config", "features.plugins=false"] : [])
    }
}

enum NativeCLIExecutableLocator {
    struct RunningApplication {
        let bundleIdentifier: String?
        let bundleURL: URL?
    }
    static let bundledPaths = [
        "Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
        "Contents/Resources/codex",
    ]

    static func launchConfiguration(environment: [String: String],
                                    runningApplications: [RunningApplication],
                                    fallbackBundleURLs: [URL],
                                    isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }) -> NativeCLILaunchConfiguration {
        if let raw = environment["CODEX_CLI_PATH"] {
            let path = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !path.isEmpty, isExecutable(path) {
                return .init(executableURL: URL(fileURLWithPath: path), argumentPrefix: [])
            }
        }
        let runningURLs = runningApplications.compactMap { app -> URL? in
            guard let id = app.bundleIdentifier, NativeForbiddenTargets.codex.contains(id) else { return nil }
            return app.bundleURL
        }
        // Preserve candidate order and duplicates; do not search all first-path
        // candidates before trying the second path in an earlier bundle.
        for bundle in runningURLs + fallbackBundleURLs {
            for path in bundledPaths {
                let candidate = bundle.appendingPathComponent(path, isDirectory: false)
                if isExecutable(candidate.path) {
                    return .init(executableURL: candidate, argumentPrefix: [])
                }
            }
        }
        return .init(executableURL: URL(fileURLWithPath: "/usr/bin/env"), argumentPrefix: ["codex"])
    }
}
