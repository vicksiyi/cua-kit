import Foundation

// Native role identity uses CFString equality/hash, like UIElementAttribute,
// but remains a distinct type so role frequencies cannot mix with attributes.
struct UIElementRole: Hashable {
    // Static initializer 0x1007b9798 encodes exactly AXUnknown.
    static let unknown = UIElementRole("AXUnknown")
    static let button = UIElementRole("AXButton")
    static let radioButton = UIElementRole("AXRadioButton")
    static let row = UIElementRole("AXRow")
    static let staticText = UIElementRole("AXStaticText")
    static let image = UIElementRole("AXImage")
    static let webArea = UIElementRole("AXWebArea")
    static let scrollBar = UIElementRole("AXScrollBar")
    static let menuItem = UIElementRole("AXMenuItem")
    static let menuBarItem = UIElementRole("AXMenuBarItem")
    static let textArea = UIElementRole("AXTextArea")
    static let textField = UIElementRole("AXTextField")
    static let dateTimeArea = UIElementRole("AXDateTimeArea")

    let name: CFString

    init(_ name: CFString) { self.name = name }
    init(_ name: String) { self.name = name as CFString }

    var rawValue: String { name as String }

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.name == rhs.name }
    func hash(into hasher: inout Hasher) { name.hash(into: &hasher) }
}
