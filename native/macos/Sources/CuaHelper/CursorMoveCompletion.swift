// Extracted shared resume state 0x100092cfc..0x100092d0c and callback bodies
// 0x100092ea0..0x100093004. Readable name, not an original public API type.
@MainActor
final class CursorMoveCompletion {
    private var resumed = false
    private weak var cursor: ComputerUseCursor?
    private let isDelegate: Bool
    private let resume: () -> Void

    init(cursor: ComputerUseCursor?, isDelegate: Bool, resume: @escaping () -> Void) {
        self.cursor = cursor
        self.isDelegate = isDelegate
        self.resume = resume
    }

    func interactionReady() {
        guard !resumed else { return }
        resumed = true
        resume()
    }

    func movementCompleted() {
        // The original weak-owner check precedes even the resume attempt.
        guard let cursor else { return }
        interactionReady()
        if !isDelegate { cursor.isMoving = false }
    }
}
