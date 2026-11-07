import ApplicationServices

// Local names for the four tags consumed by 0x1006e5154.
enum TransformedUIElementDateFormat: UInt8 {
    case date = 0, time = 1, dateAndTime = 2, monthAndYear = 3

    func makeFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        switch self {
        case .date:
            formatter.dateStyle = .short
            formatter.timeStyle = .none
        case .time:
            formatter.timeStyle = .short
            formatter.dateStyle = .none
        case .dateAndTime:
            formatter.dateStyle = .short
            formatter.timeStyle = .short
        case .monthAndYear:
            formatter.dateFormat = "MMMM yyyy"
        }
        return formatter
    }
}

// 0x100762924..<0x100762b78. Classification is derived from the element's
// cached AXValue by the caller, while raw is the constructor's supplied value.
// Preserve the source casts; callers must not invent a mismatching type tag.
func transformedUIElementFormattedValue(_ raw: AnyObject,
    classify: () -> TransformedUIElementValueType,
    dateFormat: () -> TransformedUIElementDateFormat
) -> String? {
    switch classify() {
    case .float, .integer: return (raw as! NSNumber).stringValue
    case .boolean: return CFBooleanGetValue((raw as! CFBoolean)) ? "on" : "off"
    case .string: return raw as! NSString as String
    case .date:
        let date = raw as! NSDate
        return dateFormat().makeFormatter().string(from: date as Date)
    case .unknown: return nil
    }
}

// Decision tail 0x10075c408..<0x10075c568. The AX integer accessor remains
// separate; absent/failed reads supply nil and select date+time.
func transformedUIElementDateFormat(components: Int?, reportUnknown: (UInt) -> Void)
    -> TransformedUIElementDateFormat {
    guard let components else { return .dateAndTime }
    let raw = UInt(components) // Source traps on a negative signed value.
    switch raw {
    case 0x0c, 0x0e: return .time
    case 0xc0: return .monthAndYear
    case 0xe0: return .date
    case 0xec, 0xee: return .dateAndTime
    default:
        reportUnknown(raw)
        return .dateAndTime
    }
}
