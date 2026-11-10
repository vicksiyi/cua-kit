// Buffer gate fb7f54..fb7fe4 and sleep closure fb45c4..fb466c. The closure
// constructs Duration from delay * 10^18 attoseconds: delay is seconds, not ms.
func captureScreenshotAfterDelay<Content, Image>(delay: Int?,
    sleep: (Duration) async throws -> Void = { try await Task<Never, Never>.sleep(for: $0) },
    acquire: () async throws -> Content,
    capture: (Content) async throws -> Image
) async throws -> Image {
    if let delay, delay > 0 { try await sleep(.seconds(delay)) }
    let content = try await acquire()
    return try await capture(content)
}
