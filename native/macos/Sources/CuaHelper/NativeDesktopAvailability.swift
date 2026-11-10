import ApplicationServices

// Native wire already distinguishes screenLocked (-10020). Reject before
// initializing AX window traversal: locked-session providers may expose cycles.
func requireUnlockedNativeDesktop(
    readSession: () -> [String: Any] = { CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:] }
) throws {
    if readSession()["CGSSessionScreenIsLocked"] as? Bool == true {
        throw fail("SCREEN_LOCKED", "The desktop is locked. Unlock it before observing or operating applications.")
    }
}
