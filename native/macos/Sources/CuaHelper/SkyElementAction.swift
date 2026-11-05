import Foundation

/// Decode the observed Swift-enum JSON produced by the original Sky JS client.
/// IDs address our native snapshot; this is not the original AX ID allocator.
func decodeSkyElementAction(_ action: [String: Any]) throws -> [String: Any] {
    guard action.count == 1, let name = action.keys.first,
          let value = action[name] as? [String: Any] else {
        throw SkyRPCFailure(code: -32602, message: "Expected one Computer Use action")
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
        params["operation"] = "selectText"; params["text"] = try string("text")
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
