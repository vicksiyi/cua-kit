import AppKit
import ApplicationServices
import SystemSoftware

struct MouseWindow {
    let id: UInt32
    let frame: CGRect
    // AppKit's event location is bottom-left based within the window.
    var usesFlippedCoordinates = true
}

func applyMouseWindow(_ window: MouseWindow, to event: CGEvent) {
    // Native mouseEvent +288..+500 sets both window fields and a separate
    // window-local location. postToPid alone does not supply these fields.
    CGEventAPI.setIntegerValueField(event, field: .mouseEventWindowUnderMousePointer, value: Int64(window.id))
    CGEventAPI.setIntegerValueField(event, field: .mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(window.id))
    let global = CGEventAPI.getLocation(event)
    let localY = global.y - window.frame.minY
    WindowServerSPI.setWindowLocation(event, location: CGPoint(x: global.x - window.frame.minX,
        y: window.usesFlippedCoordinates ? window.frame.height - localY : localY))
}

extension Target {
    func mouseWindow(_ params: [String: Any]) throws -> MouseWindow {
        try validateSnapshot(params)
        if let id = params["elementId"] as? Int {
            guard let node = observedNode(for: id, in: nodes),
                  let raw = attribute(node.element, kAXWindowAttribute),
                  let element = try unwrapAXUIElement(raw, throwingOnFailure: false),
                  let frame = axElementFrame(element) else {
                throw fail("TARGET_NOT_FOUND", "Clicked element has no usable containing window.")
            }
            return MouseWindow(id: try readAXWindowID(element), frame: frame)
        }
        guard let capture = capturedWindow, capture.snapshotId == snapshot else {
            throw fail("STALE_OBSERVATION", "Coordinate click requires the current app screenshot.")
        }
        return MouseWindow(id: capture.windowId, frame: capture.frame)
    }
}

// Consume all native target geometry, including the source's false flipped
// default. Do not reconstruct a second window from the original indexed node.
extension MouseEventTarget {
    var mouseWindow: MouseWindow {
        MouseWindow(id: windowID, frame: windowBounds,
            usesFlippedCoordinates: windowUsesFlippedCoordinates)
    }
}
