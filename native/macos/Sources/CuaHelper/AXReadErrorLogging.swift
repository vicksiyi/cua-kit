import ApplicationServices
import Foundation
import os

// Source 0x1006fa140..<0x1006fa230: dynamic element type, default log level,
// NSError interpolation with default privacy. This is local OS logging only.
func reportAXReadProcessIDError(_ error: Error, element: AXUIElement) {
    NativeLogger.logger(for: type(of: element)).log("log[83e5307932ae753eb27e] [0]=\(error as NSError)")
}

func onAXProviderReadThread<Value>(_ element: AXUIElement, read: () -> Value) -> Value {
    onAXProviderReadThread(element, reportError: { reportAXReadProcessIDError($0, element: element) }, read: read)
}

func readAXArrayCount(_ element: AXUIElement, for attribute: UIElementAttribute)
    -> (error: AXError, count: Int) {
    readAXArrayCount(element, for: attribute, reportError: { reportAXReadProcessIDError($0, element: element) })
}

func readAXArrayValue(_ element: AXUIElement, for attribute: UIElementAttribute,
    index: Int, maxValues: Int, countIfKnown: Int?
) -> (error: AXError, value: AXPartialValue?) {
    readAXArrayValue(element, for: attribute, index: index, maxValues: maxValues, countIfKnown: countIfKnown,
        reportError: { reportAXReadProcessIDError($0, element: element) })
}
