import Foundation

/// Native record at descriptor 0x1012e45f4. A JSON object containing a Set<String>,
/// not a top-level array. Set iteration/encoding order is intentionally unspecified.
struct NativePersistentAppApprovals: Codable, Equatable, Sendable {
    var approvedBundleIdentifiers: Set<String> = []
}

/// Storage core recovered from the pinned AppApprovalStore actor. This is not
/// wired into the demo's approval UI and does not itself authorize an operation.
actor NativeAppApprovalStore {
    /// Host error representation; vendor localized error text is not yet restored.
    struct MissingStorageURL: Error { let bundleIdentifier: String }
    struct Snapshot: Sendable {
        let session: Set<String>
        let persistent: Set<String>
        let modificationDate: Date?
    }
    private let storageURL: URL?
    private var sessionApprovedBundleIdentifiers: Set<String> = []
    private var persistentApprovals: NativePersistentAppApprovals
    private var persistentApprovalsModificationDate: Date?

    /// 0x100db8c0c..<0x100db8f30: read/decode failures produce empty persistent
    /// state; modification date is captured after loading, including on failure.
    init(storageURL: URL?) {
        self.storageURL = storageURL
        self.persistentApprovals = Self.load(storageURL)
        self.persistentApprovalsModificationDate = Self.modificationDate(storageURL)
    }

    /// 0x100db9280..<0x100db97b4. Mutation ordering is significant: a persistence
    /// failure does not roll back the session entry or an already inserted record.
    func recordApproval(bundleIdentifier: String, persist: Bool) throws {
        sessionApprovedBundleIdentifiers.insert(bundleIdentifier)
        guard persist else { return }
        guard let storageURL else { throw MissingStorageURL(bundleIdentifier: bundleIdentifier) }
        persistentApprovals.approvedBundleIdentifiers.insert(bundleIdentifier)
        try FileManager.default.createDirectory(at: storageURL.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(persistentApprovals)
        try data.write(to: storageURL, options: [])
        persistentApprovalsModificationDate = Self.modificationDate(storageURL)
    }

    /// 0x100db97b4..<0x100db9cb4. Refresh only on optional-date inequality;
    /// missing/corrupt/unreadable files clear persistent state, not session state.
    func refreshPersistentApprovals() {
        let date = Self.modificationDate(storageURL)
        guard date != persistentApprovalsModificationDate else { return }
        persistentApprovals = Self.load(storageURL)
        persistentApprovalsModificationDate = date
    }

    /// Test/inspection seam, not a replacement for native policy or host approval.
    func snapshot() -> Snapshot {
        Snapshot(session: sessionApprovedBundleIdentifiers,
                 persistent: persistentApprovals.approvedBundleIdentifiers,
                 modificationDate: persistentApprovalsModificationDate)
    }

    private static func load(_ url: URL?) -> NativePersistentAppApprovals {
        guard let url, let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(NativePersistentAppApprovals.self, from: data)
        else { return NativePersistentAppApprovals() }
        return value
    }

    /// 0x100db8f30..<0x100db9280: attributesOfItem(atPath:), Date cast, nil on error.
    private static func modificationDate(_ url: URL?) -> Date? {
        guard let url, let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
        else { return nil }
        return attributes[.modificationDate] as? Date
    }
}
