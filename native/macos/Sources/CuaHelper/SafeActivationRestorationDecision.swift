// Decision at 0x100742968..0x1007429fc. This is the final restoration
// gate, after foreground/window restoration attempts, not the whole loop.
enum SafeActivationRestorationDecision: Equatable {
    case complete
    case pollAgain
    case timedOut
}

enum SafeActivationTiming {
    // Pinned doubles at 0x10115b8d8 and 0x101159db8.
    static let reactivationInterval = 0.05
    static let quietInterval = 0.1
    static let timeout = 2.0
    // Immediate signed 128-bit Duration payload at 0x100742a30..a3c.
    static let pollInterval: Duration = .milliseconds(10)
}

func safeActivationRestorationDecision(
    savedApplicationIsFrontmost: Bool,
    requiresPairedNotifications: Bool,
    requiresQuietPeriod: Bool,
    observation: SafeActivationObservedEvents,
    elapsed: Double,
    now: () -> Double
) -> SafeActivationRestorationDecision {
    if savedApplicationIsFrontmost {
        let pairReceived = observation.transitionFlags & 0x100 != 0 && observation.targetResignObserved
        if requiresPairedNotifications && !pairReceived {
            return !(elapsed < SafeActivationTiming.timeout) ? .timedOut : .pollAgain
        }
        if !requiresQuietPeriod || now() - observation.lastEventTime >= SafeActivationTiming.quietInterval {
            return .complete
        }
    }
    return !(elapsed < SafeActivationTiming.timeout) ? .timedOut : .pollAgain
}
