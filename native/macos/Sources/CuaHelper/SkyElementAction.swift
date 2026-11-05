import Foundation

/// Decode the observed Swift-enum JSON produced by the original Sky JS client.
/// IDs address our native snapshot; this is not the original AX ID allocator.
func decodeSkyElementAction(_ action: [String: Any]) throws -> [String: Any] {
    guard action.count == 1, let name = action.keys.first,
          let value = action[name] as? [String: Any] else {
        throw SkyRPCFailure(code: -32602, message: "Expected one Computer Use action")
    }
    if name == "type" {
        guard let text = value["_0"] as? String, text.utf16.count <= 100000 else {
            throw SkyRPCFailure(code: -32602, message: "type requires bounded Unicode text")
        }
        return ["operation": "typeText", "text": text]
    }
    if name == "pressKey" {
        guard let key = value["_0"] as? String, !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw SkyRPCFailure(code: -32602, message: "pressKey requires a key chord")
        }
        var seconds = 0.0
        if let duration = value["duration"] {
            guard let number = duration as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else {
                throw SkyRPCFailure(code: -32602, message: "duration must be numeric seconds")
            }
            seconds = number.doubleValue
        }
        _ = try heldNanoseconds(seconds)
        _ = try parseKey(key)
        return ["operation": "pressKey", "key": key, "durationMs": seconds * 1000]
    }
    guard ["setValue", "selectText", "performSecondaryAction"].contains(name) else {
        throw SkyRPCFailure(code: -10004, message: "This native action is not implemented")
    }
    guard let encoded = value["elementID"] as? String,
          let id = Int(encoded), id > 0, String(id) == encoded else {
        throw SkyRPCFailure(code: -32602, message: "Action requires an element ID from the current native observation")
    }
    func string(_ key: String) throws -> String {
        guard let text = value[key] as? String else { throw SkyRPCFailure(code: -32602, message: "Action requires string \(key)") }
        return text
    }
    var params: [String: Any] = ["elementId": id]
    switch name {
    case "setValue":
        params["operation"] = "setValue"; params["value"] = try string("value")
    case "selectText":
        params["operation"] = "selectText"; params["value"] = try string("text")
        for key in ["prefix", "suffix"] where value[key] != nil { params[key] = try string(key) }
        let selection = try string("selection")
        guard ["text", "cursor_before", "cursor_after"].contains(selection) else {
            throw SkyRPCFailure(code: -32602, message: "Unknown text selection mode")
        }
        params["selectionType"] = selection
    default:
        params["operation"] = "secondary"; params["value"] = try string("action")
    }
    return params
}

func runSkyActionChecks() throws {
    let selected = try decodeSkyElementAction(["selectText": ["elementID": "2", "text": "🌍", "selection": "text", "prefix": "hello "]])
    guard let text = selected["value"] as? String else { throw fail("SELF_TEST_FAILED", "Selection text did not reach native value field") }
    let range = try selectedTextRange(content: "hello 🌍 world", text: text, options: selected)
    guard range.location == 6, range.length == 2 else { throw fail("SELF_TEST_FAILED", "Selection mapping changed UTF-16 range") }
    let key = try decodeSkyElementAction(["pressKey": ["_0": "Super+a", "duration": 0.125]])
    guard key["durationMs"] as? Double == 125, key["operation"] as? String == "pressKey" else { throw fail("SELF_TEST_FAILED", "Key duration unit conversion differs") }
    let typed = try decodeSkyElementAction(["type": ["_0": "🌍"]])
    guard typed["text"] as? String == "🌍", unicodeChunks(typed["text"] as! String).flatMap({$0}).count == 2 else { throw fail("SELF_TEST_FAILED", "Unicode payload changed") }
    for invalid: Any in [true, "0.5", -1.0, 31.0] {
        do { _ = try decodeSkyElementAction(["pressKey": ["_0": "a", "duration": invalid]]); throw fail("SELF_TEST_FAILED", "Invalid duration accepted") }
        catch is SkyRPCFailure {} catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
    }
}
