import ApplicationServices

extension UIElementActionEnvironment {
    // Host composition using restored AX protocol front doors. The environment
    // is our dependency-injection boundary, not a recovered vendor type.
    static var provider: Self {
        Self(read: readAXAttributeValue,
            supported: { Set(readAXSupportedAttributes($0)) },
            nativeActions: readAXActions,
            settable: isAXAttributeSettable,
            write: setAXAttribute,
            perform: performAXAction,
            count: { readAXArrayCount($0, for: $1) })
    }
}
