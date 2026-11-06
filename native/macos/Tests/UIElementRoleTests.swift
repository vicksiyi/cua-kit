import Foundation

@main
struct UIElementRoleTests {
    static func main() {
        let first = CFStringCreateCopy(nil, "AXWindow" as CFString)!
        let second = CFStringCreateMutableCopy(nil, 0, "AXWindow" as CFString)!
        let role = UIElementRole(first), equivalent = UIElementRole(second)
        precondition(role.name === first && equivalent.name === second)
        precondition(role == equivalent && role.rawValue == "AXWindow")
        precondition(role != UIElementRole("axwindow"))
        let custom = UIElementRole("自定义角色🙂")
        precondition(custom.rawValue == "自定义角色🙂")
        var h1 = Hasher(); var h2 = h1
        role.hash(into: &h1); first.hash(into: &h2)
        precondition(h1.finalize() == h2.finalize())
        var frequency = FrequencyTable<UIElementRole>()
        precondition(frequency[role] == 0 && !frequency.isUnique(role))
        frequency.increment(role)
        precondition(frequency.isUnique(equivalent))
        var snapshot = frequency
        frequency.increment(equivalent)
        precondition(frequency[role] == 2 && !frequency.isUnique(role))
        precondition(snapshot[role] == 1 && snapshot.isUnique(role))
        snapshot.increment(custom)
        precondition(snapshot.isUnique(custom) && frequency[custom] == 0)
        print("native role identity and role frequency composition passed")
    }
}
