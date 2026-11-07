import Foundation
import AppKit
import ApplicationServices
import Carbon.HIToolbox

func unicodeChunks(_ text: String, limit: Int = 20) -> [[UInt16]] {
    precondition(limit >= 2)
    let units = Array(text.utf16); var offset = 0, chunks: [[UInt16]] = []
    while offset < units.count {
        var end = min(offset+limit,units.count)
        if end < units.count && (0xD800...0xDBFF).contains(units[end-1]) { end -= 1 }
        chunks.append(Array(units[offset..<end])); offset = end
    }
    return chunks
}
func selectedTextRange(content: String, text: String, options: [String: Any]) throws -> CFRange {
    guard !text.isEmpty else { throw fail("INVALID_ARGUMENT", "Selection requires nonempty text.") }
    for name in ["prefix", "suffix", "selectionType"] {
        if let value = options[name], !(value is String) { throw fail("INVALID_ARGUMENT", "Selection options must be strings.") }
    }
    let selection = options["selectionType"] as? String ?? "text"
    guard ["text", "cursor_before", "cursor_after"].contains(selection) else { throw fail("INVALID_ARGUMENT", "Unknown selection type.") }
    let prefix = options["prefix"] as? String ?? "", suffix = options["suffix"] as? String ?? ""
    let value = content as NSString; var matches: [NSRange] = [], offset = 0
    while offset < value.length {
        let found = value.range(of:text,options:[],range:NSRange(location:offset,length:value.length-offset))
        if found.location == NSNotFound { break }
        let before = value.substring(to:found.location), after = value.substring(from:found.location+found.length)
        if before.hasSuffix(prefix) && after.hasPrefix(suffix) { matches.append(found) }
        offset = found.location+1
    }
    guard !matches.isEmpty else { throw fail("ELEMENT_NOT_INTERACTABLE", "Selection text not found.") }
    guard matches.count == 1 else { throw fail("AMBIGUOUS_TARGET", "Selection text is ambiguous; supply prefix/suffix.") }
    let match = matches[0]
    return CFRange(location: match.location + (selection == "cursor_after" ? match.length : 0), length: selection == "text" ? match.length : 0)
}
@MainActor
extension Target {
    func invalidateInputState() { snapshot = nil; nodes = []; capturedWindow = nil }
    func validateSnapshot(_ params: [String: Any]) throws {
        try validate()
        guard let expected = params["snapshotId"] as? String, expected == snapshot else { throw fail("STALE_OBSERVATION", "Input needs a current observation.") }
        let (current, warnings) = try collect()
        guard warnings.isEmpty, current.count == nodes.count else { throw fail("STALE_OBSERVATION", "Application tree changed or is incomplete; observe again.") }
        for (a,b) in zip(nodes,current) {
            guard CFEqual(a.element,b.element), NSDictionary(dictionary:a.data).isEqual(to:b.data) else { throw fail("STALE_OBSERVATION", "Application state changed; observe again.") }
        }
    }
    func keyboardInput(_ params: [String: Any]) async throws -> [String: Any] {
        try validateSnapshot(params)
        guard let rawFocus = attribute(root,kAXFocusedUIElementAttribute), let focused = try unwrapAXUIElement(rawFocus, throwingOnFailure: false) else { throw fail("ELEMENT_NOT_INTERACTABLE", "Application has no focused accessibility element.") }
        var pid: pid_t = 0
        guard AXUIElementGetPid(focused,&pid) == .success, pid == app.processIdentifier else { throw fail("TARGET_NOT_FOUND", "Focused element belongs to another process.") }
        guard let source = CGEventSource(stateID:.privateState) else { throw fail("PROVIDER_DISCONNECTED", "Cannot create keyboard event source.") }
        let operation = params["operation"] as? String ?? ""
        var pairs: [(CGEvent,CGEvent)] = []
        var held: UInt64 = 0
        switch operation {
        case "typeText":
            guard let text = params["text"] as? String, text.utf16.count <= 100000 else { throw fail("INVALID_ARGUMENT", "typeText requires at most 100000 UTF-16 units.") }
            for chunk in unicodeChunks(text) {
                guard let down = CGEvent(keyboardEventSource:source,virtualKey:0,keyDown:true), let up = CGEvent(keyboardEventSource:source,virtualKey:0,keyDown:false) else { throw fail("PROVIDER_DISCONNECTED", "Cannot allocate Unicode key events.") }
                chunk.withUnsafeBufferPointer { pointer in
                    down.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:pointer.baseAddress)
                    up.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:pointer.baseAddress)
                }
                pairs.append((down,up))
            }
        case "pressKey":
            guard let key = params["key"] as? String else { throw fail("INVALID_ARGUMENT", "pressKey requires a key chord.") }
            held = try heldNanoseconds((params["durationMs"] as? Double ?? 0)/1000)
            let stroke = try parseKey(key)
            guard let down = CGEvent(keyboardEventSource:source,virtualKey:stroke.code,keyDown:true), let up = CGEvent(keyboardEventSource:source,virtualKey:stroke.code,keyDown:false) else { throw fail("PROVIDER_DISCONNECTED", "Cannot allocate key events.") }
            down.flags = stroke.flags; up.flags = stroke.flags; pairs.append((down,up))
        default: throw fail("UNSUPPORTED_CAPABILITY", "Unknown keyboard operation.")
        }
        defer { invalidateInputState() }
        for (down,up) in pairs {
            if let deadline = params["deadlineUnixMilliseconds"] as? Double,
               Date().timeIntervalSince1970 * 1000 + Double(held) / 1_000_000 >= deadline {
                throw fail("INVALID_ARGUMENT", "Input deadline expired before the next key-down; earlier input may have been dispatched.")
            }
            try await dispatchHeldPair(down,up,nanoseconds:held,post:{$0.postToPid(self.app.processIdentifier)},validate:{try self.validateIdentity()},wait:{try await Task.sleep(nanoseconds:$0)})
        }
        return ["outcome":"dispatched", "eventPairs":pairs.count]
    }
    func selectText(_ element: AXUIElement, _ params: [String: Any]) throws {
        guard let text = params["value"] as? String, !text.isEmpty, let content = attribute(element,kAXValueAttribute) as? String else { throw fail("INVALID_ARGUMENT", "Selection requires nonempty text and a textual AXValue.") }
        let options = params["options"] as? [String:Any] ?? [:]
        let range = try selectedTextRange(content: content, text: text, options: options)
        let axRange = try encodedAXParameter(range)
        try setSystemAXAttribute(element, AXEncodedValue(value: axRange),
            for: UIElementAttribute(kAXSelectedTextRangeAttribute))
    }
}
