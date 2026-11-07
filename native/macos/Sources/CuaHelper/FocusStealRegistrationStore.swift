import Foundation

// Registration list behavior from 0x10074b2f4/74b40c. Records append even
// for duplicate PIDs; unregister removes the first match. The source releases
// its singleton when removal leaves the list empty.
final class FocusStealRegistrationStore<Record> {
    private let lock = NSLock()
    private var records: [Record] = []
    private let pid: (Record) -> Int32
    private let becameEmpty: () -> Void
    init(pid: @escaping (Record) -> Int32, becameEmpty: @escaping () -> Void) {
        self.pid = pid; self.becameEmpty = becameEmpty
    }
    func append(_ record: Record) {
        lock.lock(); defer { lock.unlock() }
        records.append(record)
    }
    @discardableResult func removeFirst(pid target: Int32) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard let index = records.firstIndex(where: { pid($0) == target }) else { return false }
        records.remove(at: index)
        if records.isEmpty { becameEmpty() }
        return true
    }
    var snapshot: [Record] {
        lock.lock(); defer { lock.unlock() }; return records
    }
}
