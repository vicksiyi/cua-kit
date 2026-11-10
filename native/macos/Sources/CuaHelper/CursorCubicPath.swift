import CoreGraphics

// Readable extraction of native sampling 0x100095238 and derivative
// 0x10009df30. Segment storage is endpoint, first control, second control.
struct CursorCubicPath {
    struct Segment {
        var endpoint: CGPoint
        var control1: CGPoint
        var control2: CGPoint
    }
    struct Sample {
        let position: CGPoint
        // Derivative with respect to the segment's local t, not global progress.
        let tangent: CGPoint
    }
    var start: CGPoint
    var segments: [Segment]

    func sample(at progress: CGFloat) -> Sample {
        precondition(!segments.isEmpty)
        let index: Int
        let t: CGFloat
        // FCMP/B.PL routes unordered (NaN) to the final endpoint too.
        if progress.isNaN || progress >= 1 {
            index = segments.count - 1
            t = 1
        } else {
            let bounded = progress < 0 ? 0 : progress
            let scaled = bounded * CGFloat(segments.count)
            index = Int(scaled)
            t = scaled - CGFloat(index)
        }
        let segment = segments[index]
        let initial = index == 0 ? start : segments[index - 1].endpoint
        let u = 1 - t
        let threeU = u * 3
        let w0 = u * (u * u)
        let w1 = t * (u * threeU)
        let w2 = t * (t * threeU)
        let w3 = t * (t * t)
        func position(_ a: CGFloat, _ b: CGFloat, _ c: CGFloat, _ d: CGFloat) -> CGFloat {
            ((w0 * a + w1 * b) + w2 * c) + w3 * d
        }
        let first = 3 * u * u
        let middle = 6 * u * t
        let last = 3 * t * t
        func tangent(_ a: CGFloat, _ b: CGFloat, _ c: CGFloat, _ d: CGFloat) -> CGFloat {
            (first * (b - a) + middle * (c - b)) + last * (d - c)
        }
        return Sample(position: CGPoint(
            x: position(initial.x, segment.control1.x, segment.control2.x, segment.endpoint.x),
            y: position(initial.y, segment.control1.y, segment.control2.y, segment.endpoint.y)),
            tangent: CGPoint(
                x: tangent(initial.x, segment.control1.x, segment.control2.x, segment.endpoint.x),
                y: tangent(initial.y, segment.control1.y, segment.control2.y, segment.endpoint.y)))
    }
}
