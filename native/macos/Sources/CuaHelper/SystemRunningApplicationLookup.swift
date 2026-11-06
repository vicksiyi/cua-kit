import AppKit
import ApplicationServices
import RunningProcess

func systemResolvedProcessIdentifier(_ app: NSRunningApplication) -> Int32 {
    resolvingApplicationProcessIdentifier(
        processIdentifier: { app.processIdentifier },
        isTerminated: { app.isTerminated },
        executableURL: { app.executableURL },
        matchingProcessIdentifiers: { path in
            let filter = SAIRunningProcessFilter(name: nil, executablePath: path, options: 1)
            return SAIRunningProcess.runningProcesses(with: filter)?.map { $0.pid }
        })
}

// Lookup only, not an application-launch or policy-authorizing API.
// The current transaction is supplied explicitly until TaskLocal is restored.
func systemRunningApplicationElement(
    bundleIdentifier: String, transaction: UIElementTransactionCache?
) -> UIElement? {
    firstRunningApplicationElement(bundleIdentifier: bundleIdentifier,
        runningApplications: { NSRunningApplication.runningApplications(withBundleIdentifier: $0) },
        resolveProcessIdentifier: systemResolvedProcessIdentifier,
        constructElement: { UIElement(systemElement: AXUIElementCreateApplication($0), transaction: transaction) })
}
