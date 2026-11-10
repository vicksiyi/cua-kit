public extension CGWindow {
    // Native descriptor1012c1e4c: exactly windowIDs/events/bufferingPolicy.
    // Value construction stores configuration only; subscriptions belong to iterators.
    struct EventStream: AsyncSequence {
        public typealias Element = (CGWindow, WindowServerEvent)
        public typealias BufferingPolicy = AsyncStream<Element>.Continuation.BufferingPolicy
        public var windowIDs: [UInt32]
        public var events: [WindowServerEvent]
        public var bufferingPolicy: BufferingPolicy

        public init(windowIDs: [UInt32], events: [WindowServerEvent], bufferingPolicy: BufferingPolicy) {
            self.windowIDs = windowIDs
            self.events = events
            self.bufferingPolicy = bufferingPolicy
        }

        // Native descriptor1012c1e74: retained stream, observer, mutable iterator.
        public struct AsyncIterator: AsyncIteratorProtocol {
            private let stream: AsyncStream<Element>
            private let observer: CGWindow.Observer
            private var iterator: AsyncStream<Element>.Iterator

            public init(windowIDs: [UInt32], events: [WindowServerEvent], bufferingPolicy: BufferingPolicy) {
                let pair = AsyncStream<Element>.makeStream(bufferingPolicy: bufferingPolicy)
                stream = pair.stream
                iterator = pair.stream.makeAsyncIterator()
                let continuation = pair.continuation
                observer = CGWindow.Observer(windowIDs: windowIDs, events: events,
                    eventHandler: { window, event in _ = continuation.yield((window, event)) })
            }

            public mutating func next() async -> Element? { await iterator.next() }
        }

        public func makeAsyncIterator() -> AsyncIterator {
            AsyncIterator(windowIDs: windowIDs, events: events, bufferingPolicy: bufferingPolicy)
        }
    }
}
