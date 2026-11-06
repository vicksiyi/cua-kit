import Foundation

// Storage descriptor 0x101321a00; init 0x10065fb6c, trim 0x10065f7c0,
// compactConfigurationIfNeeded 0x10065fbfc, reset 0x1006604c8.
struct UIElementURLShortener {
    typealias Configuration = UIElementURLShortenerConfiguration
    var configuration: Configuration
    private var accumulated = 0
    private var domains: [String: Int] = [:]
    private var urls: Set<URL> = []

    init(configuration: Configuration) { self.configuration = configuration }

    mutating func trim(url: URL, isImage: Bool) -> String? {
        urls.insert(url)
        let result = trimUIElementURL(url, isImage: isImage,
            configuration: configuration, accumulated: &accumulated)
        if result.text != nil, let domain = result.domain {
            domains[domain, default: 0] += 1
        }
        return result.text
    }

    mutating func reset() {
        accumulated = 0
        urls.removeAll(keepingCapacity: true)
        domains.removeAll(keepingCapacity: true)
    }

    // Re-measures unique URLs, deliberately with isImage=false, into a LOCAL
    // counter. It does not overwrite accumulated or update domain counts.
    mutating func compactConfigurationIfNeeded() -> Int {
        if configuration.totalLimit == nil { configuration.totalLimit = 4000 }
        let limit = configuration.totalLimit!
        while true {
            var measured = 0
            for url in urls {
                _ = trimUIElementURL(url, isImage: false,
                    configuration: configuration, accumulated: &measured)
            }
            if measured <= limit || !compactConfiguration() { return measured }
        }
    }

    // Original helper 0x1006603ec receives (120,20,10) at its sole audited call.
    // One change per call: fragment, query, then the first strictly smaller
    // candidate in 120,110,...,20. Existing limits below 20 are not raised.
    private mutating func compactConfiguration() -> Bool {
        if configuration.includeFragment { configuration.includeFragment = false; return true }
        if configuration.includeQuery { configuration.includeQuery = false; return true }
        for candidate in stride(from: 120, through: 20, by: -10) {
            if configuration.individualLimit == nil || candidate < configuration.individualLimit! {
                configuration.individualLimit = candidate
                return true
            }
        }
        return false
    }
}
