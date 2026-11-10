// Source 0x10023b0ec..0x10023b138. The root is compared to the
// captured application identity (forwarded through 0x100240700/0x10023ce1c).
func withSelectionExtractionMenuBar<MenuBar>(
    rootMatchesMenuBarScope: Bool,
    contextType: UIElementContextType,
    readMenuBar: () -> MenuBar?,
    append: (MenuBar) -> Void
) {
    guard rootMatchesMenuBarScope else { return }
    // Even informational extraction reads the property before excluding it.
    guard let menuBar = readMenuBar() else { return }
    guard contextType.includesMenuBar else { return }
    append(menuBar)
}

extension UIElementTree where Element == TransformedUIElement {
    mutating func addSelectionExtractionMenuBar(root: any UIElementProtocol,
        application: ApplicationUIElement, context: inout UIElementTransformationContext,
        contextType: UIElementContextType, reportError: (Error) -> Void,
        reportUnknownDateComponents: (UInt) -> Void
    ) {
        withSelectionExtractionMenuBar(rootMatchesMenuBarScope: root.axElement == application.axElement,
            contextType: contextType,
            readMenuBar: { application.menuBarValue(reportError: reportError) },
            append: { menuBar in
                addMenuBarWithImmediateItems(menuBar, context: &context, reportError: reportError,
                    reportUnknownDateComponents: reportUnknownDateComponents)
            })
    }
}
