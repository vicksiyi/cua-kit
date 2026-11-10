import Foundation

// Extracted stages of native filename construction. The full UTF16 budget and
// truncation composition remains separate until its collection operations align.
private enum FileDateFormatters {
    // Native lazy DateFormatter instances set dateFormat only: preserve ambient
    // locale/calendar/timezone defaults rather than adding POSIX/UTC overrides.
    static let date: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    static let time: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "h.mm.ss a"
        return formatter
    }()
}

extension File {
    // 1010024b8..101002614: two cached formatters, literal separator " at ".
    static func dateStringForFilename(_ date: Date) -> String {
        FileDateFormatters.date.string(from: date) + " at " + FileDateFormatters.time.string(from: date)
    }
}

extension String {
    // 101001178 and 101002194 share native String replacement implementation.
    func escapedFilename() -> String { replacingOccurrences(of: "/", with: ":") }
    func displayFilename() -> String { replacingOccurrences(of: ":", with: "/") }
}
