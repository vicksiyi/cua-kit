import AppKit

// 0x100701b4c..0x100701e04. A missing suite or already-true preference is
// not acquired. Browser reset selection is distinct from context eligibility.
func enableVoiceOverOnPreference<Defaults>(bundleIdentifier: String,
    makeDefaults: (String) -> Defaults?, readBoolean: (Defaults, String) -> Bool,
    setBoolean: (Defaults, Bool, String) -> Void, postNotification: (String) -> Void,
    startReset: (Defaults) -> Void) -> Bool {
    guard let defaults = makeDefaults("com.apple.universalaccess"), !readBoolean(defaults, "voiceOverOnOffKey") else { return false }
    setBoolean(defaults, true, "voiceOverOnOffKey")
    postNotification("com.apple.universalaccess.VoiceOverSettingsDidChange")
    if bundleIdentifier == "company.thebrowser.Browser" || bundleIdentifier == "company.thebrowser.dia" || bundleIdentifier.hasPrefix("com.openai.atlas") {
        startReset(defaults)
    }
    return true
}

// 0x1007039d0..0x100703be8: ordinary unstructured Task<Void, Error> inherits
// task locals. Sleep 100 ms with ContinuousClock; cancellation/error propagates
// through its task result and skips the false write. No notification is posted
// by this delayed write, and dropping the task handle does not cancel it.
func startVoiceOverPreferenceResetTask(
    sleep: @escaping (Duration) async throws -> Void = { try await Task.sleep(for: $0, clock: .continuous) },
    setFalse: @escaping () -> Void) -> Task<Void, Error> {
    Task {
        try await sleep(.milliseconds(100))
        setFalse()
    }
}

func enableSystemVoiceOverOnPreference(bundleIdentifier: String) -> Bool {
    enableVoiceOverOnPreference(bundleIdentifier: bundleIdentifier, makeDefaults: { UserDefaults(suiteName: $0) },
        readBoolean: { $0.bool(forKey: $1) }, setBoolean: { $0.set($1, forKey: $2) },
        postNotification: { DistributedNotificationCenter().post(name: Notification.Name($0), object: nil) },
        startReset: { defaults in
            _ = startVoiceOverPreferenceResetTask { defaults.set(false, forKey: "voiceOverOnOffKey") }
        })
}
