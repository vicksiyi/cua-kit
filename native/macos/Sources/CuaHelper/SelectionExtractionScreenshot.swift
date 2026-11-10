import CoreGraphics

// 0x10023b474: alwaysIncludeScreenshot short-circuits this predicate.
// The destination field is FocusedUIElementAccessibilityInfo.screenshotNeededForContext.
// The separately captured app.isWebShaped gates the outer URL rule.
func selectionExtractionScreenshotNeededForContext(alwaysIncludeScreenshot: Bool,
    needsScreenshot: () -> Bool) -> Bool {
    alwaysIncludeScreenshot || needsScreenshot()
}

// Source 0x10023eb1c..0x10023f630. Materialize/filter before provider reads,
// and preserve the second bundle lookup after the image phase.
func selectionExtractionNeedsScreenshot<Element>(bundleIdentifier: () -> String?,
    elements: () -> [Element], isImage: (Element) -> Bool,
    size: (Element) -> CGSize?, isSticker: (Element) -> Bool,
    actionDescriptions: (Element) -> [String]
) -> Bool {
    let excluded = ["inc.software.app", "inc.software.development.app",
        "com.openai.sky.app", "com.openai.sky.development.app"]
    if let bundle = bundleIdentifier(), excluded.contains(bundle) { return false }
    let nodes = elements()
    if nodes.count <= 9 { return true }
    let images = nodes.filter(isImage)
    for node in images {
        if let size = size(node), size.width > 100 && size.height > 100 { return true }
    }
    guard bundleIdentifier() == "com.apple.MobileSMS" else { return false }
    let stickers = nodes.filter(isSticker)
    let requiredActions: Set<String> = ["Add to Photos Library", "Quick Look"]
    for node in stickers {
        if !requiredActions.intersection(Set(actionDescriptions(node))).isEmpty { return true }
    }
    return false
}

func selectionExtractionNeedsScreenshot(tree: UIElementTree<TransformedUIElement>,
    application: ApplicationUIElement, reportError: (Error) -> Void
) -> Bool {
    selectionExtractionNeedsScreenshot(bundleIdentifier: { application.axElement.bundleIdentifier },
        elements: { Array(tree) },
        isImage: { $0.role == .image || $0.roleDescription == "image" || $0.subrole == "AXTextAttachment" },
        size: { $0.sizeValue(reportError: reportError) },
        isSticker: { $0.role == .button && $0.identifier == "Sticker" },
        actionDescriptions: { $0.element.actionDescriptions.map { $0.description } })
}
