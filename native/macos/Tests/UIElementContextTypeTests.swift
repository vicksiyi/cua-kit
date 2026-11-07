@main
struct UIElementContextTypeTests {
    static func main() {
        let types = UIElementContextType.allCases
        precondition(types == [.fullUIContext, .eventStreamContext, .informationalContext])
        precondition(types.map(\.includesMenuBar) == [true, true, false])
        precondition(types.map(\.includesActionDescriptions) == [true, false, false])
        precondition(types.map(\.infersInteractionCapabilitiesFromCachedState) == [false, true, false])
        precondition(Set(types).count == 3)
        precondition(types.map { skyshotAXMaxChildCount(contextType: $0, isWebShaped: false) } == [100, 100, 100])
        precondition(types.map { skyshotAXMaxChildCount(contextType: $0, isWebShaped: true) } == [100, 20, 100])
        print("context types preserve menu, action description and cached-capability modes")
    }
}
