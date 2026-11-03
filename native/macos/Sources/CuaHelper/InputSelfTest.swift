import Foundation
import ApplicationServices
import Carbon.HIToolbox

// CLI-only checks keep the helper testable with Apple's Command Line Tools (no XCTest module required).
func runInputChecks() throws {
    let text = String(repeating:"a",count:19)+"🌍你好"+String(repeating:"🙂",count:31)
    let chunks = unicodeChunks(text)
    guard String(decoding:chunks.flatMap{$0},as:UTF16.self) == text else { throw fail("SELF_TEST_FAILED","Unicode reconstruction differs.") }
    for chunk in chunks {
        guard chunk.count <= 20, !(0xDC00...0xDFFF).contains(chunk.first!), !(0xD800...0xDBFF).contains(chunk.last!) else { throw fail("SELF_TEST_FAILED","A surrogate pair was split across event chunks.") }
    }
    let key = try parseKey("super+Shift+a")
    guard key.code == CGKeyCode(kVK_ANSI_A), key.flags.contains(.maskCommand), key.flags.contains(.maskShift), !key.flags.contains(.maskControl), try parseKey("+").flags.contains(.maskShift) else { throw fail("SELF_TEST_FAILED","Key chord flags differ.") }
    do { _ = try parseKey("UnsupportedKey"); throw fail("SELF_TEST_FAILED","Unknown key accepted.") }
    catch let error as Failure { guard error.code == "UNSUPPORTED_CAPABILITY" else { throw error } }
}
