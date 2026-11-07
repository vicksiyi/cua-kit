import Foundation
import ApplicationServices

@main struct Test {
    enum Failure: Error { case invalid }
    static func main() {
        func value(_ raw: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let role = UIElementAttribute("AXRole")
        var table: [AXUIElement: [UIElementAttribute: AXPartialValue]] = [:]
        for (index, name) in ["AXButton", "AXButton", "AXWindow", "CustomRole", ""].enumerated() {
            table[AXUIElementCreateApplication(pid_t(10000 + index))] = [role: value(name as NSString)]
        }
        table[AXUIElementCreateApplication(10006)] = [:]
        table[AXUIElementCreateApplication(10007)] = [UIElementAttribute("AXSubrole"): value("AXButton" as NSString)]
        table[AXUIElementCreateApplication(10008)] = [role: value(NSNull())]
        let result = uiElementRoleFrequencies(table)
        precondition(result[.button] == 2 && !result.isUnique(.button))
        for role in [UIElementRole.window, UIElementRole("CustomRole"), UIElementRole("")] {
            precondition(result[role] == 1 && result.isUnique(role))
        }
        precondition(result[.unknown] == 0 && !result.isUnique(.unknown))
        precondition(uiElementRoleFrequencies([:])[.button] == 0)
        var counts = FrequencyTable<UIElementRole>()
        for _ in 0..<4 { counts.increment(.button) }
        var calls = 0
        accumulateUIElementRoleFrequencies(table, into: &counts, decodeString: { raw in
            calls += 1
            if raw is NSNull { throw Failure.invalid }
            return raw as? String
        })
        precondition(calls == 6 && counts[.button] == 6 && counts[.unknown] == 0)
        print("Role frequencies preserve raw names, accumulation and missing or failed decoding")
    }
}
