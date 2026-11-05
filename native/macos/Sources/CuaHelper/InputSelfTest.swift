import Foundation
import ApplicationServices
import Carbon.HIToolbox

// CLI-only checks keep the helper testable with Apple's Command Line Tools (no XCTest module required).
func runInputChecks() throws {
    let text = String(repeating:"a",count:19)+"🌍你好"+String(repeating:"🙂",count:31)
    let chunks = unicodeChunks(text)
    guard String(decoding:chunks.flatMap{$0},as:UTF16.self) == text else { throw fail("SELF_TEST_FAILED","Unicode reconstruction differs.") }
    for chunk in chunks {
        guard chunk.count <= 20, !(0xDC00...0xDFFF).contains(chunk.first!), !(0xD800...0xDBFF).contains(chunk.last!) else { throw fail("SELF_TEST_FAILED","A surrogate pair was split across event chunks.") }
    }
    let key = try parseKey("super+Shift+a")
    guard key.code == CGKeyCode(kVK_ANSI_A), key.flags.contains(.maskCommand), key.flags.contains(.maskShift), !key.flags.contains(.maskControl), try parseKey("+").flags.contains(.maskShift) else { throw fail("SELF_TEST_FAILED","Key chord flags differ.") }
    do { _ = try parseKey("UnsupportedKey"); throw fail("SELF_TEST_FAILED","Unknown key accepted.") }
    catch let error as Failure { guard error.code == "UNSUPPORTED_CAPABILITY" else { throw error } }
    let selected = try selectedTextRange(content:"A🌍你好B", text:"🌍你好", options:[:])
    let before = try selectedTextRange(content:"A🌍你好B", text:"🌍你好", options:["selectionType":"cursor_before"])
    let after = try selectedTextRange(content:"A🌍你好B", text:"🌍你好", options:["selectionType":"cursor_after"])
    guard selected.location == 1, selected.length == 4, before.location == 1, before.length == 0, after.location == 5, after.length == 0 else { throw fail("SELF_TEST_FAILED","UTF-16 selection/cursor offsets differ.") }
    let unique = try selectedTextRange(content:"one cat; two cat!", text:"cat", options:["prefix":"two ","suffix":"!"])
    guard unique.location == 13, unique.length == 3 else { throw fail("SELF_TEST_FAILED","Selection context mismatch.") }
    for (content,text,options,expected) in [
        ("aaa","aa",[:],"AMBIGUOUS_TARGET"),
        ("abc","z",[:],"ELEMENT_NOT_INTERACTABLE"),
        ("abc","",[:],"INVALID_ARGUMENT"),
        ("abc","a",["selectionType":"invalid"],"INVALID_ARGUMENT")
    ] as [(String,String,[String:Any],String)] {
        do { _ = try selectedTextRange(content:content,text:text,options:options); throw fail("SELF_TEST_FAILED","Invalid selection accepted.") }
        catch let error as Failure { guard error.code == expected else { throw error } }
    }
}
