import Foundation
import Ink
import SwiftSoup

// Independent Swift format implementation; original native renderer is unavailable.
// Third-party parsers are reused, not reimplemented or presented as vendor dependencies.
func nativePasteContent(_ text: String, format: String) throws -> [String: Any] {
    guard text.utf16.count <= 200000, ["text","md","html"].contains(format) else {
        throw fail("INVALID_ARGUMENT", "Invalid paste format or input exceeds text budget.")
    }
    if format == "text" { return ["text":text] }
    let rendered = format == "md" ? MarkdownParser().html(from:text) : text
    let allowed = try Whitelist.relaxed().removeTags("img")
    guard let html = try SwiftSoup.clean(rendered,allowed), html.utf8.count <= 1024*1024 else {
        throw fail("INVALID_ARGUMENT", "Rendered HTML exceeds clipboard budget.")
    }
    let plain = try SwiftSoup.parseBodyFragment(html).text()
    return ["text":format == "md" ? text : plain, "html":html, "richText":plain]
}
// Legacy NDJSON bridge forwards raw text/format; rendering and validation stay native.
func nativeFormattedPasteParameters(_ params: [String: Any]) throws -> [String: Any] {
    guard let text = params["text"] as? String, let format = params["format"] as? String else {
        throw fail("INVALID_ARGUMENT", "Paste requires text and format strings.")
    }
    var input = params
    input.removeValue(forKey:"html")
    input.removeValue(forKey:"richText")
    input.removeValue(forKey:"format")
    for (key,value) in try nativePasteContent(text,format:format) { input[key] = value }
    return input
}
func runPasteContentChecks() throws {
    let bridged = try nativeFormattedPasteParameters(["targetId":"fixture","snapshotId":"snapshot","text":"**hello**","format":"md","html":"untrusted","richText":"untrusted"])
    guard bridged["targetId"] as? String == "fixture", bridged["snapshotId"] as? String == "snapshot",
          bridged["richText"] as? String == "hello", (bridged["html"] as? String)?.contains("<strong>hello</strong>") == true,
          bridged["format"] == nil else { throw fail("SELF_TEST_FAILED","Native format bridge changed context or accepted caller-rendered content") }
    let plain = try nativePasteContent("你好 🌍",format:"text")
    guard plain["text"] as? String == "你好 🌍", plain["html"] == nil else { throw fail("SELF_TEST_FAILED","Plain paste changed") }
    let markdown = try nativePasteContent("**hello** 🌍",format:"md")
    guard markdown["text"] as? String == "**hello** 🌍", (markdown["html"] as? String)?.contains("<strong>hello</strong>") == true, markdown["richText"] as? String == "hello 🌍" else { throw fail("SELF_TEST_FAILED","Markdown formats differ") }
    let html = try nativePasteContent("<p>A &amp; <b>B</b></p><script>bad()</script><img src='https://example.invalid/image'>",format:"html")
    guard html["text"] as? String == "A & B", let rich = html["html"] as? String, !rich.contains("script"), !rich.contains("<img") else { throw fail("SELF_TEST_FAILED","HTML cleanup/text extraction differs") }
}
