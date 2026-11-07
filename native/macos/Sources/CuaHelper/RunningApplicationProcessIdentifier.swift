import AppKit
import RunningProcess

// 0x100260b44: positive raw PID wins without further reads. Otherwise a
// nonterminated app with an executable URL is resolved by a current-user path
// filter, and only exactly one match succeeds. No first-match/dedup fallback.
func resolveRunningApplicationProcessIdentifier(rawPID: Int32,
    isTerminated: () -> Bool, executablePath: () -> String?,
    matchingProcessIDs: (String) -> [Int32]?) -> Int32 {
    if rawPID > 0 { return rawPID }
    guard !isTerminated(), let path = executablePath(),
          let matches = matchingProcessIDs(path), matches.count == 1 else { return -1 }
    return matches[0]
}

func systemResolvedRunningApplicationPID(_ application: NSRunningApplication) -> Int32 {
    resolveRunningApplicationProcessIdentifier(rawPID: application.processIdentifier,
        isTerminated: { application.isTerminated }, executablePath: { application.executableURL?.path },
        matchingProcessIDs: { path in
            let filter = SAIRunningProcessFilter(name: nil, executablePath: path, options: 1)
            return SAIRunningProcess.runningProcesses(with: filter)?.map { $0.pid }
        })
}
