// Original nested Configuration, descriptor 0x1012c9d3c. Exposed through
// UIElementURLShortener.Configuration; standalone name supports isolated tests.
struct UIElementURLShortenerConfiguration: Equatable {
    var individualLimit: Int?
    var totalLimit: Int?
    var includeQuery: Bool
    var includeFragment: Bool

    // 0x10065fae0..<0x10065fb6c releases baseHost without storing it.
    // Do not infer a host-rewriting option from the public parameter name.
    init(individualLimit: Int?, totalLimit: Int?, includeQuery: Bool,
         includeFragment: Bool, baseHost: String?) {
        self.individualLimit = individualLimit
        self.totalLimit = totalLimit
        self.includeQuery = includeQuery
        self.includeFragment = includeFragment
    }
}
