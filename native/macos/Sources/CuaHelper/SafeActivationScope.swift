// Resource order and error precedence from safelyEnforceActiveState:
// setup 0x100741df4..0x100741f28; cleanup 0x100742b24..0x100742ca0.
// Native updates return CGError but this caller ignores it. These operations
// therefore remain nonthrowing. Actual SPI binding/connection ownership is
// supplied by the enclosing native scope, not silently emulated here.
struct SafeActivationScopeOperations {
    var startForegroundMonitoring: () -> Void
    var startTargetMonitoring: () -> Void
    var installTargetObserver: () -> Void
    var disableUpdates: () -> Void
    var reenableUpdates: () -> Void
    var clearTargetObserver: () -> Void
    var stopTargetMonitoring: () -> Void
    var stopForegroundMonitoring: () -> Void
}

func withSafeActivationRestoration(
    operations: SafeActivationScopeOperations,
    enforce: () throws -> Void,
    restore: (Error?) async throws -> Void
) async throws {
    operations.startForegroundMonitoring()
    operations.startTargetMonitoring()
    operations.installTargetObserver()
    operations.disableUpdates()
    defer {
        operations.reenableUpdates()
        operations.clearTargetObserver()
        operations.stopTargetMonitoring()
        operations.stopForegroundMonitoring()
    }
    var enforcementError: Error?
    do { try enforce() } catch { enforcementError = error }
    // Restore even when enforcement failed. Source carries its original error
    // through restoration and prefers it over a subsequent polling/cancel error.
    do { try await restore(enforcementError) }
    catch { throw enforcementError ?? error }
    if let enforcementError { throw enforcementError }
}
