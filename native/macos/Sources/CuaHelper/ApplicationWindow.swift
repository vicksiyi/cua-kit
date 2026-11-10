import ApplicationServices

// Native ApplicationWindow designated initializer0x10077f394 stores three
// values. cgWindow/axWindow are mutable, axApplication is read-only. This is
// the object retained by SystemSelection; it is not an input-only MouseWindow.
final class ApplicationWindow {
    var cgWindow: NativeWindowDescription
    var axWindow: WindowUIElement
    let axApplication: ApplicationUIElement
    var id: UInt32 { cgWindow.id }

    init(cgWindow: NativeWindowDescription, axWindow: WindowUIElement,
        axApplication: ApplicationUIElement) {
        self.cgWindow = cgWindow
        self.axWindow = axWindow
        self.axApplication = axApplication
    }
    // Native AX-window construction0x10077f1e8. Resolver is the full source
    // CG-window accessor, including its fallbacks; no ID-only default supplied.
    convenience init?(axWindow: WindowUIElement, axApplication: ApplicationUIElement,
        resolve: (WindowUIElement, ApplicationUIElement) -> NativeWindowDescription?) {
        guard let window = resolve(axWindow, axApplication) else { return nil }
        self.init(cgWindow: window, axWindow: axWindow, axApplication: axApplication)
    }

    convenience init?(axWindow: WindowUIElement, axApplication: ApplicationUIElement,
        reportError: (Error) -> Void) {
        self.init(axWindow: axWindow, axApplication: axApplication,
            resolve: { $0.applicationWindowDescription(axApplication: $1, reportError: reportError) })
    }

}
