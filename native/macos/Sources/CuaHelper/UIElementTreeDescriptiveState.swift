import Foundation

extension UIElementTree.Item {
    // 0x10064f3d4: own value first, then every descendant in tree sequence
    // order. Trim each value separately, drop empty values, retain duplicates.
    func flattenedString(_ value: (Element) -> String?) -> String {
        let values = [value(element) ?? ""] + subtree.compactMap(value)
        return values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }.joined(separator: "\n")
    }

    // 0x10064f72c. Unlike Element.hasDescriptiveAttributes, this predicate
    // considers descendant strings and ignores whitespace-only strings.
    // The final role comparison applies only to this item, not descendants.
    var hasDescriptiveAttributes: Bool {
        !flattenedString { $0.description }.isEmpty ||
        !flattenedString { $0.value }.isEmpty ||
        !flattenedString { $0.title }.isEmpty ||
        !flattenedString { $0.placeholderValue }.isEmpty ||
        element.role == .image
    }
}
