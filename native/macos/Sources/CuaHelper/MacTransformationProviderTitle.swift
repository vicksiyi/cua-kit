import ApplicationServices

// Native callback0x10075a944 constructs the provider cache from the current
// tree transaction, then decodes cached AXTitle. A converted display title
// from a captured TransformedUIElement is not authoritative for this check.
func macTransformationProviderTitle(_ identity: AXUIElement) -> String? {
    UIElement(element: identity).title
}
