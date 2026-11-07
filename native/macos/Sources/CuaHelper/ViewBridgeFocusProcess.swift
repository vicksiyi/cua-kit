import RunningProcess

// 0x10075246c: reuse restored Objective-C process enumeration/filter semantics.
// Preserve first-match order, options=1, and absent result for no matches.
func viewBridgeAuxiliaryFocusPID() -> Int32? {
    let filter = SAIRunningProcessFilter(name: "ViewBridgeAuxiliary", options: 1)
    return SAIRunningProcess.runningProcesses(with: filter)?.first?.pid
}
