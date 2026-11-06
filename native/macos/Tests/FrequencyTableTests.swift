import Foundation

@main
struct FrequencyTableTests {
    struct Metric: Hashable {
        let value: String
        func hash(into hasher: inout Hasher) { hasher.combine(0) }
    }
    static func main() {
        var roles = FrequencyTable<String>()
        precondition(roles["AXButton"] == 0 && !roles.isUnique("AXButton"))
        roles.increment("AXButton")
        precondition(roles["AXButton"] == 1 && roles.isUnique("AXButton"))
        roles.increment("AXTextField")
        roles.increment("AXButton")
        precondition(roles["AXButton"] == 2 && !roles.isUnique("AXButton"))
        precondition(roles["AXTextField"] == 1 && roles.isUnique("AXTextField"))
        precondition(roles["axbutton"] == 0 && !roles.isUnique("axbutton"))
        // Value semantics: transaction copies cannot share mutable counts by accident.
        var copied = roles
        copied.increment("AXTextField")
        precondition(copied["AXTextField"] == 2 && roles["AXTextField"] == 1)
        var collisions = FrequencyTable<Metric>()
        let a = Metric(value: "a"), b = Metric(value: "b")
        collisions.increment(a)
        collisions.increment(b)
        collisions.increment(Metric(value: "a"))
        precondition(collisions[a] == 2 && collisions[b] == 1 && collisions.isUnique(b))
        let missing = Metric(value: "missing")
        precondition(collisions[missing] == 0 && !collisions.isUnique(missing))
        print("native frequency table preserves counts, uniqueness, collisions and value semantics")
    }
}
