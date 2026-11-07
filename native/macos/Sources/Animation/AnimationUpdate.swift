// Source descriptor 0x1012cd958 and timing helpers 0x1007c2b90/0x1007c2ba8.
public struct AnimationUpdate: Equatable {
    public let timestamp: Double
    public let duration: Double
    public let targetTimestamp: Double
    public init(timestamp: Double, duration: Double, targetTimestamp: Double) {
        self.timestamp = timestamp; self.duration = duration; self.targetTimestamp = targetTimestamp
    }
    public init(timestamp: Double, duration: Double) {
        self.init(timestamp: timestamp, duration: duration, targetTimestamp: timestamp + duration)
    }
    public func targetRunningTime(from startTime: Double?) -> Double? {
        startTime.map { targetTimestamp - $0 }
    }
}
