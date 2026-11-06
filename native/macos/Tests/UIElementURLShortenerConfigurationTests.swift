@main
struct UIElementURLShortenerConfigurationTests {
    static func main() {
        let limits: [Int?] = [nil, -1, 0, 1, Int.max]
        for individual in limits { for total in limits {
            for query in [false, true] { for fragment in [false, true] {
                let config = UIElementURLShortenerConfiguration(individualLimit: individual,
                    totalLimit: total, includeQuery: query, includeFragment: fragment, baseHost: nil)
                precondition(config.individualLimit == individual && config.totalLimit == total)
                precondition(config.includeQuery == query && config.includeFragment == fragment)
                let otherHost = UIElementURLShortenerConfiguration(individualLimit: individual,
                    totalLimit: total, includeQuery: query, includeFragment: fragment, baseHost: "example.invalid")
                precondition(config == otherHost)
                var modified = config
                modified.includeQuery.toggle()
                precondition(modified != config)
                modified = config
                modified.includeFragment.toggle()
                precondition(modified != config)
            } }
        } }
        print("shortener configuration preserves raw limits, flags and discarded baseHost")
    }
}
