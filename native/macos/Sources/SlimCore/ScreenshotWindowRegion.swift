import CoreGraphics

// Included-window display branch fb8ca4..fb912c. Crop references the first
// requested ID, not the first successfully resolved window. Missing first ID
// falls through to the union of resolved windows. Empty union remains null.
public func screenshotWindowRegion<Window>(includedWindowIDs: [UInt32], cropToFirstWindow: Bool,
    lookup: (UInt32) -> Window?, resolvedWindows: [Window], frame: (Window) -> CGRect
) -> CGRect {
    if cropToFirstWindow, let firstID = includedWindowIDs.first,
       let first = lookup(firstID) {
        return frame(first)
    }
    var region = CGRect.null
    for window in resolvedWindows { region = region.union(frame(window)) }
    return region
}
