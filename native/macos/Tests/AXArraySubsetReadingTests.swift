import ApplicationServices
import Foundation

@main struct Test {
    enum Failure: Error { case expected }
    static func checkDispatch() {
        for target: Int32? in [nil, 50, 51] {
            for main in [true, false] {
                var events: [String] = []
                let value: Int = dispatchAXRead(currentPID: { events.append("own"); return 50 },
                    readActualPID: { events.append("actual"); guard let target else { throw Failure.expected }; return target },
                    reportError: { error in guard case Failure.expected = error else { preconditionFailure() }; events.append("error") },
                    isMainThread: { events.append("thread"); return main },
                    onMain: { work in events.append("dispatch"); return work() },
                    read: { events.append("copy"); return 19 })
                var expected = ["own", "actual"]
                if target == nil { expected.append("error") }
                if target == 50 { expected.append("thread"); if !main { expected.append("dispatch") } }
                expected.append("copy")
                precondition(value == 19 && events == expected)
            }
        }
        // Count failure must occur before even determining a copy thread.
        _ = copiedAXArraySubset(index: 0, maxValues: 2, countIfKnown: nil,
            readCount: { (.failure, 0) }, copy: { _, _, _ in
                dispatchAXRead(currentPID: { preconditionFailure() }, readActualPID: { preconditionFailure() },
                    reportError: { _ in preconditionFailure() }, isMainThread: { preconditionFailure() },
                    onMain: { _ in preconditionFailure() }, read: { preconditionFailure() })
            })
    }
    static func main() {
        checkDispatch()
        var countReads = 0, copyReads = 0
        let array = ["a", "b"] as CFArray
        let partial = copiedAXArraySubset(index: 3, maxValues: 2, countIfKnown: nil,
            readCount: { countReads += 1; return (.success, 10) },
            copy: { index, maximum, output in
                copyReads += 1
                precondition(countReads == 1 && index == 3 && maximum == 2)
                output = array; return .cannotComplete
            })
        precondition(countReads == 1 && copyReads == 1 && partial.error == .cannotComplete)
        precondition(partial.value!.value.value === array)
        precondition(partial.value!.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 10, availableRanges: [3..<5]))
        precondition(partial.value!.textTruncationDescriptor == nil)
        for error in [AXError.failure, .noValue, .attributeUnsupported] {
            let result = copiedAXArraySubset(index: 0, maxValues: 10, countIfKnown: nil,
                readCount: { (error, 20) }, copy: { _, _, _ in preconditionFailure("failed count cannot copy") })
            precondition(result.error == error && result.value == nil)
        }
        for total in [-1, 0, 1, 2, 3] {
            let result = copiedAXArraySubset(index: 9, maxValues: -2, countIfKnown: total,
                readCount: { preconditionFailure("known count must skip query") },
                copy: { index, maximum, output in
                    precondition(index == 9 && maximum == -2)
                    output = array; return .success
                })
            let expected: [Range<Int>]? = total > 2 ? [9..<11] : nil
            precondition(result.value!.arraySubsetDescriptor == AXArraySubsetDescriptor(count: total, availableRanges: expected))
        }
        let empty = copiedAXArraySubset(index: -3, maxValues: 0, countIfKnown: 5,
            readCount: { preconditionFailure() }, copy: { _, _, output in output = [] as CFArray; return .success })
        precondition(empty.value!.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 5, availableRanges: [-3 ..< -3]))
        for error in [AXError.success, .failure] {
            let result = copiedAXArraySubset(index: 0, maxValues: 1, countIfKnown: 1,
                readCount: { preconditionFailure() }, copy: { _, _, _ in error })
            precondition(result.error == error && result.value == nil)
        }
        print("Array subsets preserve count-query ordering, partial errors, ranges and known counts")
    }
}
