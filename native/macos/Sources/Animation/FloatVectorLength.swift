import simd

// Native AnimatableScalar Float witnesses delegate to SIMD vector length.
// Preserve system SIMD reductions, including overflow/NaN behavior, rather
// than introducing a scaled hypot or a sequential scalar accumulation.
extension Float {
    public static func length(_ value: SIMD2<Float>) -> Float { simd.length(value) }
    public static func length(_ value: SIMD3<Float>) -> Float { simd.length(value) }
    public static func length(_ value: SIMD4<Float>) -> Float { simd.length(value) }
    public static func length(_ value: SIMD8<Float>) -> Float { lengthSquared(value).squareRoot() }
    public static func lengthSquared(_ value: SIMD2<Float>) -> Float { simd.length_squared(value) }
    public static func lengthSquared(_ value: SIMD3<Float>) -> Float { simd.length_squared(value) }
    public static func lengthSquared(_ value: SIMD4<Float>) -> Float { simd.length_squared(value) }
    public static func lengthSquared(_ value: SIMD8<Float>) -> Float {
        let a = SIMD2(value[0], value[1])
        let b = SIMD2(value[2], value[3])
        let c = SIMD2(value[4], value[5])
        let d = SIMD2(value[6], value[7])
        let sum = (a * a + c * c) + (b * b + d * d)
        return sum[0] + sum[1]
    }
    // Native Float16-lane reduction stays in Float (0x1007de41c/0x1007de4f4).
    private static func reducedSquare(_ value: SIMD16<Float>) -> Float {
        func group(_ offset: Int) -> SIMD4<Float> {
            SIMD4(Float(value[offset]), Float(value[offset + 1]),
                  Float(value[offset + 2]), Float(value[offset + 3]))
        }
        let a = group(0), b = group(4), c = group(8), d = group(12)
        let sum = (a * a + c * c) + (b * b + d * d)
        return (sum[0] + sum[2]) + (sum[1] + sum[3])
    }
    public static func length(_ value: SIMD16<Float>) -> Float {
        Float(reducedSquare(value).squareRoot())
    }
    public static func lengthSquared(_ value: SIMD16<Float>) -> Float {
        Float(reducedSquare(value))
    }
    // Native Float32-lane conversion 0x1007dedf0 narrows to Float16
    // before multiplication and reduction.
    private static func reducedSquare(_ value: SIMD32<Float>) -> Float16 {
        func group(_ offset: Int) -> SIMD8<Float16> {
            var result = SIMD8<Float16>(repeating: 0)
            for lane in 0..<8 { result[lane] = Float16(value[offset + lane]) }
            return result
        }
        let a = group(0), b = group(8), c = group(16), d = group(24)
        let sum = (a * a + c * c) + (b * b + d * d)
        let x = sum[0] + sum[4], y = sum[1] + sum[5]
        let z = sum[2] + sum[6], w = sum[3] + sum[7]
        return (x + z) + (y + w)
    }
    public static func length(_ value: SIMD32<Float>) -> Float {
        Float(reducedSquare(value).squareRoot())
    }
    public static func lengthSquared(_ value: SIMD32<Float>) -> Float {
        Float(reducedSquare(value))
    }
}
