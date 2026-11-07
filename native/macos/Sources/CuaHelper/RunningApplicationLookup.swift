import Foundation

// 0x100260b44..<0x100260dc8. The process-query callback represents
// SAIRunningProcess.runningProcessesWithFilter with name:nil, executablePath
// from URL.path, options:1. SystemRunningApplicationLookup supplies the native bridge.
func resolvingApplicationProcessIdentifier(
    processIdentifier: () -> Int32,
    isTerminated: () -> Bool,
    executableURL: () -> URL?,
    matchingProcessIdentifiers: (String) -> [Int32]?
) -> Int32 {
    let pid = processIdentifier()
    if pid > 0 { return pid }
    guard !isTerminated(), let url = executableURL(),
          let matches = matchingProcessIdentifiers(url.path), matches.count == 1 else { return -1 }
    return matches[0]
}

// 0x10071e608..<0x10071e820. Only the first running application is
// selected. This lookup does not launch an app or retry another candidate.
func firstRunningApplicationElement<App, Element>(
    bundleIdentifier: String,
    runningApplications: (String) -> [App],
    resolveProcessIdentifier: (App) -> Int32,
    constructElement: (Int32) -> Element
) -> Element? {
    guard let app = runningApplications(bundleIdentifier).first else { return nil }
    return constructElement(resolveProcessIdentifier(app))
}
