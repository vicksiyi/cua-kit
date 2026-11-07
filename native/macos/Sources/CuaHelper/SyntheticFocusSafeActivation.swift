// Branch at 0x10074195c..0x100741a14. The frontmost application is captured
// once and retained across the restoration branch. Nil/same-PID cases perform
// direct enforcement; they do not prepare restoration resources or query AX.
func safelyEnforceSyntheticFocus<Application>(targetPID: Int32,
    frontmostApplication: () -> Application?, processIdentifier: (Application) -> Int32,
    enforce: () throws -> Void, restoreOtherApplication: (Application) async throws -> Void
) async throws {
    guard let saved = frontmostApplication(), processIdentifier(saved) != targetPID else {
        try enforce()
        return
    }
    try await restoreOtherApplication(saved)
}
