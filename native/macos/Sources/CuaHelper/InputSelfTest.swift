import Foundation
import ApplicationServices
import Carbon.HIToolbox

// CLI-only checks keep the helper testable with Apple's Command Line Tools (no XCTest module required).
func runInputChecks() throws {
    try runKeyMappingChecks()
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
    let capture = CapturedWindow(windowId:1,frame:frameB,contentRect:frameB,pixelWidth:1200,pixelHeight:800,scale:2,snapshotId:"test",focus:nil)
    let mapped = try screenshotPoint(CGPoint(x:200,y:100),capture:capture)
    guard mapped == CGPoint(x:-400,y:90) else { throw fail("SELF_TEST_FAILED","Retina screenshot coordinates mapped incorrectly.") }
    for point in [CGPoint(x:-1,y:0),CGPoint(x:1200,y:0),CGPoint(x:0,y:800),CGPoint(x:CGFloat.nan,y:0)] {
        do { _ = try screenshotPoint(point,capture:capture); throw fail("SELF_TEST_FAILED","Invalid screenshot point accepted.") }
        catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
    }
    for (name,down,up,button) in [("left",CGEventType.leftMouseDown,CGEventType.leftMouseUp,0),("right",.rightMouseDown,.rightMouseUp,1),("middle",.otherMouseDown,.otherMouseUp,2)] {
        let events = try mouseClickEvents(point:mapped,button:name,count:2,flags:mouseModifiers("Control+Shift"))
        guard events.count == 4, events[0].type == down, events[1].type == up,
              events[2].getIntegerValueField(.mouseEventClickState) == 2,
              events[0].getIntegerValueField(.mouseEventButtonNumber) == button,
              events.allSatisfy({$0.location == mapped && $0.flags.contains(.maskControl) && $0.flags.contains(.maskShift)}) else { throw fail("SELF_TEST_FAILED","Mouse event sequence differs.") }
    }
    do { _ = try mouseModifiers("a"); throw fail("SELF_TEST_FAILED","Unsupported mouse key accepted.") }
    catch let error as Failure { guard error.code == "UNSUPPORTED_CAPABILITY" else { throw error } }
    for (direction,vertical,sign) in [("up",true,1),("u",true,1),("down",true,-1),("d",true,-1),("left",false,1),("l",false,1),("right",false,-1),("r",false,-1)] {
        let events = try scrollEvents(point:mapped,viewport:frameB,direction:direction,pages:0.5)
        let axis: CGEventField = vertical ? .scrollWheelEventPointDeltaAxis1 : .scrollWheelEventPointDeltaAxis2
        let other: CGEventField = vertical ? .scrollWheelEventPointDeltaAxis2 : .scrollWheelEventPointDeltaAxis1
        let total = events.reduce(Int64(0)) { $0 + $1.getIntegerValueField(axis) }
        guard total == Int64((vertical ? 200 : 300) * sign),
              events.allSatisfy({$0.type == .scrollWheel && $0.location == mapped && $0.getIntegerValueField(other) == 0 && abs($0.getIntegerValueField(axis)) <= 10}) else {
            throw fail("SELF_TEST_FAILED","Scroll axis, direction, page distance or event location differs.")
        }
    }
    for (direction,pages) in [("invalid",1.0),("down",0.0),("down",-1.0),("down",Double.nan),("down",Double.infinity),("down",100000.0)] {
        do { _ = try scrollEvents(point:mapped,viewport:frameB,direction:direction,pages:pages); throw fail("SELF_TEST_FAILED","Invalid scroll accepted.") }
        catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
    }

}
