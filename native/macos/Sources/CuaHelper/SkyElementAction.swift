import Foundation

/// Decode the observed Swift-enum JSON produced by the original Sky JS client.
/// IDs address our native snapshot; this is not the original AX ID allocator.
func decodeSkyElementAction(_ action: [String: Any]) throws -> [String: Any] {
    guard action.count == 1, let name = action.keys.first,
          let value = action[name] as? [String: Any] else {
        throw SkyRPCFailure(code: -32602, message: "Expected one Computer Use action")
    }
    if name == "click" || name == "scroll" {
        func number(_ raw: Any?, _ label: String) throws -> Double {
            guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else {
                throw SkyRPCFailure(code: -32602, message: "Pointer action requires finite numeric \(label)")
            }
            return n.doubleValue
        }
        guard let at = value["at"] as? [String: Any], at.count == 1 else {
            throw SkyRPCFailure(code: -32602, message: "Pointer action requires one element or coordinate target")
        }
        var params: [String: Any] = ["operation": name]
        if let target = at["elementID"] as? [String: Any], let text = target["_0"] as? String,
           let id = Int(text), id > 0, String(id) == text { params["elementId"] = id }
        else if let target = at["coordinate"] as? [String: Any], let point = target["_0"] as? [Any], point.count == 2 {
            params["x"] = try number(point[0], "x"); params["y"] = try number(point[1], "y")
        } else { throw SkyRPCFailure(code: -32602, message: "Invalid pointer action target") }
        if name == "scroll" {
            guard let direction = value["direction"] as? String, ["up","down","left","right"].contains(direction) else {
                throw SkyRPCFailure(code: -32602, message: "Invalid scroll direction")
            }
            let pages = try number(value["pages"], "pages")
            guard pages > 0 else { throw SkyRPCFailure(code: -32602, message: "Scroll pages must be positive") }
            params["direction"] = direction; params["pages"] = pages
            return params
        }
        let button = try number(value["mouseButton"], "mouseButton")
        guard [0.0,1.0,2.0].contains(button) else { throw SkyRPCFailure(code: -32602, message: "Unknown mouse button") }
        params["mouseButton"] = ["left","right","middle"][Int(button)]
        let count = try number(value["clickCount"], "clickCount")
        guard count.rounded() == count, (1...10).contains(count) else { throw SkyRPCFailure(code: -32602, message: "Click count must be 1..10") }
        params["clickCount"] = Int(count)
        let duration = try value["duration"].map { try number($0,"duration") } ?? 0
        _ = try heldNanoseconds(duration); params["duration"] = duration
        if let key = value["key"] {
            guard let key = key as? String else { throw SkyRPCFailure(code: -32602, message: "Click key must be a modifier chord") }
            _ = try mouseModifiers(key); params["key"] = key
        }
        return params
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
    let scroll = try decodeSkyElementAction(["scroll": ["at": ["elementID": ["_0": "3"]], "direction": "right", "pages": 0.5]])
    guard scroll["elementId"] as? Int == 3, scroll["pages"] as? Double == 0.5 else { throw fail("SELF_TEST_FAILED", "Scroll target/page mapping differs") }
    let wheel = try scrollEvents(point:CGPoint(x:10,y:20),viewport:CGRect(x:0,y:0,width:200,height:100),direction:scroll["direction"] as! String,pages:scroll["pages"] as! Double)
    guard wheel.reduce(Int64(0),{$0 + $1.getIntegerValueField(.scrollWheelEventPointDeltaAxis2)}) == -100,
          wheel.allSatisfy({$0.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == 0}) else { throw fail("SELF_TEST_FAILED", "Scroll mapping used wrong axis/distance") }

    let click = try decodeSkyElementAction(["click": ["at": ["coordinate": ["_0": [12.5,24.0]]], "mouseButton": 2, "clickCount": 2, "duration": 0.125, "key": "Shift"]])
    guard click["x"] as? Double == 12.5, click["y"] as? Double == 24, click["mouseButton"] as? String == "middle", click["clickCount"] as? Int == 2, click["duration"] as? Double == 0.125 else { throw fail("SELF_TEST_FAILED", "Click payload mapping differs") }
    let events = try mouseClickEvents(point: CGPoint(x: click["x"] as! Double,y:click["y"] as! Double),button:click["mouseButton"] as! String,count:click["clickCount"] as! Int,flags:mouseModifiers(click["key"] as? String))
    guard events.count == 4, events[0].type == .otherMouseDown, events[3].type == .otherMouseUp else { throw fail("SELF_TEST_FAILED", "Mapped click produced incorrect events") }

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
