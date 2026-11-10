import AppKit

// AppKit setup phase 0x10009429c..0x1000943c4 of the native designated
// cursor-window initializer. Ownership/delegate/notification setup is separate.
@MainActor
func configureCursorWindowAppearance(_ window: NSWindow, style: ComputerUseCursorStyle) {
    window.title = "Software Cursor"
    window.collectionBehavior = NSWindow.CollectionBehavior(rawValue: 0x40048)
    window.isReleasedWhenClosed = false
    window.ignoresMouseEvents = true
    let controller = NSViewController()
    let view = style.makeView()
    view.wantsLayer = true
    controller.view = view
    window.contentViewController = controller
    window.backgroundColor = .clear
}
