import Foundation

// Controller initializer 0x10006d660..0x10006d7a4. Preserve order; do not
// substitute focused-window/destroyed notifications for the root subscriptions.
enum AppControllerAXNotifications {
    static let root: [AXNotification] = [
        .windowCreated, .menuOpened, .menuClosed,
        .sheetCreated, .windowMoved, .windowResized,
    ]
    static let qualityOfService: QualityOfService = .userInitiated
}
