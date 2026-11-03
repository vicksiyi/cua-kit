import Foundation
import AppKit

@MainActor
final class ClipboardStore {
    private let board: NSPasteboard
    private var previous: [[NSPasteboard.PasteboardType:Data]]?
    private var ownedChange = 0
    private var token: String?
    init(_ board: NSPasteboard = .general) { self.board = board }
    func begin(_ params: [String:Any]) throws -> [String:Any] {
        guard token == nil else { throw fail("INVALID_ARGUMENT","Clipboard lease already active.") }
        guard let text = params["text"] as? String, text.utf8.count <= 1024*1024 else { throw fail("INVALID_ARGUMENT","Clipboard text exceeds budget.") }
        let html = params["html"] as? String
        guard (html?.utf8.count ?? 0) <= 1024*1024 else { throw fail("INVALID_ARGUMENT","Clipboard HTML exceeds budget.") }
        let before = board.changeCount
        var saved: [[NSPasteboard.PasteboardType:Data]] = [], size = 0
        for item in board.pasteboardItems ?? [] {
            var formats: [NSPasteboard.PasteboardType:Data] = [:]
            for type in item.types {
                guard let data = item.data(forType:type) else { throw fail("UNSUPPORTED_CAPABILITY","Existing clipboard format could not be preserved.") }
                size += data.count
                guard size <= 16*1024*1024 else { throw fail("INVALID_ARGUMENT","Existing clipboard exceeds preservation budget; clipboard was not changed.") }
                formats[type] = data
            }
            saved.append(formats)
        }
        guard board.changeCount == before else { throw fail("STALE_OBSERVATION","Clipboard changed while preserving contents.") }
        let item = NSPasteboardItem(); item.setString(text,forType:.string)
        if let html = html { item.setString(html,forType:.html) }
        previous = saved; token = UUID().uuidString
        ownedChange = board.clearContents()
        guard board.writeObjects([item]) else { _ = try restore(token!); throw fail("PROVIDER_DISCONNECTED","Clipboard write failed.") }
        ownedChange = board.changeCount
        return ["token":token!]
    }
    func restore(_ expected: String) throws -> [String:Any] {
        guard token == expected, let saved = previous else { throw fail("INVALID_ARGUMENT","Unknown clipboard lease.") }
        defer { token = nil; previous = nil }
        guard board.changeCount == ownedChange else { return ["restored":false,"reason":"clipboard-changed-externally"] }
        let items = saved.map { formats -> NSPasteboardItem in
            let item = NSPasteboardItem(); for (type,data) in formats { item.setData(data,forType:type) }; return item
        }
        board.clearContents()
        guard items.isEmpty || board.writeObjects(items) else { throw fail("PROVIDER_DISCONNECTED","Clipboard restoration failed.") }
        return ["restored":true]
    }
    func restoreActive() { if let token = token { _ = try? restore(token) } }
}
@MainActor
func runClipboardChecks() throws {
    let board = NSPasteboard.withUniqueName(); defer { board.releaseGlobally() }
    let original = NSPasteboardItem(); original.setString("original",forType:.string)
    let binary = Data([0,1,2,250,255]); let custom = NSPasteboard.PasteboardType("com.vicksiyi.cua-test-binary")
    original.setData(binary,forType:custom); board.writeObjects([original])
    let store = ClipboardStore(board)
    let lease = try store.begin(["text":"new","html":"<b>new</b>"])
    guard board.string(forType:.html) == "<b>new</b>" else { throw fail("SELF_TEST_FAILED","HTML format missing.") }
    _ = try store.restore(lease["token"] as! String)
    guard board.string(forType:.string) == "original", board.data(forType:custom) == binary else { throw fail("SELF_TEST_FAILED","Clipboard formats were not restored.") }
    let next = try store.begin(["text":"temporary"])
    board.clearContents(); board.setString("external copy",forType:.string)
    let result = try store.restore(next["token"] as! String)
    guard result["restored"] as? Bool == false, board.string(forType:.string) == "external copy" else { throw fail("SELF_TEST_FAILED","External clipboard content overwritten.") }
}
