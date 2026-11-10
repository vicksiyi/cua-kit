#if canImport(SlimCore)
import SlimCore
#endif
import os

// Host diagnostics for the restored extractor. Event wording is local adapter
// text, not a claim to reproduce the vendor's logging strings. Never log the
// focused element, attributed contents or selection payload here.
enum NativeSelectionExtractionDiagnostics {
    static func lineBudgetExceeded(_ reason: AccessibilityDifferenceLineBudgetExceeded) {
        switch reason {
        case .difference(let count): logger.debug("AX difference budget exceeded fullTreeLineCount=\(count)")
        case .removedElementSummary(let count): logger.debug("AX removal summary budget exceeded fullTreeLineCount=\(count)")
        }
    }
    private static var logger: Logger { NativeLogger.logger(for: RefetchableSkyshotAXTree.self) }

    static func attributeError(_ error: any Error) {
        logger.error("Selection AX error type=\(String(reflecting: type(of: error)))")
    }
    static func missingFocus(_ element: UIElement) {
        logger.debug("Focused element absent from selection tree")
    }
    static func selectionResolutionFailure() {
        logger.debug("Selection requires separate tree capture")
    }
    static func depthLimit() {
        logger.warning("Selection tree reached traversal depth limit")
    }
    static func childLimit(_ reason: VisibleChildrenLimitReason) {
        logger.warning("Selection children reached capture limit")
    }
    static func unknownDateComponents(_ components: UInt) {
        logger.debug("Unknown selection date component flags")
    }
    static func unknownAttributedStyle(_ style: String) {
        logger.debug("Unknown selection attributed style")
    }
    static func unexpectedNextLine() {
        logger.debug("Unexpected selection text line transition")
    }
}
