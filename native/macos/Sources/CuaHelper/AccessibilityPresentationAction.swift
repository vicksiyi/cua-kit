// Field descriptors 0x10132117c and 0x1013211a4. Both stored fields are var;
// Kind has four payload-free cases and Hashable/Equatable conformance.
struct AccessibilityPresentationAction {
    enum Kind: Hashable { case press, showMenu, scrollToVisible, other }
    var kind: Kind
    var description: String
}
