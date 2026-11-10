import SwiftUI

// Native SlimCore.withAnimationDisabled at 0x101022ecc.
public func withAnimationDisabled<Result>(_ disabled: Bool,
    perform body: () throws -> Result
) rethrows -> Result {
    guard disabled else { return try body() }
    var transaction = SwiftUI.Transaction()
    transaction.animation = nil
    transaction.disablesAnimations = true
    return try SwiftUI.withTransaction(transaction, body)
}
