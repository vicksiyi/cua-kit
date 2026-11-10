// Native sleep continuations 0x1007c96c8/0x1007c9764: discard sleep errors,
// then load weak owner, check Task cancellation, and re-register with zero delay.
// The scheduling entry point below supplies the native continuous clock and weak capture.
@MainActor
public func resumeDelayedAnimationRegistration<Owner: AnyObject>(
    sleep: () async throws -> Void, owner: () -> Owner?,
    register: (Owner, Duration) -> Void
) async {
    try? await sleep()
    guard let owner = owner(), !Task.isCancelled else { return }
    register(owner, .zero)
}

// Registration 0x1007c91c4 and task body 0x1007c958c: positive delays use
// an unstructured MainActor task with inherited priority. The task retains the
// animation, not its owner; no task handle is stored by the native handler.
@MainActor
public func scheduleDelayedAnimationRegistration<Owner: AnyObject>(
    owner: Owner, animation: any Animation, delay: Duration,
    register: @escaping @MainActor (Owner, any Animation, Duration) -> Void
) {
    Task { @MainActor [weak owner, animation] in
        await resumeDelayedAnimationRegistration(
            sleep: { try await ContinuousClock.continuous.sleep(for: delay) },
            owner: { owner },
            register: { register($0, animation, $1) })
    }
}
