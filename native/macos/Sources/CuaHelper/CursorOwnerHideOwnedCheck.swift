import AppKit
import Animation
import GraphicsSupport

@MainActor
func runCursorOwnerHideOwnedCheck() async -> [String: Any] {
    NSApplication.shared.setActivationPolicy(.prohibited)
    final class Delegate: ComputerUseCursorDelegate {
        var willMove: ((ComputerUseCursor, CGPoint, UInt32?, Bool) async -> Void)?
        func computerUseCursorWillMove(_ cursor: ComputerUseCursor, to point: CGPoint,
            aboveWindowID: UInt32?, animated: Bool) async {
            await willMove?(cursor, point, aboveWindowID, animated)
        }
        var willHide: ((ComputerUseCursor) async -> Void)?
        var didHide: ((ComputerUseCursor) -> Void)?
        func computerUseCursorWillHide(_ cursor: ComputerUseCursor) async { await willHide?(cursor) }
        func computerUseCursorDidHide(_ cursor: ComputerUseCursor) { didHide?(cursor) }
        func computerUseCursorDidMove(_ cursor: ComputerUseCursor) {}
    }
    let events = NSMutableArray()
    let cursor = ComputerUseCursor(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let first = Delegate(), replacement = Delegate()
    first.willHide = { current in
        events.add("willHide")
        precondition(current.window.wantsToBeVisible)
        await Task.yield()
        current.delegate = replacement
    }
    first.didHide = { _ in preconditionFailure("Stale delegate was reused after suspension") }
    replacement.didHide = { current in
        precondition(!current.window.wantsToBeVisible && !current.window.isVisible)
        precondition(current.window.cursorMotionProgressAnimation == nil)
        events.add("didHide")
    }
    cursor.delegate = first
    cursor.window.wantsToBeVisible = true
    let animation = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
    cursor.window.cursorMotionProgressAnimation = animation
    let observer = NotificationCenter.default.addObserver(
        forName: computerUseCursorDidHideNotification, object: cursor, queue: nil
    ) { _ in events.add("notification") }
    defer { NotificationCenter.default.removeObserver(observer) }
    precondition(!cursor.isVisible)
    await cursor.orderOut()
    precondition(animation.state == .ended)
    precondition(events as! [String] == ["willHide", "didHide", "notification"])
    cursor.delegate = nil
    await cursor.orderOut()
    precondition(events as! [String] == ["willHide", "didHide", "notification", "notification"])
    let preparedWindow = cursor.window
    let newWindow = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    newWindow.wantsToBeVisible = true
    let reentrantAnimation = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
    var replacements = 0
    reentrantAnimation.eventHandler = { [weak cursor] event in
        if case .finished = event {
            replacements += 1
            cursor?.window = newWindow
        }
    }
    preparedWindow.cursorMotionProgressAnimation = reentrantAnimation
    preparedWindow.wantsToBeVisible = true
    await cursor.orderOut()
    precondition(replacements == 1 && cursor.window === newWindow)
    precondition(!preparedWindow.wantsToBeVisible && preparedWindow.cursorMotionProgressAnimation == nil)
    precondition(newWindow.wantsToBeVisible && !newWindow.isVisible)
    precondition(events as! [String] == ["willHide", "didHide", "notification", "notification", "notification"])
    var moveCallbacks = 0
    replacement.willMove = { current, point, windowID, animated in
        moveCallbacks += 1
        precondition(point == CGPoint(x: 20, y: 30) && windowID == 42 && animated)
        precondition(current.targetWindowID == 42 && !current.isMoving)
        await Task.yield()
        precondition(!current.isMoving)
    }
    cursor.delegate = replacement
    await cursor.prepareMoveOwnership(to: CGPoint(x: 20, y: 30), aboveWindowID: 42,
        relativeToWindow: true, animated: true, isDelegate: false)
    precondition(cursor.isMoving && moveCallbacks == 1)
    cursor.isMoving = false
    await cursor.prepareMoveOwnership(to: .zero, aboveWindowID: 99,
        relativeToWindow: false, animated: false, isDelegate: true)
    precondition(cursor.targetWindowID == 42 && !cursor.isMoving && moveCallbacks == 1)
    cursor.delegate = nil
    await cursor.prepareMoveOwnership(to: .zero, aboveWindowID: 99,
        relativeToWindow: false, animated: false, isDelegate: false)
    precondition(cursor.targetWindowID == nil && cursor.isMoving)
    let layer = newWindow.contentViewController!.view.layer!
    layer.layerFilters = [LayerFilter.ColorSaturate(amount: 0.75)]
    newWindow.alphaValue = 0.8
    let originalFilter = layer.filters![0] as! NSObject
    precondition(!cursor.prepareMoveAppearance(animated: false, fadeIn: false))
    precondition(newWindow.alphaValue == 0.8 && layer.filters![0] as! NSObject === originalFilter)
    precondition(!cursor.prepareMoveAppearance(animated: true, fadeIn: false))
    precondition(newWindow.alphaValue == 0)
    precondition(layer.layerFilters.map(\.name) == [.colorSaturate, .gaussianBlur])
    precondition((layer.layerFilters[1] as? LayerFilter.GaussianBlur)?.radius == 7)
    newWindow.alphaValue = 1
    precondition(!cursor.prepareMoveAppearance(animated: false, fadeIn: true))
    precondition(newWindow.alphaValue == 0 && !newWindow.isVisible)
    cursor.isMoving = true
    var resumes = 0
    let completion = CursorMoveCompletion(cursor: cursor, isDelegate: false) {
        precondition(cursor.isMoving)
        resumes += 1
    }
    completion.interactionReady()
    completion.interactionReady()
    precondition(resumes == 1 && cursor.isMoving)
    completion.movementCompleted()
    precondition(resumes == 1 && !cursor.isMoving)
    cursor.isMoving = true
    let delegatedCompletion = CursorMoveCompletion(cursor: cursor, isDelegate: true) { resumes += 1 }
    delegatedCompletion.movementCompleted()
    delegatedCompletion.interactionReady()
    precondition(resumes == 2 && cursor.isMoving)
    let missingOwner = CursorMoveCompletion(cursor: nil, isDelegate: false) { resumes += 1 }
    missingOwner.movementCompleted()
    precondition(resumes == 2)
    missingOwner.interactionReady()
    precondition(resumes == 3)
    return ["hiddenOwnerOrderOut": true, "delegateReloadAfterAwait": true,
        "resetBeforeDidHide": true, "notificationAfterDidHide": true,
        "windowReplacementDuringReset": true,
        "moveOwnershipPreparation": true,
        "hiddenMoveAppearancePreparation": true,
        "moveCompletionResumesOnce": true,
        "orderedWindows": false, "sentInput": false, "visibleFadeVerified": false]
}
