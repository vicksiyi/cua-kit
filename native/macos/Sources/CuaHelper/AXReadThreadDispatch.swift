import Foundation

// 0x1006fa0d4 queries actualPID, reports a failure and returns nil. It must
// not substitute the public pid getter when that private/provider query fails.
func resolvedAXReadProcessID(readActualPID: () throws -> Int32,
    reportError: (Error) -> Void
) -> Int32? {
    do { return try readActualPID() }
    catch { reportError(error); return nil }
}

// Preserve getpid -> actualPID -> conditional isMainThread -> read ordering.
// Only a known same-process target off the main thread needs synchronous dispatch.
func dispatchAXRead<Value>(
    currentPID: () -> Int32,
    readActualPID: () throws -> Int32,
    reportError: (Error) -> Void,
    isMainThread: () -> Bool,
    onMain: (() -> Value) -> Value,
    read: () -> Value
) -> Value {
    let ownPID = currentPID()
    let targetPID = resolvedAXReadProcessID(readActualPID: readActualPID, reportError: reportError)
    if targetPID == ownPID && !isMainThread() { return withoutActuallyEscaping(read) { work in onMain(work) } }
    return read()
}
