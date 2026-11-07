import ApplicationServices
import Foundation

// Logging stays explicit: the native helper logs actualPID failures before
// continuing directly. Do not hide failures behind a no-op default reporter.
func onAXProviderReadThread<Value>(_ element: AXUIElement,
    reportError: (Error) -> Void, read: () -> Value
) -> Value {
    dispatchAXRead(currentPID: { getpid() }, readActualPID: { try readAXActualProcessID(element) },
        reportError: reportError, isMainThread: { Thread.isMainThread },
        onMain: { DispatchQueue.main.sync(execute: $0) }, read: read)
}

func readAXArrayCount(_ element: AXUIElement, for attribute: UIElementAttribute,
    reportError: (Error) -> Void
) -> (error: AXError, count: Int) {
    providerAXArrayCount(element, for: attribute) {
        onAXProviderReadThread(element, reportError: reportError) {
            copiedAXArrayCount { AXUIElementGetAttributeValueCount(element, attribute.name, &$0) }
        }
    }
}

func readAXArrayValue(_ element: AXUIElement, for attribute: UIElementAttribute,
    index: Int, maxValues: Int, countIfKnown: Int?, reportError: (Error) -> Void
) -> (error: AXError, value: AXPartialValue?) {
    providerAXArrayValue(element, for: attribute, index: index, maxValues: maxValues, countIfKnown: countIfKnown) {
        copiedAXArraySubset(index: index, maxValues: maxValues, countIfKnown: countIfKnown,
            readCount: { readAXArrayCount(element, for: attribute, reportError: reportError) },
            copy: { start, maximum, output in
                onAXProviderReadThread(element, reportError: reportError) {
                    AXUIElementCopyAttributeValues(element, attribute.name, start, maximum, &output)
                }
            })
    }
}
