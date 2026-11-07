import ApplicationServices

private func resolveNativeMouseEventTarget<Window>(application: UIElement, point: CGPoint,
    accessibilityWindow: Window, hitElement: UIElement?, windowAX: (Window) -> AXUIElement,
    windowID: (Window) throws -> UInt32, windowFrame: (Window) -> CGRect?,
    reportError: @escaping (Error) -> Void) throws -> MouseEventTarget<UIElement, Window> {
    func actualPID(_ element: UIElement) -> Int32? {
        do { return try element.axElement.actualPID }
        catch { reportError(error); return nil }
    }
    return try resolveMouseEventTarget(at: point, accessibilityWindow: accessibilityWindow,
        hitElement: hitElement, applicationPID: { try application.axElement.pid },
        windowActualPID: { try windowAX($0).actualPID }, windowID: windowID,
        windowFrame: windowFrame,
        children: { $0.childrenValue(reportError: reportError) }, bundleIdentifier: { application.axElement.bundleIdentifier },
        outOfProcessTargetWindow: { try $0.outOfProcessMouseTargetWindow(appPID: $1, reportError: reportError) },
        elementWindowID: { try $0.axElement.windowID }, elementActualPID: actualPID,
        ancestorWindowID: { element, pid in
            try mouseEventWindowID(for: element, appPID: pid,
                parent: { $0.parentValue(reportError: reportError) }, actualPID: actualPID,
                windowID: { try $0.axElement.windowID })
        }, nativeWindowAtPoint: { systemNativeWindow(at: $0) }, nativeWindowID: { $0.id },
        nativeWindowForID: systemNativeWindowDescription, nativeWindowBounds: { $0.bounds },
        systemWideHitTest: { try AXUIElementCreateSystemWide().element(at: $0) })
}

extension UIElement {
    // Native resolver composition. This does not activate an app or post input.
    func mouseEventTarget(at point: CGPoint, accessibilityWindow: UIElement,
        hitElement: UIElement?, reportError: @escaping (Error) -> Void) throws -> MouseEventTarget<UIElement, UIElement> {
        try resolveNativeMouseEventTarget(application: self, point: point,
            accessibilityWindow: accessibilityWindow, hitElement: hitElement,
            windowAX: { $0.axElement }, windowID: { try $0.axElement.windowID },
            windowFrame: { $0.frameValue(reportError: reportError) }, reportError: reportError)
    }

    func mouseEventTarget(at point: CGPoint, windows: [UIElement],
        reportError: @escaping (Error) -> Void) throws -> MouseEventTarget<UIElement, UIElement> {
        try resolveMouseEventWindowAndElement(point, windows: windows,
            frame: { $0.frameValue(reportError: reportError) },
            hitTest: { try axElement.element(at: point) }, makeTarget: { window, hit in
                try mouseEventTarget(at: point, accessibilityWindow: window, hitElement: hit, reportError: reportError)
            })
    }
    func mouseEventTarget(at point: CGPoint, accessibilityWindow: any WindowUIElementProtocol,
        hitElement: UIElement?, reportError: @escaping (Error) -> Void) throws
        -> MouseEventTarget<UIElement, any WindowUIElementProtocol> {
        try resolveNativeMouseEventTarget(application: self, point: point,
            accessibilityWindow: accessibilityWindow, hitElement: hitElement,
            windowAX: { $0.axElement }, windowID: { try $0.rawWindowID },
            windowFrame: { $0.frameValue(reportError: reportError) }, reportError: reportError)
    }
    func mouseEventTarget(at point: CGPoint, windows: [any WindowUIElementProtocol],
        reportError: @escaping (Error) -> Void) throws -> MouseEventTarget<UIElement, any WindowUIElementProtocol> {
        try resolveMouseEventWindowAndElement(point, windows: windows,
            frame: { $0.frameValue(reportError: reportError) },
            hitTest: { try axElement.element(at: point) }, makeTarget: { window, hit in
                try mouseEventTarget(at: point, accessibilityWindow: window, hitElement: hit, reportError: reportError)
            })
    }

}
