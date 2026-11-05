import Foundation
import AppKit

@MainActor
func runPasteTransactionChecks() async throws {
    // Named pasteboard only: never alter the user's general clipboard.
    let board = NSPasteboard.withUniqueName(); defer { board.releaseGlobally() }
    board.setString("original",forType:.string)
    let store = ClipboardStore(board)
    let result = try await withNativeClipboard(store,params:["text":"temporary","html":"<b>temporary</b>"]) {
        guard board.string(forType:.string) == "temporary", board.string(forType:.html) == "<b>temporary</b>" else { throw fail("SELF_TEST_FAILED","Paste formats absent.") }
        return ["outcome":"observed"]
    }
    guard result["clipboardRestored"] as? Bool == true, board.string(forType:.string) == "original" else { throw fail("SELF_TEST_FAILED","Successful paste failed restoration.") }
    for format in ["text","md","html"] {
        let content = try nativePasteContent(format == "html" ? "<b>hello</b>" : "**hello**",format:format)
        let transaction = try await withNativeClipboard(store,params:content) {
            guard board.string(forType:.string) == content["text"] as? String,
                  board.string(forType:.html) == content["html"] as? String else { throw fail("SELF_TEST_FAILED","Native paste format did not reach the clipboard") }
            return ["outcome":"observed"]
        }
        guard transaction["clipboardRestored"] as? Bool == true, board.string(forType:.string) == "original" else { throw fail("SELF_TEST_FAILED","Formatted paste did not restore clipboard") }
    }
    do {
        _ = try await withNativeClipboard(store,params:["text":"temporary"]) { throw fail("STALE_OBSERVATION","changed") }
        throw fail("SELF_TEST_FAILED","Paste error was lost.")
    } catch let error as Failure {
        guard error.code == "STALE_OBSERVATION", board.string(forType:.string) == "original" else { throw error }
    }
    do {
        _ = try await withNativeClipboard(store,params:["text":"temporary"]) {
            board.clearContents(); board.setString("external",forType:.string)
            return ["outcome":"observed"]
        }
        throw fail("SELF_TEST_FAILED","External copy was reported restored.")
    } catch let error as Failure {
        guard error.code == "ACTION_OUTCOME_UNKNOWN", board.string(forType:.string) == "external" else { throw error }
    }
    // An interrupted operation releases its lease so the next one can proceed.
    do {
        _ = try await withNativeClipboard(store,params:["text":"temporary"]) { throw CancellationError() }
        throw fail("SELF_TEST_FAILED","Cancellation was lost.")
    } catch is CancellationError {}
    let next = try await withNativeClipboard(store,params:["text":"next"]) { ["outcome":"observed"] }
    guard next["clipboardRestored"] as? Bool == true, board.string(forType:.string) == "external" else { throw fail("SELF_TEST_FAILED","Clipboard lease leaked.") }
}
