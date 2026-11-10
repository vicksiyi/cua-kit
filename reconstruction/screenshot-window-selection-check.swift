import Foundation

@main struct Check {
    struct Window { let id: UInt32; let name: String }
    static func main() {
        let windows = [Window(id: 7, name: "first"), Window(id: 7, name: "duplicate"), Window(id: 9, name: "other")]
        var calls: [String] = []
        func select(_ ids: [UInt32]?, _ app: String?) -> Window? {
            selectScreenshotWindow(includedWindowIDs: ids, appName: app,
                windows: { calls.append("windows"); return windows },
                windowID: { calls.append("id \($0.name)"); return $0.id },
                matchingApp: { calls.append("app \($0)"); return windows[2] })
        }
        precondition(select([7], "app")?.name == "first")
        precondition(calls == ["windows", "id first"])
        calls = []
        precondition(select([99], "app") == nil)
        precondition(calls == ["windows", "id first", "id duplicate", "id other"])
        calls = []
        precondition(select([7, 9], "app") == nil && calls.isEmpty)
        precondition(select([7, 7], "app") == nil && calls.isEmpty)
        precondition(select(nil, nil) == nil && calls.isEmpty)
        precondition(select([], nil) == nil && calls.isEmpty)
        precondition(select([], "app")?.id == 9 && calls == ["app app"])
        calls = []
        precondition(select(nil, "")?.id == 9 && calls == ["app "])
        print("Screenshot window selection routing checks passed")
    }
}
