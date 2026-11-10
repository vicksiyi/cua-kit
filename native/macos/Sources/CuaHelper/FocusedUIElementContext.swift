// Native struct descriptor0x1012cd2d0 stores exactly these two values.
// Window/app/CG getters0x100786814..0x1007869c4 read the shared owner.
struct FocusedUIElementContext {
    enum Error: Swift.Error, CustomStringConvertible {
        // Enum descriptor0x1012cd2ec: only noAppNameMatch has a payload (String).
        case noAppNameMatch(String)
        case noFrontmostApp
        case noWindowsAvailable
        case cgWindowNotFound
        case invalidProcessIdentifier
        var description: String {
            switch self {
            case .noAppNameMatch(let name): return "No running application matches \(name)."
            case .noFrontmostApp: return "No frontmost application is available."
            case .noWindowsAvailable: return "The application has no available accessibility window."
            case .cgWindowNotFound: return "The accessibility window could not be matched to a WindowServer window."
            case .invalidProcessIdentifier: return "The application process identifier is invalid."
            }
        }
    }

    let element: UIElement?
    let applicationWindow: ApplicationWindow
    var app: ApplicationUIElement { applicationWindow.axApplication }
    var window: WindowUIElement { applicationWindow.axWindow }
    var cgWindow: NativeWindowDescription { applicationWindow.cgWindow }

    init(element: UIElement?, applicationWindow: ApplicationWindow) {
        self.element = element
        self.applicationWindow = applicationWindow
    }

    // Native construction0x100787560..0x1007876f8 resolves CG description
    // first, throws cgWindowNotFound on absence, then creates the window owner.
    init(app: ApplicationUIElement, window: WindowUIElement, element: UIElement?,
        resolve: (WindowUIElement, ApplicationUIElement) -> NativeWindowDescription?
    ) throws {
        guard let description = resolve(window, app) else { throw Error.cgWindowNotFound }
        self.init(element: element, applicationWindow: ApplicationWindow(cgWindow: description,
            axWindow: window, axApplication: app))
    }

    init(app: ApplicationUIElement, window: WindowUIElement, element: UIElement?,
        reportError: (Swift.Error) -> Void
    ) throws {
        try self.init(app: app, window: window, element: element,
            resolve: { $0.applicationWindowDescription(axApplication: $1, reportError: reportError) })
    }
}
