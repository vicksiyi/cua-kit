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
    let frameA = CGRect(x:10,y:20,width:300,height:200), frameB = CGRect(x:-500,y:40,width:600,height:400)
    let windows = [CaptureWindowCandidate(id:1,title:"A",frame:frameA),CaptureWindowCandidate(id:2,title:"B",frame:frameB)]
    guard try selectCaptureWindow(windows,requestedId:nil,focusedFrame:frameB,focusedTitle:"B") == 2,
          try selectCaptureWindow(windows.reversed(),requestedId:nil,focusedFrame:frameB,focusedTitle:"B") == 2,
          try selectCaptureWindow(windows,requestedId:1,focusedFrame:frameB,focusedTitle:"B") == 1 else { throw fail("SELF_TEST_FAILED","Capture selection depends on ordering or ignores explicit identity.") }
    let overlapping = [CaptureWindowCandidate(id:1,title:"A",frame:frameA),CaptureWindowCandidate(id:2,title:"B",frame:frameA)]
    guard try selectCaptureWindow(overlapping,requestedId:nil,focusedFrame:frameA,focusedTitle:"B") == 2 else { throw fail("SELF_TEST_FAILED","Focused title did not disambiguate matching geometry.") }
    for (candidates,id,frame,title,code) in [
        (windows,nil,nil,nil,"AMBIGUOUS_TARGET"),
        (overlapping,nil,frameA,nil,"AMBIGUOUS_TARGET"),
        (windows,99,nil,nil,"TARGET_NOT_FOUND"),
        ([],nil,nil,nil,"TARGET_NOT_FOUND"),
        (windows,nil,CGRect(x:900,y:900,width:1,height:1),"B","AMBIGUOUS_TARGET")
    ] as [([CaptureWindowCandidate],Int?,CGRect?,String?,String)] {
        do { _ = try selectCaptureWindow(candidates,requestedId:id,focusedFrame:frame,focusedTitle:title); throw fail("SELF_TEST_FAILED","Invalid window selection accepted.") }
        catch let error as Failure { guard error.code == code else { throw error } }
    }
}
