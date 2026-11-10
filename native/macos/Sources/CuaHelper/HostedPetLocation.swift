import CoreGraphics
import Foundation

// Native shared Optional<CGPoint> at0x101550708. Written by
// RemoteHostedPIPContentPublisher.setPetLocationWithX, not by cursor ticks.
@MainActor
enum HostedPetLocation {
    private(set) static var point: CGPoint?

    // Recovered main-actor body0x1001f62c0. Full XPC/Task wrapper is separate.
    static func set(x: Double, y: Double, available: Bool, reply: (Error?) -> Void) {
        point = available ? CGPoint(x: x, y: y) : nil
        reply(nil)
    }

    // Publisher lifecycle clear at0x1001f0638..0x1001f0644.
    static func clear() { point = nil }
}
