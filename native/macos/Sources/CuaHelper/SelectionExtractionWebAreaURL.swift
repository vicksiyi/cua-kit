import Foundation

// 0x10023c064 iterates the main tree in pre-order and returns the first
// captured nonnil URL on a WebArea. A WebArea without a URL does not stop
// the search; other roles and the standalone focused snapshot are ignored.
func selectionExtractionWebAreaURL(tree: UIElementTree<TransformedUIElement>) -> URL? {
    for element in tree where element.role == .webArea {
        if let url = element.url { return url }
    }
    return nil
}
