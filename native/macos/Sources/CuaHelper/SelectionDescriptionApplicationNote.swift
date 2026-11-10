// Final llmDescription branch0x100239300..3b0. This is presentation guidance,
// not an automatic URL rewrite or an action on the application's links.
func selectionDescriptionText(_ presentation: AccessibilityTreePresentation,
    bundleIdentifier: String?) -> String {
    guard bundleIdentifier == "com.spotify.client" else { return presentation.text }
    return presentation.text + "\n\nNote: In order to be usable, Spotify app links must be rewritten as regular links (e.g. use open.spotify.com instead of xpui.app.spotify.com). Only use Spotify links that are written verbatim in the UI above. Note that IDs are only valid with their associated type (e.g. you cannot change an \"album\" URL to a \"track\" URL)."
}
