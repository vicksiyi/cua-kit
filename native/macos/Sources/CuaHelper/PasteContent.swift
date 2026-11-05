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
func runPasteContentChecks() throws {
    let plain = try nativePasteContent("你好 🌍",format:"text")
    guard plain["text"] as? String == "你好 🌍", plain["html"] == nil else { throw fail("SELF_TEST_FAILED","Plain paste changed") }
    let markdown = try nativePasteContent("**hello** 🌍",format:"md")
    guard markdown["text"] as? String == "**hello** 🌍", (markdown["html"] as? String)?.contains("<strong>hello</strong>") == true, markdown["richText"] as? String == "hello 🌍" else { throw fail("SELF_TEST_FAILED","Markdown formats differ") }
    let html = try nativePasteContent("<p>A &amp; <b>B</b></p><script>bad()</script><img src='https://example.invalid/image'>",format:"html")
    guard html["text"] as? String == "A & B", let rich = html["html"] as? String, !rich.contains("script"), !rich.contains("<img") else { throw fail("SELF_TEST_FAILED","HTML cleanup/text extraction differs") }
}
