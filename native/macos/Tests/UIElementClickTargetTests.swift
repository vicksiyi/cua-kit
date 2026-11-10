import AccessibilitySupport
import CoreGraphics

@main struct UIElementClickTargetTests {
    final class Failure: Error {}
    static func main() async throws {
        let failure = Failure()
        var events: [String] = []
        do {
            let _: (point: CGPoint, target: Int) = try await resolveUIElementClickTarget(
                clickablePoint: { events.append("point"); throw failure },
                targetAtPoint: { _ in events.append("target"); return 0 })
            preconditionFailure()
        } catch { precondition(error as AnyObject === failure) }
        precondition(events == ["point"])
        events = []
        do {
            let _: (point: CGPoint, target: Int) = try await resolveUIElementClickTarget(
                clickablePoint: { events.append("point"); return nil },
                targetAtPoint: { _ in events.append("target"); return 0 })
            preconditionFailure()
        } catch SynthesizedEvent.Error.cannotClickOffscreenElement {}
        precondition(events == ["point"])
        // A returned point is forwarded exactly; no substitute center, clipping,
        // coordinate conversion or new validation belongs to this source branch.
        for point in [CGPoint.zero, CGPoint(x: -12.5, y: 31.25)] {
            events = []
            let result = try await resolveUIElementClickTarget(
                clickablePoint: { events.append("point"); return point },
                targetAtPoint: { value in events.append("target"); precondition(value == point); return 42 })
            precondition(result.point == point && result.target == 42)
            precondition(events == ["point", "target"])
        }
        do {
            let _: (point: CGPoint, target: Int) = try await resolveUIElementClickTarget(
                clickablePoint: { .zero }, targetAtPoint: { _ in throw failure })
            preconditionFailure()
        } catch { precondition(error as AnyObject === failure) }
        let errors: Set<SynthesizedEvent.Error> = [.invalidParameter, .failedToCreateSource,
            .failedToTranslateKeyCodes, .cannotClickOffscreenElement]
        precondition(errors.count == 4)
        precondition(SynthesizedEvent(cgEvents: []).cgEvents.isEmpty)
        print("click target preserves offscreen rejection, point identity and original errors")
    }
}
