import Foundation
import ApplicationServices
import Carbon.HIToolbox

struct KeyStroke { let code: CGKeyCode; let flags: CGEventFlags }
func modifierFlag(_ name: String) -> CGEventFlags? {
    var normalized = name.trimmingCharacters(in:.whitespacesAndNewlines).lowercased()
    if normalized.hasSuffix("_l") || normalized.hasSuffix("_r") { normalized = String(normalized.dropLast(2)) }
    switch normalized {
    case "super","command","meta": return .maskCommand
    case "control","ctrl": return .maskControl
    case "option","alt": return .maskAlternate
    case "shift": return .maskShift
    default: return nil
    }
}
// Independent Carbon mapping. Printable keys use US ANSI positions; Unicode text
// entry uses typeText instead. Side-specific modifier flags are not synthesized.
func parseKey(_ chord: String) throws -> KeyStroke {
    var rest = chord == " " ? "space" : chord.trimmingCharacters(in:.whitespacesAndNewlines)
    var flags = CGEventFlags()
    while let separator = rest.firstIndex(of:"+"), let modifier = modifierFlag(String(rest[..<separator])) {
        flags.formUnion(modifier)
        rest = String(rest[rest.index(after:separator)...]).trimmingCharacters(in:.whitespacesAndNewlines)
    }
    let letters: [String:Int] = ["a":kVK_ANSI_A,"b":kVK_ANSI_B,"c":kVK_ANSI_C,"d":kVK_ANSI_D,"e":kVK_ANSI_E,"f":kVK_ANSI_F,"g":kVK_ANSI_G,"h":kVK_ANSI_H,"i":kVK_ANSI_I,"j":kVK_ANSI_J,"k":kVK_ANSI_K,"l":kVK_ANSI_L,"m":kVK_ANSI_M,"n":kVK_ANSI_N,"o":kVK_ANSI_O,"p":kVK_ANSI_P,"q":kVK_ANSI_Q,"r":kVK_ANSI_R,"s":kVK_ANSI_S,"t":kVK_ANSI_T,"u":kVK_ANSI_U,"v":kVK_ANSI_V,"w":kVK_ANSI_W,"x":kVK_ANSI_X,"y":kVK_ANSI_Y,"z":kVK_ANSI_Z]
    let named: [String:Int] = [
        "enter":kVK_Return,"return":kVK_Return,"tab":kVK_Tab,"escape":kVK_Escape,"esc":kVK_Escape,
        "backspace":kVK_Delete,"delete":kVK_ForwardDelete,
        "arrowleft":kVK_LeftArrow,"left":kVK_LeftArrow,"arrowright":kVK_RightArrow,"right":kVK_RightArrow,
        "arrowup":kVK_UpArrow,"up":kVK_UpArrow,"arrowdown":kVK_DownArrow,"down":kVK_DownArrow,
        "home":kVK_Home,"end":kVK_End,"pageup":kVK_PageUp,"prior":kVK_PageUp,
        "pagedown":kVK_PageDown,"next":kVK_PageDown,"space":kVK_Space,
        "iso_left_tab":kVK_Tab,"kp_enter":kVK_ANSI_KeypadEnter,
        "f1":kVK_F1,"f2":kVK_F2,"f3":kVK_F3,"f4":kVK_F4,"f5":kVK_F5,
        "f6":kVK_F6,"f7":kVK_F7,"f8":kVK_F8,"f9":kVK_F9,"f10":kVK_F10,
        "f11":kVK_F11,"f12":kVK_F12,"f13":kVK_F13,"f14":kVK_F14,"f15":kVK_F15,
        "f16":kVK_F16,"f17":kVK_F17,"f18":kVK_F18,"f19":kVK_F19,"f20":kVK_F20
    ]
    let physical: [String:Int] = [
        "0":kVK_ANSI_0,"1":kVK_ANSI_1,"2":kVK_ANSI_2,"3":kVK_ANSI_3,"4":kVK_ANSI_4,
        "5":kVK_ANSI_5,"6":kVK_ANSI_6,"7":kVK_ANSI_7,"8":kVK_ANSI_8,"9":kVK_ANSI_9,
        "=":kVK_ANSI_Equal,"-":kVK_ANSI_Minus,".":kVK_ANSI_Period,",":kVK_ANSI_Comma,"/":kVK_ANSI_Slash,
        ";":kVK_ANSI_Semicolon,"'":kVK_ANSI_Quote,"[":kVK_ANSI_LeftBracket,
        "]":kVK_ANSI_RightBracket,"\\":kVK_ANSI_Backslash,"`":kVK_ANSI_Grave
    ]
    let shifted: [String:String] = ["!":"1","@":"2","#":"3","$":"4","%":"5","^":"6","&":"7","*":"8","(":"9",")":"0","_":"-","+":"=","{":"[","}":"]","|":"\\",":":";","\"":"'","<":",",">":".","?":"/","~":"`"]
    let symbols: [String:String] = ["plus":"+","minus":"-","equal":"=","exclam":"!","at":"@","numbersign":"#","dollar":"$","percent":"%","asciicircum":"^","ampersand":"&","asterisk":"*","parenleft":"(","parenright":")","underscore":"_","braceleft":"{","braceright":"}","bracketleft":"[","bracketright":"]","bar":"|","backslash":"\\","colon":":","semicolon":";","quotedbl":"\"","apostrophe":"'","less":"<","greater":">","comma":",","period":".","question":"?","slash":"/","asciitilde":"~","grave":"`"]
    let symbol = symbols[rest.lowercased()] ?? rest
    let base = shifted[symbol] ?? symbol
    guard let code = named[rest.lowercased()] ?? letters[rest.lowercased()] ?? physical[base] else {
        throw fail("UNSUPPORTED_CAPABILITY","Native key mapping is not implemented: \(rest)")
    }
    if shifted[symbol] != nil || rest.lowercased() == "iso_left_tab" || (rest.count == 1 && letters[rest.lowercased()] != nil && rest == rest.uppercased()) { flags.insert(.maskShift) }
    return KeyStroke(code:CGKeyCode(code),flags:flags)
}
