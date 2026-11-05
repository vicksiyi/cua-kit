import Foundation
import ApplicationServices
import Carbon.HIToolbox
func runKeyMappingChecks() throws {
    for (chord,code,flags) in [
        ("Control_L + a",kVK_ANSI_A,CGEventFlags.maskControl),
        (" Super_R + Shift_L + d ",kVK_ANSI_D,[.maskCommand,.maskShift]),
        ("space",kVK_Space,[]),(" ",kVK_Space,[]),("BackSpace",kVK_Delete,[]),
        ("Prior",kVK_PageUp,[]),("Next",kVK_PageDown,[]),("Left",kVK_LeftArrow,[]),
        ("F12",kVK_F12,[]),("F20",kVK_F20,[]),("KP_Enter",kVK_ANSI_KeypadEnter,[]),
        ("ISO_Left_Tab",kVK_Tab,.maskShift),("A",kVK_ANSI_A,.maskShift),
        ("Control + +",kVK_ANSI_Equal,[.maskControl,.maskShift]),
        ("Super_L+plus",kVK_ANSI_Equal,[.maskCommand,.maskShift]),
        ("question",kVK_ANSI_Slash,.maskShift),("braceleft",kVK_ANSI_LeftBracket,.maskShift),
        ("apostrophe",kVK_ANSI_Quote,[]),("backslash",kVK_ANSI_Backslash,[])
    ] as [(String,Int,CGEventFlags)] {
        let actual = try parseKey(chord)
        guard actual.code == code,actual.flags == flags else { throw fail("SELF_TEST_FAILED","Key mapping differs for \(chord)") }
    }
    for invalid in ["Control+","Control++a","Unknown+a","a+b","","F25"] {
        do { _ = try parseKey(invalid); throw fail("SELF_TEST_FAILED","Malformed key accepted.") }
        catch let error as Failure { guard error.code == "UNSUPPORTED_CAPABILITY" else { throw error } }
    }
    guard try mouseModifiers(" Control_L + Shift_R ") == [.maskControl,.maskShift] else { throw fail("SELF_TEST_FAILED","Mouse modifier aliases differ.") }
}
