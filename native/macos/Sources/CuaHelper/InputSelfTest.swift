import Foundation
import AppKit
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
    for range in [selected, before, after] {
        let encoded = try encodedAXParameter(range)
        var decoded = CFRange(location: -1, length: -1)
        guard AXValueGetValue(encoded, .cfRange, &decoded), decoded.location == range.location, decoded.length == range.length else {
            throw fail("SELF_TEST_FAILED", "Native selection parameter encoding changed UTF-16 offsets.")
        }
    }
    let unique = try selectedTextRange(content:"one cat; two cat!", text:"cat", options:["prefix":"two ","suffix":"!"])
    guard unique.location == 13, unique.length == 3 else { throw fail("SELF_TEST_FAILED","Selection context mismatch.") }
    for (content,text,options,expected) in [
        ("aaa","aa",[:],"AMBIGUOUS_TARGET"),
        ("abc","z",[:],"ELEMENT_NOT_INTERACTABLE"),
        ("abc","",[:],"INVALID_ARGUMENT"),
        ("abc","a",["selectionType":"invalid"],"INVALID_ARGUMENT")
    ] as [(String,String,[String:Any],String)] {
        do { _ = try selectedTextRange(content:content,text:text,options:options); throw fail("SELF_TEST_FAILED","Invalid selection accepted.") }
        catch let error as Failure {
            guard error.code == expected else { throw error }
            if error.code == "AMBIGUOUS_TARGET" {
                try verifyNonApplicationTargetError(error)
            }
        }
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
        catch let error as Failure {
            guard error.code == code else { throw error }
            try verifyNonApplicationTargetError(error)
        }
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
    let doubleClick = try mouseClickEvents(point: mapped, button: "left", count: 2, flags: [])
    let nextClick = try mouseClickEvents(point: mapped, button: "left", count: 1, flags: [])
    let numbers = (doubleClick + nextClick).map { $0.getIntegerValueField(.mouseEventNumber) }
    let firstNumber = numbers[0]
    guard numbers == [firstNumber, firstNumber, firstNumber + 1, firstNumber + 1, firstNumber + 2, firstNumber + 2],
          (doubleClick + nextClick).map({ $0.getIntegerValueField(.mouseEventClickState) }) == [1, 1, 2, 2, 1, 1] else {
        throw fail("SELF_TEST_FAILED", "Click event numbers reset or diverged from their down/up pair.")
    }
    // Non-origin, Retina-independent global -> AppKit window-local mapping.
    // Previously windowNumber was 0, so postToPid could silently miss the view.
    typealias GetWindowLocation = @convention(c) (CGEvent) -> CGPoint
    guard let getLocationPointer = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventGetWindowLocation") else {
        throw fail("SELF_TEST_FAILED", "Cannot inspect the window-local event location.")
    }
    let getLocation = unsafeBitCast(getLocationPointer, to: GetWindowLocation.self)
    for windowID: UInt32 in [0, 123] {
        for flipped in [true, false] {
            let target = MouseWindow(id: windowID, frame: frameB, usesFlippedCoordinates: flipped)
            let events = try mouseClickEvents(point: mapped, button: "left", count: 1, flags: [], window: target)
            for event in events {
                guard let appKit = NSEvent(cgEvent: event), appKit.windowNumber == Int(windowID),
                      getLocation(event) == CGPoint(x: 100, y: flipped ? 350 : 50),
                      event.location == mapped,
                      event.getIntegerValueField(.mouseEventWindowUnderMousePointer) == Int64(windowID),
                      event.getIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent) == Int64(windowID),
                      event.getIntegerValueField(.mouseEventSubtype) == 3 else {
                    throw fail("SELF_TEST_FAILED", "Mouse event lost its target window or local coordinates.")
                }
            }
        }
    }
    // Original four-case/button mapping and independent optional window/bounds.
    for (button, rawTypes) in [(CGMouseButton.left, [1, 2, 6, 5]),
                               (.right, [3, 4, 7, 5]), (.center, [25, 26, 27, 5])] {
        for (index, kind) in [SynthesizedEvent.MouseEventType.mouseDown, .mouseUp, .mouseDragged, .mouseMoved].enumerated() {
            for windowID: UInt32? in [nil, 0, 123] {
                for bounds: CGRect? in [nil, frameB] {
                    let result = try SynthesizedEvent.mouseEvent(eventNumber: 42, type: kind,
                        clickCount: 2, at: mapped, mouseButton: button, flags: .maskShift,
                        inWindow: windowID, windowBounds: bounds, windowUsesFlippedCoordinates: false)
                    guard result.cgEvents.count == 1, let event = result.cgEvents.first,
                          Int(event.type.rawValue) == rawTypes[index], event.flags == .maskShift,
                          event.location == mapped,
                          event.getIntegerValueField(.mouseEventButtonNumber) == Int64(button.rawValue),
                          event.getIntegerValueField(.mouseEventSubtype) == 3 else {
                        throw fail("SELF_TEST_FAILED", "Original mouse factory event mapping differs.")
                    }
                    if let windowID {
                        guard event.getIntegerValueField(.mouseEventWindowUnderMousePointer) == Int64(windowID),
                              event.getIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent) == Int64(windowID) else {
                            throw fail("SELF_TEST_FAILED", "Optional factory window routing differs.")
                        }
                        if bounds != nil, getLocation(event) != CGPoint(x: 100, y: 50) {
                            throw fail("SELF_TEST_FAILED", "Optional factory window geometry differs.")
                        }
                    }
                }
            }
        }
    }
    let numberBeforeMove = SynthesizedEvent.nextEventNumber
    var moveCount: Int64 = 0
    for windowID: UInt32? in [nil, 0, 123] {
        for bounds: CGRect? in [nil, frameB] {
            for flipped in [false, true] {
                let moved = try SynthesizedEvent.moveMouse(to: mapped, inWindow: windowID,
                    windowBounds: bounds, windowUsesFlippedCoordinates: flipped)
                moveCount += 1
                guard moved.cgEvents.count == 1, let event = moved.cgEvents.first,
                      event.type == .mouseMoved, event.flags.isEmpty, event.location == mapped,
                      event.getIntegerValueField(.mouseEventButtonNumber) == 0,
                      event.getIntegerValueField(.mouseEventSubtype) == 3 else {
                    throw fail("SELF_TEST_FAILED", "Native moveMouse factory fields differ.")
                }
                if let windowID {
                    guard event.getIntegerValueField(.mouseEventWindowUnderMousePointer) == Int64(windowID),
                          event.getIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent) == Int64(windowID) else {
                        throw fail("SELF_TEST_FAILED", "Native moveMouse routing differs.")
                    }
                    if bounds != nil, getLocation(event) != CGPoint(x: 100, y: flipped ? 350 : 50) {
                        throw fail("SELF_TEST_FAILED", "Native moveMouse local coordinates differ.")
                    }
                }
            }
        }
    }
    guard SynthesizedEvent.nextEventNumber == numberBeforeMove + moveCount + 1 else {
        throw fail("SELF_TEST_FAILED", "Native moveMouse event-number consumption differs.")
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
    let scrollWindow = MouseWindow(id: 123, frame: frameB)
    let targetedScroll = try scrollEvents(point: mapped, viewport: frameB, direction: "down", pages: 0.5, window: scrollWindow)
    for event in targetedScroll {
        guard getLocation(event) == CGPoint(x: 100, y: 350), event.location == mapped else {
            throw fail("SELF_TEST_FAILED", "Scroll event lost its window routing.")
        }
    }
    let sourceScroll = try SynthesizedEvent.scroll(at: mapped, deltaX: 0, deltaY: -5, inWindow: scrollWindow)
    guard sourceScroll.cgEvents.first?.getIntegerValueField(CGEventField(rawValue: 51)!) == Int64(scrollWindow.id) else {
        throw fail("SELF_TEST_FAILED", "Source scroll target window field differs.")
    }
    guard sourceScroll.cgEvents.count == 1, let sourceEvent = sourceScroll.cgEvents.first,
          sourceEvent.type == .scrollWheel, sourceEvent.location == mapped,
          sourceEvent.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == -5,
          getLocation(sourceEvent) == CGPoint(x: 100, y: 350) else {
        throw fail("SELF_TEST_FAILED", "Source scroll factory geometry or vertical delta differs.")
    }
    for id: UInt32 in [0, 123] {
        for geometry in [false, true] {
            for point in [false, true] {
                let activation = try SynthesizedEvent.notifyAppActivated(windowID: id,
                    windowBounds: geometry ? frameB : nil, activationPoint: point ? mapped : nil)
                let clickExpected = id != 0 && geometry && point
                guard activation.cgEvents.count == (clickExpected ? 3 : 1),
                      let notification = NSEvent(cgEvent: activation.cgEvents[0]),
                      notification.type == .appKitDefined, notification.subtype.rawValue == 1,
                      notification.windowNumber == Int(id), notification.data1 == 0, notification.data2 == 0,
                      notification.modifierFlags.rawValue == (id == 0 ? 0 : 0xc0000) else {
                    throw fail("SELF_TEST_FAILED", "Activation notification or optional click gate differs")
                }
                if clickExpected {
                    let pair = Array(activation.cgEvents.dropFirst())
                    guard pair.map({$0.type}) == [.leftMouseDown, .leftMouseUp],
                          pair.map({$0.getIntegerValueField(.mouseEventNumber)}) == [1, 2],
                          pair.allSatisfy({$0.location == mapped && getLocation($0) == CGPoint(x:100,y:50)}) else {
                        throw fail("SELF_TEST_FAILED", "Activation click order or unflipped coordinates differ")
                    }
                }
            }
        }
    }
    for (notification, subtype) in [
        (try SynthesizedEvent.notifyWindowKeyFocusRemoved(), Int16(0x4000)),
        (try SynthesizedEvent.notifyWindowKeyFocusReturned(), Int16(bitPattern: 0x8000))
    ] {
        guard notification.cgEvents.count == 1,
              let event = NSEvent(cgEvent: notification.cgEvents[0]),
              event.type.rawValue == 21, event.subtype.rawValue == subtype,
              event.windowNumber == 0, event.modifierFlags.isEmpty,
              event.data1 == 0, event.data2 == 0 else {
            throw fail("SELF_TEST_FAILED", "Process key-focus notification fields differ")
        }
    }
    let deactivation = try SynthesizedEvent.notifyAppDeactivated()
    guard deactivation.cgEvents.count == 1,
          NSEvent(cgEvent: deactivation.cgEvents[0])?.subtype.rawValue == 2 else {
        throw fail("SELF_TEST_FAILED", "Deactivation notification differs")
    }
    for (direction,pages) in [("invalid",1.0),("down",0.0),("down",-1.0),("down",Double.nan),("down",Double.infinity),("down",100000.0)] {
        do { _ = try scrollEvents(point:mapped,viewport:frameB,direction:direction,pages:pages); throw fail("SELF_TEST_FAILED","Invalid scroll accepted.") }
        catch let error as Failure { guard error.code == "INVALID_ARGUMENT" else { throw error } }
    }

}

// Real text/window selection failures must not be decoded as app identity errors.
private func verifyNonApplicationTargetError(_ error: Failure) throws {
    let wire = SkyRPCFailure.hostFailure(code: error.code, message: error.message)
    guard wire.code == -10005, wire.message == error.message,
          NativeIPCClientError.mappedServerError(errorNumber: Int32(wire.code), errorString: wire.message)
            == .serverError(errorNumber: -10005, errorString: error.message) else {
        throw fail("SELF_TEST_FAILED", "Non-application failure was misclassified as an application failure.")
    }
}
