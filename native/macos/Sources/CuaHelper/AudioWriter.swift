import Foundation
import AVFoundation

// Independent native encoder for the observed Sky contract: 24 kHz stereo WAV.
// Call only from one serial capture queue. It does not acquire system audio or permission.
final class NativeAudioWriter {
    private let outputFormat: AVAudioFormat
    private var file: AVAudioFile?
    private var converter: AVAudioConverter?
    private var sourceFormat: AVAudioFormat?
    private let maximumFrames: AVAudioFramePosition
    private(set) var frames: AVAudioFramePosition = 0
    private var closed = false
    private var failure: Error?
    let url: URL

    init(url: URL, maxDurationMilliseconds: Int) throws {
        guard (100...300000).contains(maxDurationMilliseconds), url.isFileURL else {
            throw fail("INVALID_ARGUMENT","Invalid native audio duration or file URL")
        }
        self.url = url
        self.maximumFrames = AVAudioFramePosition(maxDurationMilliseconds) * 24
        self.outputFormat = AVAudioFormat(commonFormat:.pcmFormatFloat32,sampleRate:24000,channels:2,interleaved:false)!
        // Refuse replacement; owner chooses a private directory and unpredictable filename.
        let descriptor = open(url.path,O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW,0o600)
        guard descriptor >= 0 else { throw fail("PROVIDER_DISCONNECTED","Cannot create private audio output") }
        Darwin.close(descriptor)
        do {
            file = try AVAudioFile(forWriting:url,settings:[
                AVFormatIDKey:kAudioFormatLinearPCM,
                AVSampleRateKey:24000,
                AVNumberOfChannelsKey:2,
                AVLinearPCMBitDepthKey:16,
                AVLinearPCMIsFloatKey:false,
                AVLinearPCMIsBigEndianKey:false,
                AVLinearPCMIsNonInterleaved:false,
            ],commonFormat:.pcmFormatFloat32,interleaved:false)
        } catch { try? FileManager.default.removeItem(at:url); throw error }
    }
    func append(_ input: AVAudioPCMBuffer) throws {
        guard !closed else { throw fail("INVALID_ARGUMENT","Native audio recording is already finalized") }
        if let failure { throw failure }
        do {
            guard input.format.sampleRate.isFinite, input.format.sampleRate > 0,
                  input.frameLength > 0, input.format.channelCount > 0 else {
                throw fail("INVALID_ARGUMENT","Invalid native audio sample format")
            }
            if frames >= maximumFrames { return }
            if sourceFormat == nil {
                sourceFormat = input.format
                converter = AVAudioConverter(from:input.format,to:outputFormat)
                guard converter != nil else { throw fail("UNSUPPORTED_CAPABILITY","Native audio format cannot be converted") }
            }
            guard sourceFormat!.isEqual(input.format) else { throw fail("UNSUPPORTED_CAPABILITY","Native audio sample format changed during recording") }
            try convert(input,ending:false)
        } catch { failure = error; throw error }
    }
    private func convert(_ input: AVAudioPCMBuffer?, ending: Bool) throws {
        guard let converter else { return }
        var delivered = false
        while frames < maximumFrames {
            let output = AVAudioPCMBuffer(pcmFormat:outputFormat,frameCapacity:4096)!
            var error: NSError?
            let status = converter.convert(to:output,error:&error) { _, state in
                if let input, !delivered { delivered = true; state.pointee = .haveData; return input }
                state.pointee = ending ? .endOfStream : .noDataNow
                return nil
            }
            if let error { throw error }
            guard status != .error else { throw fail("PROVIDER_DISCONNECTED","Native audio conversion failed") }
            if output.frameLength > 0 {
                output.frameLength = min(output.frameLength,AVAudioFrameCount(maximumFrames-frames))
                try file!.write(from:output)
                frames += AVAudioFramePosition(output.frameLength)
            }
            if status == .inputRanDry || status == .endOfStream { return }
            guard output.frameLength > 0 else { throw fail("PROVIDER_DISCONNECTED","Native audio converter made no progress") }
        }
    }
    func finish() throws -> URL {
        guard !closed else { throw fail("INVALID_ARGUMENT","Native audio recording is already finalized") }
        defer { closed = true; file = nil }
        if let failure { throw failure }
        try convert(nil,ending:true)
        guard frames > 0 else { throw fail("ACTION_OUTCOME_UNKNOWN","No computer audio samples were received") }
        return url
    }
    func discard() {
        closed = true; file = nil
        try? FileManager.default.removeItem(at:url)
    }
}

func runNativeAudioWriterChecks() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("core-audio-test-"+UUID().uuidString)
    try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:false,attributes:[.posixPermissions:0o700])
    defer { try? FileManager.default.removeItem(at:directory) }
    let destination = directory.appendingPathComponent("synthetic.wav")
    let writer = try NativeAudioWriter(url:destination,maxDurationMilliseconds:100)
    let format = AVAudioFormat(commonFormat:.pcmFormatFloat32,sampleRate:48000,channels:2,interleaved:false)!
    // Synthetic channel-separated tones only: never read microphone or loopback audio.
    for _ in 0..<12 {
        let buffer = AVAudioPCMBuffer(pcmFormat:format,frameCapacity:480)!
        buffer.frameLength = 480
        for n in 0..<480 {
            buffer.floatChannelData![0][n] = Float(sin(Double(n)*2*Double.pi*1000/48000))*0.25
            buffer.floatChannelData![1][n] = Float(sin(Double(n)*2*Double.pi*2000/48000))*0.5
        }
        try writer.append(buffer)
    }
    let result = try writer.finish()
    let data = try Data(contentsOf:result)
    let file = try AVAudioFile(forReading:result)
    guard data.prefix(4) == Data("RIFF".utf8), data.subdata(in:8..<12) == Data("WAVE".utf8),
          file.fileFormat.sampleRate == 24000, file.fileFormat.channelCount == 2,
          file.fileFormat.settings[AVLinearPCMBitDepthKey] as? Int == 16,
          file.length == 2400 else { throw fail("SELF_TEST_FAILED","Native WAV format or duration limit differs") }
    let samples = AVAudioPCMBuffer(pcmFormat:file.processingFormat,frameCapacity:2400)!
    try file.read(into:samples)
    guard let channels = samples.floatChannelData else { throw fail("SELF_TEST_FAILED","Cannot inspect synthetic WAV") }
    let left = (0..<Int(samples.frameLength)).reduce(0.0) { $0 + Double(channels[0][$1]*channels[0][$1]) }
    let right = (0..<Int(samples.frameLength)).reduce(0.0) { $0 + Double(channels[1][$1]*channels[1][$1]) }
    guard left > 1, right > left*2 else { throw fail("SELF_TEST_FAILED","Native audio channel content was lost") }
    let permissions = try FileManager.default.attributesOfItem(atPath:result.path)[.posixPermissions] as? NSNumber
    guard permissions?.intValue == 0o600 else { throw fail("SELF_TEST_FAILED","Audio file permissions are not private") }
    do { _ = try NativeAudioWriter(url:destination,maxDurationMilliseconds:100); throw fail("SELF_TEST_FAILED","Audio output was overwritten") }
    catch let error as Failure where error.code == "PROVIDER_DISCONNECTED" { }
    let empty = try NativeAudioWriter(url:directory.appendingPathComponent("empty.wav"),maxDurationMilliseconds:100)
    do { _ = try empty.finish(); throw fail("SELF_TEST_FAILED","Empty capture reported success") }
    catch let error as Failure where error.code == "ACTION_OUTCOME_UNKNOWN" { }
    empty.discard()
}
