import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreGraphics

// Independent ScreenCaptureKit loopback backend. Original native implementation is unavailable.
private final class NativeAudioSink: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label:"core.cua.audio.samples")
    private let writer: NativeAudioWriter
    private var failure: Error?
    private var closed = false
    init(writer: NativeAudioWriter) { self.writer = writer }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, !closed, failure == nil else { return }
        do {
            guard CMSampleBufferDataIsReady(sampleBuffer),
                  let description = CMSampleBufferGetFormatDescription(sampleBuffer),
                  CMFormatDescriptionGetMediaType(description) == kCMMediaType_Audio else {
                throw fail("PROVIDER_DISCONNECTED","Invalid captured PCM audio")
            }
            let format = AVAudioFormat(cmAudioFormatDescription:description)
            let count = CMSampleBufferGetNumSamples(sampleBuffer)
            guard count > 0, count <= 480000,
                  let buffer = AVAudioPCMBuffer(pcmFormat:format,frameCapacity:AVAudioFrameCount(count)) else {
                throw fail("PROVIDER_DISCONNECTED","Invalid captured audio buffer size")
            }
            buffer.frameLength = AVAudioFrameCount(count)
            guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sampleBuffer,at:0,frameCount:Int32(count),into:buffer.mutableAudioBufferList) == noErr else {
                throw fail("PROVIDER_DISCONNECTED","Cannot copy captured PCM audio")
            }
            try writer.append(buffer)
        } catch { failure = error }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async { if !self.closed { self.failure = error } }
    }
    func finish(captureError: Error? = nil) throws -> URL {
        try queue.sync {
            closed = true
            do {
                if let error = captureError ?? failure { throw error }
                return try writer.finish()
            } catch { writer.discard(); throw error }
        }
    }
    func discard() { queue.sync { closed = true; writer.discard() } }
}

@MainActor
final class NativeAudioSession {
    private final class Recording {
        let stream: SCStream
        let sink: NativeAudioSink
        var timer: Task<Void,Never>?
        var finishing: Task<URL,Error>?
        init(stream: SCStream, sink: NativeAudioSink) { self.stream = stream; self.sink = sink }
    }
    private let directory: URL
    private var recording: Recording?
    private var starting = false
    private var closed = false
    init(parent: String) {
        directory = URL(fileURLWithPath:parent).appendingPathComponent("audio-"+UUID().uuidString,isDirectory:true)
    }
    nonisolated static func duration(_ payload: [String:Any]) throws -> Int {
        guard let raw = payload["maxDurationMilliseconds"] else { return 60000 }
        guard let value = raw as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              value.doubleValue.isFinite, value.doubleValue.rounded() == value.doubleValue,
              (100...300000).contains(value.doubleValue) else {
            throw fail("INVALID_ARGUMENT","Audio duration must be an integer from 100 through 300000")
        }
        return value.intValue
    }
    func start(_ payload: [String:Any], deadline: Double) async throws {
        let duration = try Self.duration(payload)
        guard !closed, !starting, recording == nil else { throw fail("INVALID_ARGUMENT","Audio recording is already active or awaiting stop") }
        guard CGPreflightScreenCaptureAccess() else { throw fail("PERMISSION_DENIED","Screen Recording permission is required for loopback audio") }
        starting = true; defer { starting = false }
        try Task.checkCancellation()
        let content = try await SCShareableContent.excludingDesktopWindows(false,onScreenWindowsOnly:true)
        guard let display = content.displays.first else { throw fail("TARGET_NOT_FOUND","No display is available for loopback audio") }
        guard !closed, Date().timeIntervalSince1970*1000 < deadline else { throw fail("INVALID_ARGUMENT","Audio start request expired") }
        try Task.checkCancellation()
        if !FileManager.default.fileExists(atPath:directory.path) {
            try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:false,attributes:[.posixPermissions:0o700])
        }
        let writer = try NativeAudioWriter(url:directory.appendingPathComponent(UUID().uuidString+".wav"),maxDurationMilliseconds:duration)
        let sink = NativeAudioSink(writer:writer)
        let configuration = SCStreamConfiguration()
        configuration.capturesAudio = true
        configuration.sampleRate = 48000
        configuration.channelCount = 2
        configuration.excludesCurrentProcessAudio = false
        // Only register an audio output; no microphone or video samples are consumed.
        configuration.width = 2; configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value:1,timescale:1)
        let stream = SCStream(filter:SCContentFilter(display:display,excludingWindows:[]),configuration:configuration,delegate:sink)
        do {
            try stream.addStreamOutput(sink,type:.audio,sampleHandlerQueue:sink.queue)
            try await stream.startCapture()
            try Task.checkCancellation()
            guard !closed, Date().timeIntervalSince1970*1000 < deadline else { throw fail("INVALID_ARGUMENT","Audio start request expired") }
        } catch {
            try? await stream.stopCapture()
            sink.discard()
            throw error
        }
        let active = Recording(stream:stream,sink:sink)
        recording = active
        active.timer = Task { [weak self, weak active] in
            do { try await Task.sleep(nanoseconds:UInt64(duration)*1_000_000) } catch { return }
            guard let self, let active, self.recording === active else { return }
            active.timer = nil
            _ = try? await self.finish(active)
        }
    }
    private func finish(_ active: Recording) async throws -> URL {
        if let task = active.finishing { return try await task.value }
        active.timer?.cancel(); active.timer = nil
        let task = Task<URL,Error> {
            var stoppedError: Error?
            do { try await active.stream.stopCapture() } catch { stoppedError = error }
            return try active.sink.finish(captureError:stoppedError)
        }
        active.finishing = task
        return try await task.value
    }
    func stop() async throws -> [String:Any] {
        guard let active = recording else { throw fail("INVALID_ARGUMENT","No audio recording is active") }
        defer { if recording === active { recording = nil } }
        let url = try await finish(active)
        return ["url":url.absoluteString]
    }
    func close() async {
        closed = true
        if let active = recording {
            _ = try? await finish(active)
            active.sink.discard()
            recording = nil
        }
        try? FileManager.default.removeItem(at:directory)
    }
}
