import AppKit

// 0x100705020..0x100705214. Do not clear the preference while a real
// VoiceOver application is running. Missing suite also skips notification.
func releaseVoiceOverOnPreference<Defaults>(isVoiceOverRunning: () -> Bool,
    makeDefaults: (String) -> Defaults?, setBoolean: (Defaults, Bool, String) -> Void,
    postNotification: (String) -> Void) {
    guard !isVoiceOverRunning(), let defaults = makeDefaults("com.apple.universalaccess") else { return }
    setBoolean(defaults, false, "voiceOverOnOffKey")
    postNotification("com.apple.universalaccess.VoiceOverSettingsDidChange")
}

func releaseSystemVoiceOverOnPreference() {
    releaseVoiceOverOnPreference(
        isVoiceOverRunning: { !NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.VoiceOver").isEmpty },
        makeDefaults: { UserDefaults(suiteName: $0) }, setBoolean: { $0.set($1, forKey: $2) },
        postNotification: { DistributedNotificationCenter().post(name: Notification.Name($0), object: nil) })
}
