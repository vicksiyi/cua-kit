import ScreenCaptureKit

// Native app observations include windows on other Spaces and offscreen windows.
// Window selection still requires the target PID and explicit/AX window identity.
func applicationCaptureContent(processID: pid_t) async throws -> (content: SCShareableContent, windows: [SCWindow]) {
    let content = try await SCShareableContent.current
    return (content, content.windows.filter {
        $0.owningApplication?.processID == processID && $0.frame.width > 0 && $0.frame.height > 0
    })
}
