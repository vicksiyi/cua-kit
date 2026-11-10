import Foundation

// Original shouldUseFullSkyshot(for:) 0x10023d3f0 → 0x10023f630.
// Uses Foundation URL.host and Swift Regex, not a domain suffix shortcut.
// Compiling this literal emits the exact _regexString/version representation
// stored at 0x101248b50, including the compiler's escaped source text.
private let fullSkyshotHostPattern = #/(?i)(?:^|\.)docs\.google\.[a-z.]+$/#

func shouldUseFullSkyshot(for url: URL) -> Bool {
    guard let host = url.host else { return false }
    return (try? fullSkyshotHostPattern.firstMatch(in: host)) != nil
}
