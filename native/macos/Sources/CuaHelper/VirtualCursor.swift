// Source protocol descriptor 0x1012cd810 and ComputerUseCursor witness table
// 0x10146f030: class-constrained, writable Bool and async throwing count press.
// The source convenience body obtains MainActor and returns on its executor.
@MainActor
protocol VirtualCursor: AnyObject {
    var isPressed: Bool { get set }
    func press(count: Int) async throws
}

extension VirtualCursor {
    // 0x1007c1cc4: delegate exactly once with count 1. No visual state changes,
    // retries, delays or error suppression are added by this convenience API.
    func press() async throws { try await press(count: 1) }
}
