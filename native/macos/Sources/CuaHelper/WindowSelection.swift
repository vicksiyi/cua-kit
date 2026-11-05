import Foundation
import ApplicationServices

struct CaptureWindowCandidate {
    let id: Int
    let title: String
    let frame: CGRect
}
func captureFramesMatch(_ a: CGRect, _ b: CGRect) -> Bool {
    let pairs = [(a.minX,b.minX),(a.minY,b.minY),(a.width,b.width),(a.height,b.height)]
    return pairs.allSatisfy { $0.0.isFinite && $0.1.isFinite && abs($0.0 - $0.1) <= 0.5 }
}
// Pure selection: never use array order as a substitute for window identity.
func selectCaptureWindow(_ candidates: [CaptureWindowCandidate], requestedId: Int?, focusedFrame: CGRect?, focusedTitle: String?) throws -> Int {
    if let requestedId = requestedId {
        guard candidates.contains(where: {$0.id == requestedId}) else { throw fail("TARGET_NOT_FOUND", "Requested window does not belong to this application.") }
        return requestedId
    }
    guard !candidates.isEmpty else { throw fail("TARGET_NOT_FOUND", "No capturable window belongs to this application.") }
    if candidates.count == 1 { return candidates[0].id }
    guard let focusedFrame = focusedFrame else { throw fail("AMBIGUOUS_TARGET", "Multiple windows and no usable focused-window geometry.") }
    let matching = candidates.filter { captureFramesMatch($0.frame,focusedFrame) }
    if matching.count == 1 { return matching[0].id }
    if let title = focusedTitle, !title.isEmpty {
        let titled = matching.filter {$0.title == title}
        if titled.count == 1 { return titled[0].id }
    }
    throw fail("AMBIGUOUS_TARGET", "Focused window cannot be uniquely matched to a capturable window.")
}
func axElementFrame(_ element: AXUIElement) -> CGRect? {
    guard let rawPoint = attribute(element,kAXPositionAttribute), CFGetTypeID(rawPoint) == AXValueGetTypeID(),
          let rawSize = attribute(element,kAXSizeAttribute), CFGetTypeID(rawSize) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(rawPoint as! AXValue,.cgPoint,&point), AXValueGetValue(rawSize as! AXValue,.cgSize,&size),
          point.x.isFinite, point.y.isFinite, size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return nil }
    return CGRect(origin:point,size:size)
}
struct FocusedCaptureWindow {
    let element: AXUIElement
    let frame: CGRect
    let title: String
}
extension Target {
    func focusedCaptureWindow() throws -> FocusedCaptureWindow? {
        try validate()
        guard let raw = attribute(root,kAXFocusedWindowAttribute), CFGetTypeID(raw) == AXUIElementGetTypeID() else { return nil }
        let window = raw as! AXUIElement
        var pid: pid_t = 0
        guard AXUIElementGetPid(window,&pid) == .success, pid == app.processIdentifier else { throw fail("TARGET_NOT_FOUND", "Focused window belongs to another process.") }
        guard let rawPoint = attribute(window,kAXPositionAttribute), CFGetTypeID(rawPoint) == AXValueGetTypeID(),
              let rawSize = attribute(window,kAXSizeAttribute), CFGetTypeID(rawSize) == AXValueGetTypeID() else { return nil }
        var point = CGPoint.zero, size = CGSize.zero
        guard AXValueGetValue(rawPoint as! AXValue,.cgPoint,&point), AXValueGetValue(rawSize as! AXValue,.cgSize,&size),
              point.x.isFinite, point.y.isFinite, size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return nil }
        return FocusedCaptureWindow(element:window,frame:CGRect(origin:point,size:size),title:string(window,kAXTitleAttribute))
    }
}
