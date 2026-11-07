import CoreGraphics
import SoftLink

// Source wrappers: mainConnectionID 0x10026bb1c, disableUpdate 0x10026cb84,
// reenableUpdate 0x10026cba0. Each has its own lazy initialization token.
enum WindowServerSPI {
    private typealias MainConnection = @convention(c) () -> OpaquePointer?
    private typealias Update = @convention(c) (OpaquePointer?) -> CGError

    private static func resolve(_ request: WindowServerSPISymbolRequest) -> [UnsafeRawPointer?] {
        lookUpBatchSymbolPointers(images: request.images,
            symbolRequests: request.symbols, salt: request.salt).map(\.pointer)
    }
    private static func required(_ pointer: UnsafeRawPointer?) -> UnsafeRawPointer {
        // The pinned native binding also traps for an unresolved required SPI.
        guard let pointer else { preconditionFailure("Required WindowServer SPI is unavailable") }
        return pointer
    }
    private static let functions = resolve(.functions)
    private static let mainConnection = unsafeBitCast(required(functions[0]), to: MainConnection.self)
    private static let disable = unsafeBitCast(required(resolve(.disableUpdate).first ?? nil), to: Update.self)
    private static let reenable = unsafeBitCast(required(resolve(.reenableUpdate).first ?? nil), to: Update.self)

    static func mainConnectionID() -> OpaquePointer? { mainConnection() }
    static func disableUpdate(_ connection: OpaquePointer?) -> CGError { disable(connection) }
    static func reenableUpdate(_ connection: OpaquePointer?) -> CGError { reenable(connection) }
}
