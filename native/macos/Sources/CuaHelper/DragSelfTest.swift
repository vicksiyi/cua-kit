import Foundation
import ApplicationServices

@MainActor
func runDragChecks() async throws {
    let from = CGPoint(x:-400,y:90), to = CGPoint(x:-200,y:190)
    let events = try dragEvents(from:from,to:to)
    guard events.down.type == .leftMouseDown, events.down.location == from,
          events.up.type == .leftMouseUp, events.up.location == to, events.moves.count == 20,
          events.moves.first?.location == CGPoint(x:-390,y:95), events.moves.last?.location == to,
          events.moves.allSatisfy({$0.type == .leftMouseDragged && $0.getIntegerValueField(.mouseEventButtonNumber) == 0}) else {
        throw fail("SELF_TEST_FAILED","Drag construction differs.")
    }
    for cancelledAt in [0,1,10,20] {
        var posted: [(CGEventType,CGPoint)] = [], waits = 0
        let plan = try dragEvents(from:from,to:to)
        do {
            try await dispatchDrag(plan,post:{posted.append(($0.type,$0.location))},validate:{},wait:{
                if waits == cancelledAt { throw CancellationError() }; waits += 1
            })
            guard cancelledAt == 20 else { throw fail("SELF_TEST_FAILED","Cancellation unexpectedly succeeded.") }
        } catch let error as Failure { guard error.code == "ACTION_OUTCOME_UNKNOWN", cancelledAt < 20 else { throw error } }
        guard posted.count == cancelledAt+2, posted.first?.0 == .leftMouseDown, posted.last?.0 == .leftMouseUp,
              posted.last?.1 == (cancelledAt == 0 ? from : plan.moves[cancelledAt-1].location) else {
            throw fail("SELF_TEST_FAILED","Interrupted drag did not release at the last position.")
        }
    }
    var posted = 0, validations = 0
    do {
        try await dispatchDrag(events,post:{_ in posted += 1},validate:{throw fail("TARGET_NOT_FOUND","gone")},wait:{})
        throw fail("SELF_TEST_FAILED","Invalid initial target accepted.")
    } catch let error as Failure { guard error.code == "TARGET_NOT_FOUND", posted == 0 else { throw error } }
    do {
        try await dispatchDrag(events,post:{_ in posted += 1},validate:{
            validations += 1
            if validations > 1 { throw fail("TARGET_NOT_FOUND","reused") }
        },wait:{})
        throw fail("SELF_TEST_FAILED","Invalidated target accepted.")
    } catch let error as Failure { guard error.code == "ACTION_OUTCOME_UNKNOWN", posted == 1 else { throw error } }
    do { _ = try dragEvents(from:CGPoint(x:CGFloat.nan,y:0),to:to); throw fail("SELF_TEST_FAILED","NaN accepted.") }
    catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
}
