import Foundation

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
        print("Filename escaping and date stage checks passed")
    }
}
