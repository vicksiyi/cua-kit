// Native coordinator 0x1007caa1c: store completion, append transaction,
// invoke body, then removeLast only on success. At 0x1007cac24 an error
// branches directly to the epilogue, bypassing stack removal. Do not replace
// this with defer cleanup: that changes the recovered throwing behavior.
public func performAnimationTransaction<Result>(
    _ transaction: Transaction,
    storeCompletion: (Transaction) -> Void,
    append: (Transaction) -> Void, removeLast: () -> Void,
    body: () throws -> Result
) rethrows -> Result {
    storeCompletion(transaction)
    append(transaction)
    let result = try body()
    removeLast()
    return result
}
