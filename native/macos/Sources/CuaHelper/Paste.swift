import Foundation
import ApplicationServices

// Native paste currently verifies textual AX editors. Custom editors without an AX value/range
// must not receive a success claim merely because Command+V was posted.
func replacingSelection(_ value: String, _ range: CFRange, with text: String) throws -> String {
    let original = value as NSString
    guard range.location >= 0, range.length >= 0, range.location <= original.length,
          range.length <= original.length-range.location else { throw fail("INVALID_ARGUMENT","Invalid UTF-16 selection range.") }
    let units = Array(value.utf16)
    func splitsPair(_ offset: Int) -> Bool {
        offset > 0 && offset < units.count && (0xD800...0xDBFF).contains(units[offset-1]) && (0xDC00...0xDFFF).contains(units[offset])
    }
    guard !splitsPair(range.location), !splitsPair(range.location+range.length) else { throw fail("INVALID_ARGUMENT","Selection splits a Unicode surrogate pair.") }
    return original.replacingCharacters(in:NSRange(location:range.location,length:range.length),with:text)
}
@MainActor
extension Target {
    func pasteEditor(_ params: [String:Any]) throws -> (AXUIElement,String,[String]) {
        try validateSnapshot(params)
        guard let text = params["text"] as? String, text.utf16.count <= 200000 else { throw fail("INVALID_ARGUMENT","Paste text exceeds budget.") }
        guard let raw = attribute(root,kAXFocusedUIElementAttribute), CFGetTypeID(raw) == AXUIElementGetTypeID() else { throw fail("ELEMENT_NOT_INTERACTABLE","Focus a textual editor before paste.") }
        let editor = raw as! AXUIElement
        var pid: pid_t = 0
        guard AXUIElementGetPid(editor,&pid) == .success, pid == app.processIdentifier else { throw fail("TARGET_NOT_FOUND","Paste editor belongs to another process.") }
        guard string(editor,kAXSubroleAttribute) != "AXSecureTextField" else { throw fail("UNSUPPORTED_CAPABILITY","Secure fields cannot provide paste verification.") }
        guard let value = attribute(editor,kAXValueAttribute) as? String,
              let selected = attribute(editor,kAXSelectedTextRangeAttribute), CFGetTypeID(selected) == AXValueGetTypeID() else { throw fail("UNSUPPORTED_CAPABILITY","Native paste requires readable AXValue and AXSelectedTextRange.") }
        var range = CFRange()
        guard AXValueGetValue(selected as! AXValue,.cfRange,&range) else { throw fail("UNSUPPORTED_CAPABILITY","Cannot decode editor selection.") }
        var candidates = [try replacingSelection(value,range,with:text)]
        if let richText = params["richText"] as? String {
            guard richText.utf16.count <= 200000 else { throw fail("INVALID_ARGUMENT","Rich paste text exceeds budget.") }
            candidates.append(try replacingSelection(value,range,with:richText))
        }
        return (editor,value,candidates)
    }
    func pasteInput(_ params: [String:Any]) async throws -> [String:Any] {
        let (editor,before,expected) = try pasteEditor(params)
        let timeout = params["timeoutMs"] as? Int ?? 2000
        guard timeout >= 50 && timeout <= 5000 else { throw fail("INVALID_ARGUMENT","Paste verification timeout must be 50..5000ms.") }
        // Call the same snapshot/focus-checked keyboard path; it invalidates input state.
        var input = params; input["operation"] = "pressKey"; input["key"] = "super+v"
        _ = try await keyboardInput(input)
        let deadline = Date().addingTimeInterval(Double(timeout)/1000)
        while Date() < deadline {
            try await Task.sleep(nanoseconds:20_000_000)
            do { try validateIdentity() } catch { throw fail("ACTION_OUTCOME_UNKNOWN","Application exited after paste dispatch.") }
            if let value = attribute(editor,kAXValueAttribute) as? String, expected.contains(value), value != before {
                return ["outcome":"observed","verification":"AXValue"]
            }
        }
        throw fail("ACTION_OUTCOME_UNKNOWN","Paste dispatched but expected AXValue change was not observed; do not automatically replay.")
    }
}
func runPasteChecks() throws {
    let replaced = try replacingSelection("A🌍B",CFRange(location:1,length:2),with:"你好")
    guard replaced == "A你好B" else { throw fail("SELF_TEST_FAILED","UTF-16 replacement differs.") }
    for range in [CFRange(location:2,length:0),CFRange(location:-1,length:0),CFRange(location:4,length:Int.max)] {
        do { _ = try replacingSelection("A🌍B",range,with:"x"); throw fail("SELF_TEST_FAILED","Invalid range accepted.") }
        catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
    }
}
