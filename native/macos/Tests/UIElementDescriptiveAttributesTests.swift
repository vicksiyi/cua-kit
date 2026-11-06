import Foundation

@main
struct UIElementDescriptiveAttributesTests {
    static func main() {
        let values: [String?] = [nil, "", " ", "内容"]
        var count = 0
        for a in values { for b in values { for c in values { for d in values {
            for image in [false, true] {
                let fields = [a, b, c, d]
                var trace: [Int] = []
                func read(_ index: Int) -> String? {
                    trace.append(index); return fields[index]
                }
                let result = uiElementHasDescriptiveAttributes(title: { read(0) },
                    description: { read(1) }, value: { read(2) }, placeholder: { read(3) },
                    role: { trace.append(4); return image ? .image : .button })
                let first = fields.firstIndex { $0?.isEmpty == false }
                precondition(result == (first != nil || image))
                precondition(trace == Array(0...(first ?? 4)))
                count += 1
            }
        } } } }
        precondition(count == 512)
        print("descriptive attributes preserve ordered nonempty text and image fallback: 512 cases")
    }
}
