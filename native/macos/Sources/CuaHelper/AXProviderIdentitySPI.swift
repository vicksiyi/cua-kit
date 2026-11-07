import ApplicationServices

func readAXActualProcessID(_ element: AXUIElement) throws -> Int32 {
    try providerAXActualProcessID(element) {
        try copiedAXProcessID { AccessibilitySPI.getActualPID(element, pid: &$0) }
    }
}
func readAXWindowID(_ element: AXUIElement) throws -> UInt32 {
    try providerAXWindowID(element) {
        try copiedAXWindowID { AccessibilitySPI.getWindowID(element, identifier: &$0) }
    }
}
