import Foundation
import AppKit
import ApplicationServices
import Carbon.HIToolbox

struct KeyStroke {
    let code: CGKeyCode
    let flags: CGEventFlags
}
func parseKey(_ chord: String) throws -> KeyStroke {
    var rest = chord, flags = CGEventFlags()
    let modifiers: [(String,CGEventFlags)] = [("super",.maskCommand),("Command",.maskCommand),("Meta",.maskCommand),("Control",.maskControl),("Ctrl",.maskControl),("Alt",.maskAlternate),("Option",.maskAlternate),("Shift",.maskShift)]
    while let entry = modifiers.first(where: { rest.lowercased().hasPrefix($0.0.lowercased()+"+") }) {
        flags.insert(entry.1); rest = String(rest.dropFirst(entry.0.count+1))
    }
    let letters: [String:Int] = ["a":kVK_ANSI_A,"b":kVK_ANSI_B,"c":kVK_ANSI_C,"d":kVK_ANSI_D,"e":kVK_ANSI_E,"f":kVK_ANSI_F,"g":kVK_ANSI_G,"h":kVK_ANSI_H,"i":kVK_ANSI_I,"j":kVK_ANSI_J,"k":kVK_ANSI_K,"l":kVK_ANSI_L,"m":kVK_ANSI_M,"n":kVK_ANSI_N,"o":kVK_ANSI_O,"p":kVK_ANSI_P,"q":kVK_ANSI_Q,"r":kVK_ANSI_R,"s":kVK_ANSI_S,"t":kVK_ANSI_T,"u":kVK_ANSI_U,"v":kVK_ANSI_V,"w":kVK_ANSI_W,"x":kVK_ANSI_X,"y":kVK_ANSI_Y,"z":kVK_ANSI_Z]
    let named: [String:Int] = ["Enter":kVK_Return,"Return":kVK_Return,"Tab":kVK_Tab,"Escape":kVK_Escape,"Backspace":kVK_Delete,"Delete":kVK_ForwardDelete,"ArrowLeft":kVK_LeftArrow,"ArrowRight":kVK_RightArrow,"ArrowUp":kVK_UpArrow,"ArrowDown":kVK_DownArrow,"Home":kVK_Home,"End":kVK_End,"PageUp":kVK_PageUp,"PageDown":kVK_PageDown,"Space":kVK_Space," ":kVK_Space,"0":kVK_ANSI_0,"1":kVK_ANSI_1,"2":kVK_ANSI_2,"3":kVK_ANSI_3,"4":kVK_ANSI_4,"5":kVK_ANSI_5,"6":kVK_ANSI_6,"7":kVK_ANSI_7,"8":kVK_ANSI_8,"9":kVK_ANSI_9,"=":kVK_ANSI_Equal,"+":kVK_ANSI_Equal,"-":kVK_ANSI_Minus,".":kVK_ANSI_Period,",":kVK_ANSI_Comma,"/":kVK_ANSI_Slash]
    guard let code = named[rest] ?? letters[rest.lowercased()] else { throw fail("UNSUPPORTED_CAPABILITY", "Native key mapping is not implemented: \(rest)") }
    if rest == "+" || (rest.count == 1 && letters[rest.lowercased()] != nil && rest == rest.uppercased()) { flags.insert(.maskShift) }
    return KeyStroke(code:CGKeyCode(code),flags:flags)
}
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
        guard let focused = attribute(root,kAXFocusedUIElementAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() else { throw fail("ELEMENT_NOT_INTERACTABLE", "Application has no focused accessibility element.") }
        var pid: pid_t = 0
        guard AXUIElementGetPid(focused as! AXUIElement,&pid) == .success, pid == app.processIdentifier else { throw fail("TARGET_NOT_FOUND", "Focused element belongs to another process.") }
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
            try await dispatchHeldPair(down,up,nanoseconds:held,post:{$0.postToPid(self.app.processIdentifier)},validate:{try self.validateIdentity()},wait:{try await Task.sleep(nanoseconds:$0)})
        }
        return ["outcome":"dispatched", "eventPairs":pairs.count]
    }
    func selectText(_ element: AXUIElement, _ params: [String: Any]) throws -> AXError {
        guard let text = params["value"] as? String, !text.isEmpty, let content = attribute(element,kAXValueAttribute) as? String else { throw fail("INVALID_ARGUMENT", "Selection requires nonempty text and a textual AXValue.") }
        let options = params["options"] as? [String:Any] ?? [:]
        var range = try selectedTextRange(content: content, text: text, options: options)
        guard let axRange = AXValueCreate(.cfRange,&range) else { throw fail("PROVIDER_DISCONNECTED", "Cannot encode text range.") }
        return AXUIElementSetAttributeValue(element,kAXSelectedTextRangeAttribute as CFString,axRange)
    }
}
