import Foundation

// Storage/delivery semantics of SystemFrontmostApplicationTracker for its
// excludeCurrentApp=false branch. Notification transport is a separate owner.
final class FrontmostApplicationObservationStore<Application: Equatable> {
    final class Observer {
        let update: (Application) -> Void
        init(update: @escaping (Application) -> Void) { self.update = update }
    }
    private let currentLock = NSLock()
    private var current: Application?
    private let observersLock = NSLock()
    private var observers: [Observer] = []
    var frontmostApplication: Application? {
        currentLock.lock(); defer { currentLock.unlock() }; return current
    }
    func addObserver(_ update: @escaping (Application) -> Void) -> Observer {
        let observer = Observer(update: update)
        observersLock.lock(); defer { observersLock.unlock() }
        observers.append(observer)
        return observer
    }
    func removeObserver(_ observer: Observer) {
        observersLock.lock(); defer { observersLock.unlock() }
        if let index = observers.firstIndex(where: { $0 === observer }) { observers.remove(at: index) }
    }
    func observe(_ application: Application) {
        currentLock.lock()
        guard current != application else { currentLock.unlock(); return }
        current = application
        currentLock.unlock()
        observersLock.lock()
        let snapshot = observers
        observersLock.unlock()
        for observer in snapshot { observer.update(application) }
    }
}
