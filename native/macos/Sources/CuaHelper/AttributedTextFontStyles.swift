import AppKit
import CoreText

/// Font branch of 0x100770530. Restores the OS font resolver instead of guessing
/// traits from font names. Other style categories and transitions remain separate.
struct AttributedTextFontStyles: Equatable {
    let bold: Bool
    let italic: Bool
    let orderedFormats: [AttributedTextFormat]

    init(attributes: [NSAttributedString.Key: Any],
         resolveTraits: ([NSFontDescriptor.AttributeName: Any], Double) -> CTFontSymbolicTraits? = {
             attributes, size in
             let descriptor = NSFontDescriptor(fontAttributes: attributes)
             guard let font = NSFont(descriptor: descriptor, size: size) else { return nil }
             return CTFontGetSymbolicTraits(font)
         }) {
        guard let font = attributes[.accessibilityFont] as? [String: Any] else {
            bold = false
            italic = false
            orderedFormats = []
            return
        }
        var traits: CTFontSymbolicTraits = []
        if let name = font[NSAccessibility.FontAttributeKey.fontName.rawValue] as? String,
           let size = font[NSAccessibility.FontAttributeKey.fontSize.rawValue] as? Double {
            var descriptor: [NSFontDescriptor.AttributeName: Any] = [.name: name]
            // Original copies this optional Any without a String cast.
            if let family = font[NSAccessibility.FontAttributeKey.fontFamily.rawValue] {
                descriptor[.family] = family
            }
            traits = resolveTraits(descriptor, size) ?? []
        }
        // AXFontBold is additive, including when name/size/resolution failed.
        bold = traits.contains(.traitBold) || (font["AXFontBold"] as? Bool == true)
        italic = traits.contains(.traitItalic)
        var ordered: [AttributedTextFormat] = []
        if traits.contains(.traitBold) { ordered.append(.bold) }
        if italic { ordered.append(.italic) }
        if bold && !ordered.contains(.bold) { ordered.append(.bold) }
        orderedFormats = ordered
    }
}
