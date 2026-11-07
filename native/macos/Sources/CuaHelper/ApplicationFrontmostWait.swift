import Foundation

// 0x10070e2b0 / 0x10070eb0c: test elapsed <= timeout before each AX read.
// Missing/false AXFrontmost keeps polling every 0.1s. Sleep failure (including
// cancellation) ends this nonthrowing wait rather than retrying or escaping.
func waitUntilApplicationBelievesItIsFrontmost(timeout: Double,
    elapsed: () -> Double, readFrontmost: () -> Bool?,
    sleep: (Duration) async throws -> Void) async {
    while elapsed() <= timeout {
        if readFrontmost() == true { return }
        do { try await sleep(.milliseconds(100)) } catch { return }
    }
}

extension UIElement {
    func waitUntilAppBelievesItIsFrontmost(timeout: Double, reportError: (Error) -> Void) async {
        let clock = ContinuousClock(), start = ContinuousClock.now
        await waitUntilApplicationBelievesItIsFrontmost(timeout: timeout, elapsed: {
            let duration = start.duration(to: clock.now).components
            return Double(duration.seconds) + Double(duration.attoseconds) / 1e18
        }, readFrontmost: {
            self.booleanValue(for: UIElementAttribute("AXFrontmost"), ignoringTypeMismatch: true,
                reportError: reportError)
        }, sleep: { try await Task.sleep(for: $0) })
    }
}
