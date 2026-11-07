import Foundation
import CoreGraphics

// Restores EventTap start/stop and callback semantics (0x100732798..0x10073387c).
// Lifecycle calls are serialized by the owning scope, as in the source.
final class EventTap {
    enum Location { case session(CGEventTapLocation), process(Int32) }
    typealias Handler = (CGEventType, CGEvent) -> CGEvent?
    struct Driver {
        var create: (Location, CGEventTapPlacement, CGEventTapOptions, CGEventMask,
                     CGEventTapCallBack, UnsafeMutableRawPointer) -> CFMachPort?
        var enable: (CFMachPort, Bool) -> Void
        var invalidate: (CFMachPort) -> Void
        static let system = Driver(create: { location, place, options, mask, callback, info in
            switch location {
            case .session(let location):
                return CGEvent.tapCreate(tap: location, place: place, options: options,
                    eventsOfInterest: mask, callback: callback, userInfo: info)
            case .process(let pid):
                return CGEvent.tapCreateForPid(pid: pid, place: place, options: options,
                    eventsOfInterest: mask, callback: callback, userInfo: info)
            }
        }, enable: { CGEvent.tapEnable(tap: $0, enable: $1) },
           invalidate: { CFMachPortInvalidate($0) })
    }
    private final class Context {
        weak var owner: EventTap?
        init(_ owner: EventTap) { self.owner = owner }
    }
    let location: Location
    let placement: CGEventTapPlacement
    let options: CGEventTapOptions
    let eventsOfInterest: CGEventMask
    var shouldAutoreenable = true
    private let driver: Driver
    private var handler: Handler?
    private var port: CFMachPort?
    private var monitoringTask: RunLoopTask?
    var isMonitoring: Bool { monitoringTask != nil }

    init(location: Location, placement: CGEventTapPlacement, options: CGEventTapOptions,
         eventsOfInterest: CGEventMask, driver: Driver = .system) {
        self.location = location; self.placement = placement; self.options = options
        self.eventsOfInterest = eventsOfInterest; self.driver = driver
    }
    func startMonitoring(_ handler: @escaping Handler) {
        guard monitoringTask == nil else { return }
        self.handler = handler
        let context = Context(self)
        let info = Unmanaged.passUnretained(context).toOpaque()
        guard let port = driver.create(location, placement, options, eventsOfInterest,
            { _, type, event, info in
                guard let info else { return .passUnretained(event) }
                let context = Unmanaged<Context>.fromOpaque(info).takeUnretainedValue()
                guard let owner = context.owner else { return .passUnretained(event) }
                return owner.handle(type: type, event: event).map { .passUnretained($0) }
            }, info) else { return }
        let source = CFMachPortCreateRunLoopSource(nil, port, 0)
        self.port = port
        driver.enable(port, true)
        monitoringTask = RunLoopTask(name: "EventTap \(location) \(placement.rawValue)",
            qualityOfService: options.rawValue == 1 ? .background : .userInteractive,
            contextObject: context) { loop in
                if let source { CFRunLoopAddSource(loop, source, .commonModes) }
            }
    }
    func stopMonitoring() {
        guard monitoringTask != nil else { return }
        if let port {
            driver.enable(port, false)
            driver.invalidate(port)
            self.port = nil
        }
        monitoringTask = nil
    }
    // Kept internal to exercise disabled-event behavior without installing a tap.
    func handle(type: CGEventType, event: CGEvent) -> CGEvent? {
        if type == .tapDisabledByTimeout {
            if shouldAutoreenable, let port { driver.enable(port, true) }
            return event
        }
        if type == .tapDisabledByUserInput { return event }
        guard let handler else { return event }
        return handler(type, event)
    }
    deinit { stopMonitoring() }
}
