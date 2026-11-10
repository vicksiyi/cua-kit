import Foundation
import UniformTypeIdentifiers

// Filename construction recovered from 101002614..101002c5c.
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
    static func filename(_ name: String?, reservedUTF16Count: Int32, date: Date?, type: UTType) -> String {
        makeFilename(name ?? type.localizedDescription ?? "Unknown",
            reservedUTF16Count: reservedUTF16Count, date: date, type: type)
    }

    static func directoryName(_ name: String?, reservedUTF16Count: Int32, date: Date?) -> String {
        makeFilename(name ?? "Unknown", reservedUTF16Count: reservedUTF16Count, date: date, type: nil)
    }

    private static func makeFilename(_ name: String, reservedUTF16Count: Int32,
        date: Date?, type: UTType?
    ) -> String {
        let escaped = name.escapedFilename()
        let dateSuffix = date.map { " " + dateStringForFilename($0) }
        let extensionSuffix = type.map { pathExtension(for: $0) }
        // Preserve checked native Int/Int32 arithmetic and negative reservation clamp.
        let suffixCount = (dateSuffix?.utf16.count ?? 0) + (extensionSuffix?.utf16.count ?? 0)
        let limit = Int32(255) - max(reservedUTF16Count, 0) - Int32(suffixCount)
        guard limit >= 1 else {
            return String(decoding: escaped.utf16.prefix(255), as: UTF16.self)
        }
        var output = Array(escaped.utf16.prefix(Int(limit)))
        if escaped.utf16.count > Int(limit), dateSuffix != nil {
            output.removeLast()
            output.append(contentsOf: "…".utf16)
        }
        if let dateSuffix { output.append(contentsOf: dateSuffix.utf16) }
        if let extensionSuffix { output.append(contentsOf: extensionSuffix.utf16) }
        return String(decoding: output, as: UTF16.self)
    }

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
