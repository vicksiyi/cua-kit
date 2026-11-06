@main
struct UIElementFlattenedRoleTests {
    static func main() {
        for name in ["AXStaticText", "AXTextField", "AXTextArea", "AXImage", "AXGroup", "AXUnknown", "", "axstatictext"] {
            var reads = 0
            let result = uiElementFlattenedRole(role: {
                reads += 1; return UIElementRole(name)
            })
            precondition(reads == 1)
            if name == "AXStaticText" {
                precondition(result?.separator == " ")
                precondition(result?.description == "text")
                precondition(result?.targetDescription == "text")
            } else { precondition(result == nil) }
        }
        let text = UIElementFlattenedRole(separator: " ", description: "text", targetDescription: "text")
        precondition(text != UIElementFlattenedRole(separator: "", description: "text", targetDescription: "text"))
        precondition(text != UIElementFlattenedRole(separator: " ", description: "other", targetDescription: "text"))
        precondition(text != UIElementFlattenedRole(separator: " ", description: "text", targetDescription: "other"))
        print("flattened role reads once, preserves static text literals and rejects other roles")
    }
}
