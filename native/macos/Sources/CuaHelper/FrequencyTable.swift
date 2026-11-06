// AccessibilitySupport.FrequencyTable<Metric>, recovered from its stored
// Dictionary and increment/subscript/isUnique native function bodies.
struct FrequencyTable<Metric: Hashable> {
    private var metricToFrequency: [Metric: Int] = [:]

    init() {}

    mutating func increment(_ metric: Metric) {
        // Ordinary checked addition matches the source's overflow trap.
        metricToFrequency[metric] = (metricToFrequency[metric] ?? 0) + 1
    }

    subscript(_ metric: Metric) -> Int {
        metricToFrequency[metric] ?? 0
    }

    func isUnique(_ metric: Metric) -> Bool {
        metricToFrequency[metric] == 1
    }
}
