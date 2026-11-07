import AppKit
import ApplicationServices
import Darwin

struct MouseWindow {
    let id: UInt32
    let frame: CGRect
    // AppKit's event location is bottom-left based within the window.
    var usesFlippedCoordinates = true
}

private typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
private let setMouseWindowLocation: SetWindowLocation? = {
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventSetWindowLocation") else { return nil }
    return unsafeBitCast(symbol, to: SetWindowLocation.self)
}()

func applyMouseWindow(_ window: MouseWindow, to event: CGEvent) throws {
    // Native mouseEvent +288..+500 sets both window fields and a separate
    // window-local location. postToPid alone does not supply these fields.
    guard window.id != 0, let setLocation = setMouseWindowLocation else {
        throw fail("UNSUPPORTED_CAPABILITY", "Window-targeted mouse event support is unavailable.")
    }
    event.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: Int64(window.id))
    event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(window.id))
    let global = event.location
    let localY = global.y - window.frame.minY
    setLocation(event, CGPoint(x: global.x - window.frame.minX,
        y: window.usesFlippedCoordinates ? window.frame.height - localY : localY))
}

extension Target {
    func mouseWindow(_ params: [String: Any]) throws -> MouseWindow {
        try validateSnapshot(params)
        if let id = params["elementId"] as? Int {
            guard id > 0, id <= nodes.count,
                  let raw = attribute(nodes[id - 1].element, kAXWindowAttribute),
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
