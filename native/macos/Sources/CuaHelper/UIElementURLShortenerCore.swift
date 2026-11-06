import Foundation

// Core 0x10065fde4..<0x1006603ec. The enclosing shortener owns URL/domain
// bookkeeping and compaction; this function owns formatting and accumulation.
func trimUIElementURL(
    _ url: URL, isImage: Bool, configuration: UIElementURLShortenerConfiguration,
    accumulated: inout Int
) -> (domain: String?, text: String?) {
    guard let scheme = url.scheme?.lowercased(), scheme != "webdoc", scheme != "data",
          !isImage else { return (nil, nil) }
    // File URLs bypass component rewriting and both length budgets.
    if url.isFileURL { return (nil, url.absoluteString) }
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return (nil, nil) }
    if components.scheme == "https" || components.scheme == "http" { components.scheme = nil }
    var domain = components.host
    if var host = domain {
        if host.hasPrefix("www.") { host.removeFirst(4) }
        domain = host
        components.host = host
    }
    // The original checks serialization once before applying query/fragment
    // settings and once after, then removes the leading authority slashes.
    guard components.string != nil else { return (nil, nil) }
    if !configuration.includeQuery { components.query = nil }
    if !configuration.includeFragment { components.fragment = nil }
    guard var text = components.string else { return (nil, nil) }
    if text.hasPrefix("//") { text.removeFirst(2) }
    if let limit = configuration.individualLimit,
       text.index(text.startIndex, offsetBy: limit + 1, limitedBy: text.endIndex) != nil {
        text = String(text.prefix(limit - 1)) + "…"
    }
    let count = text.count
    if let limit = configuration.totalLimit, accumulated + count > limit {
        accumulated += 1
        return (domain, "…")
    }
    accumulated += count
    return (domain, text)
}
