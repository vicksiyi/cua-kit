import Foundation

@main struct RunningApplicationLookupTests {
    static func main() {
        for pid: Int32 in [-1, 0, 12] {
            for terminated in [false, true] {
                for hasURL in [false, true] {
                    for matches: [Int32]? in [nil, [], [42], [42, 43], [-1]] {
                        var calls: [String] = []
                        let actual = resolvingApplicationProcessIdentifier(
                            processIdentifier: { calls.append("pid"); return pid },
                            isTerminated: { calls.append("terminated"); return terminated },
                            executableURL: { calls.append("url"); return hasURL ? URL(fileURLWithPath: "/Applications/A B.app/Contents/MacOS/A B") : nil },
                            matchingProcessIdentifiers: { path in
                                precondition(path == "/Applications/A B.app/Contents/MacOS/A B")
                                calls.append("query"); return matches
                            })
                        if pid > 0 { precondition(actual == pid && calls == ["pid"]) }
                        else if terminated { precondition(actual == -1 && calls == ["pid", "terminated"]) }
                        else if !hasURL { precondition(actual == -1 && calls == ["pid", "terminated", "url"]) }
                        else {
                            precondition(actual == (matches?.count == 1 ? matches![0] : -1))
                            precondition(calls == ["pid", "terminated", "url", "query"])
                        }
                    }
                }
            }
        }
        for candidates in [[], [7], [7, 8]] {
            var calls: [String] = []
            let result: Int32? = firstRunningApplicationElement(bundleIdentifier: "com.apple.Chess",
                runningApplications: { id in precondition(id == "com.apple.Chess"); calls.append("lookup"); return candidates },
                resolveProcessIdentifier: { app in precondition(app == 7); calls.append("resolve"); return -1 },
                constructElement: { pid in calls.append("construct"); return pid })
            precondition(result == (candidates.isEmpty ? nil : -1))
            precondition(calls == (candidates.isEmpty ? ["lookup"] : ["lookup", "resolve", "construct"]))
        }
        print("Running application lookup and PID fallback preserve ordering and cardinality")
    }
}
