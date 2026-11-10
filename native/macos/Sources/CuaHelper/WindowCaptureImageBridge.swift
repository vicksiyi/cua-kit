import Foundation
import CoreGraphics

// Conditional array bridge at26cfdc. Swift's CF-type cast does not establish
// each object's CFTypeID; do not claim this validates image element types.
func windowCaptureImages(_ array: CFArray) -> [CGImage]? {
    array as? [CGImage]
}
