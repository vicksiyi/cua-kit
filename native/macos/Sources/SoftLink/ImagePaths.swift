/// Candidate construction recovered from 0x1002503a0..<0x100250cbc.
/// This only constructs strings: it neither checks existence nor normalizes.
public func resolveImagePaths(name: String, strategy: String) -> [String] {
    switch strategy {
    case "framework", "privateFramework":
        let directory = strategy == "framework" ? "Frameworks" : "PrivateFrameworks"
        let base = "/System/Library/\(directory)/\(name).framework/"
        return [base + name] + ["Current", "A", "B", "C"].map { base + "Versions/\($0)/" + name }
    case "library":
        return ["/usr/lib/" + name, "/usr/lib/system/" + name,
                "/usr/lib/system/lib" + name + ".dylib"]
    case "path":
        return [name]
    default:
        let base = "/System/Library/Frameworks/\(name).framework/Versions/"
        return ["C", "A", "B", "Current"].map { base + $0 + "/" + name }
    }
}
