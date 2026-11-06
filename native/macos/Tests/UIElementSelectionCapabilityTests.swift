@main
struct UIElementSelectionCapabilityTests {
    static func main() {
        for role in [UIElementRole.menuItem, .menuBarItem, .button, .unknown, UIElementRole("custom")] {
            for writable in [false, true] {
                var calls = 0
                let result = uiElementIsSelectable(role: role) { calls += 1; return writable }
                let excluded = role == .menuItem || role == .menuBarItem
                precondition(result == (!excluded && writable))
                precondition(calls == (excluded ? 0 : 1))
            }
        }
        print("native selection capability excludes menu roles before attribute queries")
    }
}
