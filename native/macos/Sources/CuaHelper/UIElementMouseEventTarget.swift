import ApplicationServices

extension UIElement {
    // Native resolver composition. This does not activate an app or post input.
    func mouseEventTarget(at point: CGPoint, accessibilityWindow: UIElement,
        hitElement: UIElement?, reportError: @escaping (Error) -> Void) throws -> MouseEventTarget<UIElement, UIElement> {
        func actualPID(_ element: UIElement) -> Int32? {
            do { return try element.axElement.actualPID }
            catch { reportError(error); return nil }
        }
        return try resolveMouseEventTarget(at: point, accessibilityWindow: accessibilityWindow,
            hitElement: hitElement, applicationPID: { try axElement.pid },
            windowActualPID: { try $0.axElement.actualPID }, windowID: { try $0.axElement.windowID },
            windowFrame: { $0.frameValue(reportError: reportError) },
            children: { $0.childrenValue(reportError: reportError) }, bundleIdentifier: { axElement.bundleIdentifier },
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

    func mouseEventTarget(at point: CGPoint, windows: [UIElement],
        reportError: @escaping (Error) -> Void) throws -> MouseEventTarget<UIElement, UIElement> {
        try resolveMouseEventWindowAndElement(point, windows: windows,
            frame: { $0.frameValue(reportError: reportError) },
            hitTest: { try axElement.element(at: point) }, makeTarget: { window, hit in
                try mouseEventTarget(at: point, accessibilityWindow: window, hitElement: hit, reportError: reportError)
            })
    }
}
