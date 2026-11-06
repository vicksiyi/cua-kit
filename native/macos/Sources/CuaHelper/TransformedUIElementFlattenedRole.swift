// Restored initializer 0x100761364..<0x100761544. Names below are local
// reconstruction names; the source owns a mutable, lazily initialized table.
var transformedUIElementFlattenedRoles: [UIElementRole: UIElementFlattenedRole] = [
    .staticText: UIElementFlattenedRole(separator: " ", description: "text", targetDescription: "text"),
    .radioButton: UIElementFlattenedRole(separator: "; ", description: "radio button", targetDescription: "radio buttons"),
    .row: UIElementFlattenedRole(separator: "; ", description: "outline row", targetDescription: "rows"),
]

// TransformedUIElement.flattenedRole, 0x10075dd48..<0x10075de70: read the
// stored transformed role and look up this table. No default-getter fallback.
// Full TransformedUIElement storage/transform construction is still separate.
func transformedUIElementFlattenedRole(role: UIElementRole) -> UIElementFlattenedRole? {
    transformedUIElementFlattenedRoles[role]
}
