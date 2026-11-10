import Foundation
import UniformTypeIdentifiers

@main struct Check {
    static func main() {
        precondition("a/b/c".escapedFilename() == "a:b:c")
        precondition("a:b:c".displayFilename() == "a/b/c")
        precondition("a:b/c".escapedFilename() == "a:b:c")
        precondition("".escapedFilename().isEmpty && "".displayFilename().isEmpty)
        precondition("中文/😀/e\u{301}".escapedFilename() == "中文:😀:e\u{301}")
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "h.mm.ss a"
        let expected = dateFormatter.string(from: date) + " at " + timeFormatter.string(from: date)
        precondition(File.dateStringForFilename(date) == expected)
        precondition(File.dateStringForFilename(date) == File.dateStringForFilename(date))
        precondition(File.filename("a/b", reservedUTF16Count: 0, date: nil, type: .png) == "a:b.png")
        precondition(File.directoryName(nil, reservedUTF16Count: 0, date: nil) == "Unknown")
        precondition(File.filename(nil, reservedUTF16Count: 0, date: nil, type: .png) == (UTType.png.localizedDescription ?? "Unknown") + ".png")
        precondition(File.filename("", reservedUTF16Count: 0, date: nil, type: .png) == ".png")
        precondition(File.filename("name", reservedUTF16Count: -1, date: nil, type: .png) == "name.png")
        let long = String(repeating: "a", count: 300)
        precondition(File.filename(long, reservedUTF16Count: 0, date: nil, type: .png) == String(repeating: "a", count: 251) + ".png")
        let suffix = " " + expected + ".png"
        let dated = File.filename(long, reservedUTF16Count: 6, date: date, type: .png)
        precondition(dated == String(repeating: "a", count: 255 - 6 - suffix.utf16.count - 1) + "…" + suffix)
        precondition(dated.utf16.count == 249)
        // Budget exhaustion discards suffixes/reservation and uses a 255-unit base.
        precondition(File.filename(long, reservedUTF16Count: 255, date: date, type: .png) == String(repeating: "a", count: 255))
        let split = String(repeating: "a", count: 250) + "😀"
        let splitName = File.filename(split, reservedUTF16Count: 0, date: nil, type: .png)
        precondition(splitName == String(repeating: "a", count: 250) + "�.png")
        print("Filename escaping and date stage checks passed")
    }
}
