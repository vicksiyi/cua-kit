import ApplicationServices

@main
struct AXArrayElementDecodingTests {
    static func box<Value>(_ type: AXValueType, _ value: Value) -> AXValue {
        var value = value
        return withUnsafePointer(to: &value) { AXValueCreate(type, $0)! }
    }
    static func main() {
        let first = CGPoint(x: 1, y: 2), last = CGPoint(x: 7, y: 8)
        let values = [box(.cgPoint, first), box(.cgSize, CGSize(width: 3, height: 4)),
                      box(.axError, AXError.noValue), box(.cgPoint, last), box(.cgPoint, first)]
        var seen: [Int] = []
        let points: [CGPoint] = decodeAXArrayElements(Array(values.enumerated())) { index, value in
            seen.append(index)
            return try? decodeAXValue(value, throwingOnFailure: false, as: CGPoint.self)
        }
        precondition(seen == [0, 1, 2, 3, 4])
        precondition(points == [first, last, first])
        let subset = AXArraySubsetDescriptor(count: 20, availableRanges: [5..<10])
        let partial = decodedAXPartialArray(subsetDescriptor: subset) { points }!
        precondition(partial.array == points && partial.subsetDescriptor == subset)
        let none: [Int] = decodeAXArrayElements(values) { _ in nil }
        precondition(none.isEmpty)
        let empty: [Int] = decodeAXArrayElements([Int]()) { _ in fatalError("Empty array must not decode") }
        precondition(empty.isEmpty)
        let falsy: [Int] = decodeAXArrayElements([0, 1, 0]) { $0 }
        precondition(falsy == [0, 1, 0])
        // compactMap removes only outer nil; a successfully decoded Optional.none survives.
        let optionals: [Int?] = decodeAXArrayElements([0, 1, 2]) { value -> Int?? in
            value == 0 ? nil : value == 1 ? .some(nil) : .some(.some(2))
        }
        precondition(optionals.count == 2 && optionals[0] == nil && optionals[1] == 2)
        print("7 native array element decoding checks passed")
    }
}
