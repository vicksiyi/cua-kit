import CoreGraphics
// Controlled test never selects the production SPI overload.
func captureAcceleratedWindowScreenshot(_ windows: [UInt32], rect: CGRect) -> CGImage? {
    preconditionFailure("Unexpected real SPI capture in controlled test")
}
