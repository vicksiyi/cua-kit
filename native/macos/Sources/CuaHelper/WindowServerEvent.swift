// Field descriptor 0x10131bb78 and raw-value table 0x10116c6bc.
// Keep source values rather than substituting AX notification names.
enum WindowServerEvent: UInt32, CaseIterable {
    case isObscured = 800
    case isUnobscured = 801
    case isOrderedIn = 802
    case isOrderedOut = 803
    case isTerminated = 804
    case isChangingScreens = 805
    case didMove = 806
    case didResize = 807
    case didChangeOrder = 808
    case geometryDidChange = 809
    case monitorDataPending = 810
    case didCreate = 811
    case rightsGrantOffered = 812
    case rightsGrantCompleted = 813
    case recordForTermination = 814
    case isVisible = 815
    case isInvisible = 816
    case workspaceAddWindow = 1325
    case workspaceRemoveWindow = 1326
    case workspaceCreated = 1327
    case workspaceDestroyed = 1328
}

typealias WindowServerNotificationCallback = @convention(c)
    (UInt32, UnsafeMutableRawPointer?, UInt32, UnsafeMutableRawPointer?) -> Void
