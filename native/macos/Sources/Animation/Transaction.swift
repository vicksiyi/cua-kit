import Foundation

// Native descriptor 0x1012ce4fc and constructor 0x1007eb58c. The driver
// source is unowned (swift_unknownObjectUnownedInit), not strongly retained.
public struct Transaction {
    public struct Priority: Comparable {
        public let rawValue: Int
        public init(_ rawValue: Int) { self.rawValue = rawValue }
        public static let low = Self(250)
        public static let `default` = Self(500)
        public static let high = Self(750)
        public static let required = Self(1000)
        public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    public var priority: Priority
    public var delay: Duration
    public var completion: ((AnimationState) -> Void)?
    public let id: UUID
    public unowned let driverSource: any AnimationDriverSource
    public let descriptor: AnimationDescriptor?

    public init(driverSource: any AnimationDriverSource, descriptor: AnimationDescriptor?,
        priority: Priority, delay: Duration, completion: ((AnimationState) -> Void)?) {
        id = UUID()
        self.driverSource = driverSource
        self.descriptor = descriptor
        self.priority = priority
        self.delay = delay
        self.completion = completion
    }
    // 0x1007eb6a4 delegates synchronously to the shared coordinator.
    @MainActor public func perform<Result>(_ body: () throws -> Result) rethrows -> Result {
        try AnimationCoordinator.shared.perform(self, body: body)
    }
    // debugDescription and transaction selection/animation registration pending.
}
