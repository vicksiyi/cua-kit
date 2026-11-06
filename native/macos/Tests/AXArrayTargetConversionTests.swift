import Foundation
import ApplicationServices

@main
struct AXArrayTargetConversionTests {
    struct OtherArray: TypeErasedArray { typealias ElementType = Int }
    static func main() throws {
        let valid = try resolvedAXArrayTarget([Int].self, throwingOnFailure: true)
        precondition(valid == [Int].self)
        let custom = try resolvedAXArrayTarget(OtherArray.self, throwingOnFailure: true)
        precondition(custom == OtherArray.self)
        for requested in [String.self, Any.self, Optional<[Int]>.self] as [Any.Type] {
            for flag in [false, true] {
                do {
                    let result = try resolvedAXArrayTarget(requested, throwingOnFailure: flag)
                    precondition(!flag && result == nil)
                } catch UIElementError.unexpectedAttributeValueType(let expected, let actual) {
                    precondition(flag && expected == [Any].self && actual == requested)
                } catch { preconditionFailure("Wrong array eligibility error: \(error)") }
            }
        }
        let ints = try convertedAXArray([0, 2, 2, -1], as: [Int].self, throwingOnFailure: true)
        precondition(ints == [0, 2, 2, -1])
        let empty = try convertedAXArray([Int](), as: [String].self, throwingOnFailure: true)
        precondition(empty == [])
        let nested: [Int?] = [1, nil, 0, nil]
        let nestedResult = try convertedAXArray(nested, as: [Int?].self, throwingOnFailure: true)
        precondition(nestedResult == nested)
        let mixed: [Any] = ["x", NSNumber(value: 4)]
        let any = try convertedAXArray(mixed, as: [Any].self, throwingOnFailure: true)!
        precondition(any.count == 2 && any[0] as? String == "x" && any[1] as? NSNumber == 4)
        let element = AXUIElementCreateApplication(getpid())
        let references = try convertedAXArray([element, element], as: [AXUIElement].self, throwingOnFailure: true)!
        precondition(references.count == 2 && references.allSatisfy { $0 === element })
        for flag in [false, true] {
            do {
                let result = try convertedAXArray([1, 2], as: [String].self, throwingOnFailure: flag)
                precondition(!flag && result == nil)
            } catch UIElementError.unexpectedAttributeValueType(let expected, let actual) {
                precondition(flag && expected == [String].self && actual == [String].self)
            } catch { preconditionFailure("Unexpected array conversion error: \(error)") }
            do {
                let result = try convertedAXArray([1], as: OtherArray.self, throwingOnFailure: flag)
                precondition(!flag && result == nil)
            } catch UIElementError.unexpectedAttributeValueType(let expected, let actual) {
                precondition(flag && expected == OtherArray.self && actual == OtherArray.self)
            } catch { preconditionFailure("Unexpected protocol target error: \(error)") }
        }
        print("native array final conversion preserves values, optionals and duplicate type payloads")
    }
}
