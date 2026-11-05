import Foundation
import AVFoundation

// Synthetic backends are constructor-injected only; no wire request or environment
// switch can replace ScreenCaptureKit or bypass permissions in the production service.
@MainActor
private final class SyntheticAudioCapture: NativeAudioCaptureBackend {
    let writer: NativeAudioWriter
    var finishCount = 0
    var discardCount = 0
    var failFinish = false
    init(url: URL, duration: Int, fillDuration: Bool = false) throws {
        writer = try NativeAudioWriter(url:url,maxDurationMilliseconds:duration)
        let format = AVAudioFormat(commonFormat:.pcmFormatFloat32,sampleRate:48000,channels:2,interleaved:false)!
        let buffer = AVAudioPCMBuffer(pcmFormat:format,frameCapacity:4800)!
        buffer.frameLength = 4800
        for n in 0..<4800 {
            buffer.floatChannelData![0][n] = Float(sin(Double(n)*2*Double.pi*440/48000))*0.1
            buffer.floatChannelData![1][n] = buffer.floatChannelData![0][n]
        }
        for _ in 0..<(fillDuration ? (duration+99)/100 : 1) { try writer.append(buffer) }
    }
    func finish() async throws -> URL {
        finishCount += 1
        try await Task.sleep(nanoseconds:30_000_000)
        if failFinish { writer.discard(); throw fail("PROVIDER_DISCONNECTED","Synthetic capture failed") }
        return try writer.finish()
    }
    func discard() { discardCount += 1; writer.discard() }
}
@MainActor
private func expectAudioFailure(_ code: String, _ operation: () async throws -> Void) async throws {
    do { try await operation() }
    catch let error as Failure where error.code == code { return }
    throw fail("SELF_TEST_FAILED","Expected audio failure \(code)")
}
@MainActor
func runNativeAudioLifecycleChecks() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("core-audio-lifecycle-"+UUID().uuidString)
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:false,attributes:[.posixPermissions:0o700])
    defer { try? FileManager.default.removeItem(at:root) }
    let deadline = { Date().timeIntervalSince1970*1000+5000 }
    var captures: [SyntheticAudioCapture] = []
    let session = NativeAudioSession(parent:root.path) { url,duration,_ in
        let capture = try SyntheticAudioCapture(url:url,duration:duration); captures.append(capture); return capture
    }
    try await expectAudioFailure("INVALID_ARGUMENT") { _ = try await session.stop() }
    try await expectAudioFailure("INVALID_ARGUMENT") { try await session.start([:],deadline:0) }
    guard captures.isEmpty else { throw fail("SELF_TEST_FAILED","Expired start reached capture backend") }
    try await session.start(["maxDurationMilliseconds":100],deadline:deadline())
    try await expectAudioFailure("INVALID_ARGUMENT") { try await session.start([:],deadline:deadline()) }
    for _ in 0..<200 {
        if captures[0].finishCount > 0 { break }
        try await Task.sleep(nanoseconds:10_000_000)
    }
    guard captures[0].finishCount == 1 else { throw fail("SELF_TEST_FAILED","Duration timer did not stop capture") }
    let stopped = try await session.stop()
    guard let value = stopped["url"] as? String, let url = URL(string:value), url.isFileURL,
          FileManager.default.fileExists(atPath:url.path), captures[0].finishCount == 1 else {
        throw fail("SELF_TEST_FAILED","Explicit stop lost timer result or stopped twice")
    }
    let wav = try AVAudioFile(forReading:url)
    guard wav.fileFormat.sampleRate == 24000, wav.fileFormat.channelCount == 2, wav.length > 0 else {
        throw fail("SELF_TEST_FAILED","Lifecycle result is not native WAV")
    }
    try await session.start([:],deadline:deadline())
    let first = Task { try await session.stop() }
    let second = Task { try await session.stop() }
    let one = try await first.value, two = try await second.value
    guard one["url"] as? String == two["url"] as? String, captures[1].finishCount == 1 else {
        throw fail("SELF_TEST_FAILED","Concurrent stop did not share finalization")
    }
    try await session.start([:],deadline:deadline())
    captures[2].failFinish = true
    try await expectAudioFailure("PROVIDER_DISCONNECTED") { _ = try await session.stop() }
    try await session.start([:],deadline:deadline())
    await session.close()
    guard captures[3].finishCount == 1, captures[3].discardCount == 1,
          try FileManager.default.contentsOfDirectory(atPath:root.path).isEmpty else {
        throw fail("SELF_TEST_FAILED","Session close did not stop/discard/remove recordings")
    }
    try await expectAudioFailure("INVALID_ARGUMENT") { try await session.start([:],deadline:deadline()) }

    // Close during asynchronous startup must reject the late capture and clean it.
    var lateCapture: SyntheticAudioCapture?
    let late = NativeAudioSession(parent:root.path) { url,duration,_ in
        let capture = try SyntheticAudioCapture(url:url,duration:duration); lateCapture = capture
        try await Task.sleep(nanoseconds:100_000_000)
        return capture
    }
    let starting = Task { try await late.start([:],deadline:deadline()) }
    while lateCapture == nil { try await Task.sleep(nanoseconds:1_000_000) }
    try await expectAudioFailure("INVALID_ARGUMENT") { try await late.start([:],deadline:deadline()) }
    await late.close()
    try await expectAudioFailure("INVALID_ARGUMENT") { try await starting.value }
    guard lateCapture?.finishCount == 1, lateCapture?.discardCount == 1,
          try FileManager.default.contentsOfDirectory(atPath:root.path).isEmpty else {
        throw fail("SELF_TEST_FAILED","Late startup escaped close cleanup")
    }
    var cancelledCapture: SyntheticAudioCapture?
    let cancelled = NativeAudioSession(parent:root.path) { url,duration,_ in
        let capture = try SyntheticAudioCapture(url:url,duration:duration); cancelledCapture = capture
        try? await Task.sleep(nanoseconds:100_000_000)
        return capture
    }
    let cancelledStart = Task { try await cancelled.start([:],deadline:deadline()) }
    while cancelledCapture == nil { try await Task.sleep(nanoseconds:1_000_000) }
    cancelledStart.cancel()
    do { try await cancelledStart.value; throw fail("SELF_TEST_FAILED","Cancelled start reported success") }
    catch is CancellationError { }
    guard cancelledCapture?.finishCount == 1, cancelledCapture?.discardCount == 1 else {
        throw fail("SELF_TEST_FAILED","Cancelled startup leaked capture")
    }
    await cancelled.close()
    guard try FileManager.default.contentsOfDirectory(atPath:root.path).isEmpty else {
        throw fail("SELF_TEST_FAILED","Cancelled session left audio artifacts")
    }

}

// Explicit operator fixture only; the normal Sky socket always selects real capture.
@MainActor
func startSyntheticAudioCapture(url: URL, duration: Int, deadline: Double) async throws -> NativeAudioCaptureBackend {
    try SyntheticAudioCapture(url:url,duration:duration,fillDuration:true)
}
