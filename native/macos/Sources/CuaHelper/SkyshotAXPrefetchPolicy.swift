// Extracted from SkyshotOperation.captureAXTree's continuation at
// 0x1002347ac..0x1002347c0. This helper name is local to the reconstruction;
// the source keeps the expression inline at the capture call site.
func skyshotAXMaxChildCount(contextType: UIElementContextType, isWebShaped: Bool) -> Int {
    contextType == .eventStreamContext && isWebShaped ? 20 : 100
}
