import ApplicationServices

// 0x1012cc9c0: base UIElementProtocol conformance plus two throwing UInt32
// getters. rawWindowID is a descriptive reconstruction name for the first
// requirement; its original private spelling is not available in the symbols.
// Keep it distinct from the overridable concrete windowID (menus resolve a
// native menu-level window; ordinary windows/sheets use the raw AX reference).
protocol WindowUIElementProtocol: UIElementProtocol {
    var rawWindowID: UInt32 { get throws }
    var windowID: UInt32 { get throws }
}

extension WindowUIElementProtocol {
    var rawWindowID: UInt32 { get throws { try axElement.windowID } }
    // Named source extension getter 0x10072cea8 forwards through the first
    // window-specific getter witness. Concrete MenuUIElement overrides this.
    var windowID: UInt32 { get throws { try rawWindowID } }
}
