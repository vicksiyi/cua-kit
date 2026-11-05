import Foundation
import ApplicationServices

func heldNanoseconds(_ seconds: Double) throws -> UInt64 {
    guard seconds.isFinite, seconds >= 0, seconds <= 30 else { throw fail("INVALID_ARGUMENT","Input duration must be 0..30 seconds.") }
    return UInt64((seconds * 1_000_000_000).rounded())
}
// Same cooperative cleanup strategy as drag: release only to the original process.
@MainActor
func dispatchHeldPair(_ down: CGEvent, _ up: CGEvent, nanoseconds: UInt64,
                      post: (CGEvent)->Void, validate: () throws -> Void,
                      wait: (UInt64) async throws -> Void) async throws {
    try Task.checkCancellation()
    try validate()
    post(down)
    defer { if (try? validate()) != nil { post(up) } }
    do {
        if nanoseconds > 0 { try await wait(nanoseconds) }
        try validate()
    } catch {
        throw fail("ACTION_OUTCOME_UNKNOWN","Held input interrupted after dispatch; observe before retrying.")
    }
}
@MainActor
func runHeldInputChecks() async throws {
    guard try heldNanoseconds(0) == 0, try heldNanoseconds(0.125) == 125_000_000, try heldNanoseconds(30) == 30_000_000_000 else { throw fail("SELF_TEST_FAILED","Hold conversion differs.") }
    for duration in [-1,30.001,Double.nan,Double.infinity] {
        do { _ = try heldNanoseconds(duration); throw fail("SELF_TEST_FAILED","Invalid hold accepted.") }
        catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
    }
    let events = try mouseClickEvents(point:CGPoint(x:1,y:2),button:"left",count:1,flags:[])
    for interrupted in [false,true] {
        var posted:[CGEventType] = [], waited:UInt64 = 0
        do {
            try await dispatchHeldPair(events[0],events[1],nanoseconds:125_000_000,post:{posted.append($0.type)},validate:{},wait:{value in
                waited=value; if interrupted { throw CancellationError() }
            })
            guard !interrupted else { throw fail("SELF_TEST_FAILED","Interruption lost.") }
        } catch let error as Failure { guard interrupted, error.code == "ACTION_OUTCOME_UNKNOWN" else { throw error } }
        guard waited == 125_000_000, posted == [.leftMouseDown,.leftMouseUp] else { throw fail("SELF_TEST_FAILED","Held input did not release.") }
    }
    var posted=0,checks=0
    do {
        try await dispatchHeldPair(events[0],events[1],nanoseconds:1,post:{_ in posted += 1},validate:{checks += 1;if checks>1{throw fail("TARGET_NOT_FOUND","reused")}},wait:{_ in})
        throw fail("SELF_TEST_FAILED","Changed identity accepted.")
    } catch let error as Failure { guard error.code == "ACTION_OUTCOME_UNKNOWN",posted == 1 else { throw error } }
}
