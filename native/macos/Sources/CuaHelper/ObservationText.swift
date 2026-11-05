import Foundation

// Independent native rendering. Original Sky JS receives already-rendered skyshot.text.
func observationText(elements: [[String: Any]], warnings: [String], screenshotAvailable: Bool) throws -> String {
    func json(_ value: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys, .withoutEscapingSlashes])
        guard let text = String(data: data, encoding: .utf8) else { throw fail("PROVIDER_DISCONNECTED", "Invalid observation text encoding") }
        return text
    }
    let lines = try elements.map { element -> String in
        guard let id = element["id"] as? Int, let role = element["role"] as? String, let name = element["name"] as? String else {
            throw fail("PROVIDER_DISCONNECTED", "Invalid native observation element")
        }
        var fields = ["[\(id)]", role, try json(name)]
        if let parent = element["parentId"] as? Int { fields.append("parent=[\(parent)]") }
        let properties = element["properties"] as? [String: Any]
        if let value = element["value"], properties?["secure"] as? Bool != true { fields.append("value=\(try json(value))") }
        if let frame = element["frame"] { fields.append("frame=\(try json(frame))") }
        if let properties = properties { fields.append("properties=\(try json(properties))") }
        return fields.joined(separator: " ")
    }
    return ([lines.joined(separator: "\n")] + warnings.map { "Warning: \($0)" } + (screenshotAvailable ? [] : ["Screenshot unavailable: Screen Recording permission is not granted."])).joined(separator: "\n")
}

func runObservationTextChecks() throws {
    let elements: [[String: Any]] = [
        ["id":1,"role":"AXWindow","name":"Editor"],
        ["id":2,"parentId":1,"role":"AXTextField","name":"名\"字","value":"draft\n🌍","frame":["x":-20,"width":200],"properties":["secure":false,"actions":"AXShowMenu","AXFocused":false,"selectionLength":2]],
        ["id":3,"parentId":1,"role":"AXSecureTextField","name":"Password","value":"must-not-leak","properties":["secure":true]],
    ]
    let text = try observationText(elements: elements, warnings: ["truncated"], screenshotAvailable: false)
    for required in ["parent=[1]", "AXShowMenu", "AXFocused", "selectionLength", "-20", "draft\\n🌍", "Warning: truncated", "Screenshot unavailable"] {
        guard text.contains(required) else { throw fail("SELF_TEST_FAILED", "Missing native observation field: \(required)") }
    }
    guard !text.contains("must-not-leak") else { throw fail("SELF_TEST_FAILED", "Secure value leaked into native text") }
    guard try observationText(elements: [], warnings: [], screenshotAvailable: true) == "" else { throw fail("SELF_TEST_FAILED", "Empty observation differs") }
}
