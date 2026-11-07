// EventStream fields at 0x1012c1e4c and iterator fields at 0x1012c1e74.
// Every makeAsyncIterator creates its own stream and native observer. Merely
// constructing this sequence does not subscribe to WindowServer notifications.
struct CGWindowEventStream<Window, Observer>: AsyncSequence {
    typealias Element = (Window, WindowServerEvent)
    typealias BufferingPolicy = AsyncStream<Element>.Continuation.BufferingPolicy
    var windowIDs: [UInt32]
    var events: [WindowServerEvent]
    var bufferingPolicy: BufferingPolicy
    let makeObserver: ([UInt32], [WindowServerEvent], @escaping (Window, WindowServerEvent) -> Void) -> Observer

    struct AsyncIterator: AsyncIteratorProtocol {
        // Source explicitly stores all three, including stream in addition to
        // iterator. Cancellation does not add an onTermination observer release.
        private let stream: AsyncStream<Element>
        private let observer: Observer
        private var iterator: AsyncStream<Element>.Iterator

        init(windowIDs: [UInt32], events: [WindowServerEvent], bufferingPolicy: BufferingPolicy,
            makeObserver: ([UInt32], [WindowServerEvent], @escaping (Window, WindowServerEvent) -> Void) -> Observer) {
            let pair = AsyncStream<Element>.makeStream(bufferingPolicy: bufferingPolicy)
            stream = pair.stream
            iterator = pair.stream.makeAsyncIterator()
            let continuation = pair.continuation
            observer = makeObserver(windowIDs, events) { window, event in
                _ = continuation.yield((window, event))
            }
        }
        mutating func next() async -> Element? { await iterator.next() }
    }
    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(windowIDs: windowIDs, events: events, bufferingPolicy: bufferingPolicy,
            makeObserver: makeObserver)
    }
}

extension CGWindowEventStream where Window == NativeWindowDescription, Observer == NativeCGWindowObserver {
    init(windowIDs: [UInt32], events: [WindowServerEvent], bufferingPolicy: BufferingPolicy) {
        self.init(windowIDs: windowIDs, events: events, bufferingPolicy: bufferingPolicy,
            makeObserver: { NativeCGWindowObserver(windowIDs: $0, events: $1, handler: $2) })
    }
}
