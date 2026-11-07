import ApplicationServices

// 0x1007161c4..0x1007162a4. Last window is intentional; do not substitute
// first, frontmost WindowServer ordering or captured screenshot geometry.
func applicationPrimaryWindow<Window>(focusedWindow: () -> Window?, mainWindow: () -> Window?,
    windows: () -> [Window]) -> Window? {
    focusedWindow() ?? mainWindow() ?? windows().last
}

extension UIElement {
    func primaryWindowValue(reportError: (Error) -> Void) -> UIElement? {
        applicationPrimaryWindow(focusedWindow: {
            focusedWindowValue(transaction: UIElementTreeTransaction.current?.cache, reportError: reportError)
        }, mainWindow: {
            let attribute = UIElementAttribute("AXMainWindow")
            return elementValue(for: attribute, transaction: UIElementTreeTransaction.current?.cache,
                read: { axElement.value(for: attribute) }, reportError: reportError)
        }, windows: {
            elementCollectionValue(for: UIElementAttribute("AXWindows"), reportError: reportError)
        })
    }
}
