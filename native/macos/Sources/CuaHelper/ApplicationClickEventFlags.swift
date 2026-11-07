import CoreGraphics

// sendClick: 0x1006fcd28..0x1006fcd7c ORs 0x100000 into the caller's
// flags when synthetic preparation returns false. The prepared/active path
// (0x1006fd658..0x1006fd6a0) passes the original flags unchanged.
func applicationClickEventFlags(_ flags: CGEventFlags, applicationBelievesItHasFocus: Bool) -> CGEventFlags {
    applicationBelievesItHasFocus ? flags : flags.union(CGEventFlags(rawValue: 0x100000))
}
