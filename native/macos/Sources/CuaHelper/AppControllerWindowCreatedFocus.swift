// Control Center branch at 0x10006def4..0x10006e06c. Use the existing
// observer/enforcer only; a new window does not create either resource.
func prepareAppControllerWindowCreatedFocus(bundleIdentifier: String,
    registerDestroyed: (() throws -> Void)?, actualPID: () throws -> Int32,
    startSuppressingMenuDismissal: (Int32?) -> Void) {
    guard bundleIdentifier == "com.apple.controlcenter" else { return }
    if let registerDestroyed { try? registerDestroyed() }
    let menuPID = try? actualPID()
    startSuppressingMenuDismissal(menuPID)
}
