import CoreGraphics

@main struct UIElementClickablePointTests {
    final class Failure: Error {}
    static func main() async throws {
        let frame = CGRect(x: 10, y: 20, width: 40, height: 20)
        let point = CGPoint(x: 30, y: 30)
        for requested in [false, true] { for scrolled in [false, true] {
            for hasFrame in [false, true] { for clip in [CGRect?.none, frame, CGRect(x: 0, y: 0, width: 1, height: 1)] {
                var calls: [String] = []
                do {
                    let result = try await uiElementClickablePoint(scrollToVisible: requested,
                        preferredPoint: { calls.append("preferred"); return nil },
                        frameBeforeScroll: { calls.append("before"); return frame },
                        scrollFrameToVisible: { f in precondition(f == frame); calls.append("scroll"); return scrolled },
                        readFrameAttribute: { fresh in calls.append("frame:\(fresh)"); return hasFrame ? frame : nil },
                        clippingFrame: { fresh in calls.append("clip:\(fresh)"); return clip })
                    precondition(hasFrame)
                    precondition(result.point == (clip == frame ? point : nil))
                    precondition(result.didScroll == (requested && scrolled))
                } catch UIElementGeometryError.elementHasNoFrame { precondition(!hasFrame) }
                let fresh = requested && scrolled
                precondition(calls == ["preferred"] + (requested ? ["before", "scroll"] : [])
                    + ["frame:\(fresh)"] + (hasFrame ? ["clip:\(fresh)"] : []))
            } }
        } }
        let preferred = try await uiElementClickablePoint(scrollToVisible: true,
            preferredPoint: { point }, frameBeforeScroll: { fatalError() },
            scrollFrameToVisible: { _ in fatalError() }, readFrameAttribute: { _ in fatalError() },
            clippingFrame: { _ in fatalError() })
        precondition(preferred.point == point && !preferred.didScroll)
        do {
            _ = try await uiElementClickablePoint(scrollToVisible: true,
                preferredPoint: { nil }, frameBeforeScroll: { nil },
                scrollFrameToVisible: { _ in fatalError() }, readFrameAttribute: { _ in fatalError() },
                clippingFrame: { _ in fatalError() })
            preconditionFailure()
        } catch UIElementGeometryError.elementHasNoFrame {}
        let failure = Failure()
        do {
            _ = try await uiElementClickablePoint(scrollToVisible: true,
                preferredPoint: { nil }, frameBeforeScroll: { frame },
                scrollFrameToVisible: { _ in throw failure }, readFrameAttribute: { _ in fatalError() },
                clippingFrame: { _ in fatalError() })
            preconditionFailure()
        } catch { precondition(error as AnyObject === failure) }
        let defaultPoint = try await uiElementClickablePoint { scroll in
            precondition(!scroll); return (point, true)
        }
        precondition(defaultPoint == point)
        print("clickable point preserves preferred geometry, scroll freshness, clipping and errors")
    }
}
