// Enum descriptor 0x1012c9590, field descriptor 0x10132134c.
// Declaration order matches original allCases/tags; no external raw-value API.
enum UIElementContextType: CaseIterable, Hashable {
    case fullUIContext
    case eventStreamContext
    case informationalContext

    // 0x100638a74: tag != 2.
    var includesMenuBar: Bool { self != .informationalContext }
    // 0x10048177c: tag == 0.
    var includesActionDescriptions: Bool { self == .fullUIContext }
    // 0x100638a84: tag == 1.
    var infersInteractionCapabilitiesFromCachedState: Bool { self == .eventStreamContext }
}
