import ApplicationServices

extension UIElement {
    func frameValue(reportError: (Error) -> Void) -> CGRect? {
        frameValue(readAttribute: { axElement.value(for: $0) }, reportError: reportError)
    }

    func positionValue(reportError: (Error) -> Void) -> CGPoint? {
        positionValue(read: { axElement.value(for: .position) }, reportError: reportError)
    }

    func sizeValue(reportError: (Error) -> Void) -> CGSize? {
        sizeValue(read: { axElement.value(for: .size) }, reportError: reportError)
    }

    func isInsideWebView(reportError: @escaping (Error) -> Void) -> Bool {
        uiElementIsInsideWebView(self,
            parent: { $0.parentValue(reportError: reportError) },
            role: { $0.role }, bundleIdentifier: { $0.axElement.bundleIdentifier })
    }
}
