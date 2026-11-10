// Source owner orderOut 0x10009330c..0x100093b58. The initial visibility
// snapshot is diagnostic only; branch on fresh visibility after awaiting delegate.
@MainActor
func orderOutCursor(willHide: () async -> Void, isVisible: () -> Bool,
    prepareWindow: () -> Void, hideAnimated: () async -> Void,
    hideImmediately: () -> Void, didHide: () -> Void, postDidHide: () -> Void
) async {
    await willHide()
    let visible = isVisible()
    prepareWindow() // clear wantsToBeVisible and reset the current window
    if visible { await hideAnimated() } else { hideImmediately() }
    didHide() // caller resolves current weak delegate again after suspension
    postDidHide()
}
