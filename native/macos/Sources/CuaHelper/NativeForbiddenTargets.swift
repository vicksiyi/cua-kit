import Foundation

/// Normal classification branch of the pinned SystemSoftware implementation.
/// This does not read or modify the vendor's process-wide preference override.
enum NativeForbiddenTargets {
    static let terminals = [
        "com.apple.Terminal", "com.googlecode.iterm2", "org.alacritty",
        "dev.warp.Warp-Stable", "net.kovidgoyal.kitty", "co.zeit.hyper",
        "com.github.wez.wezterm", "org.tabby", "com.mitchellh.ghostty",
        "com.raphaelamorim.rio", "dev.commandline.waveterm",
    ]
    static let codex = [
        "com.openai.codex", "com.openai.codex.alpha", "com.openai.codex.beta",
        "com.openai.codex.dev", "com.openai.codex.nightly",
    ]
    static let chatGPT = [
        "com.openai.chat", "com.openai.chat.alpha", "com.openai.chat.beta",
        "com.openai.chat.nightly", "com.openai.chat.mac-debug",
    ]
    static let systemAuthentication = [
        "com.apple.UserNotificationCenter",
        "com.apple.LocalAuthenticationRemoteService", "com.apple.SecurityAgent",
    ]

    static func contains(_ bundleIdentifier: String) -> Bool {
        terminals.contains(bundleIdentifier) || codex.contains(bundleIdentifier)
            || chatGPT.contains(bundleIdentifier) || systemAuthentication.contains(bundleIdentifier)
    }
}
