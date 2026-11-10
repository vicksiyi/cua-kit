import AppKit
import ApplicationServices

extension UIElementProtocol {
    func clippingFrame(uncached: Bool, reportError: (Error) -> Void) -> CGRect? {
        let root: any UIElementProtocol = self
        return uiElementClippingFrame(of: root, uncached: uncached, role: { $0.role },
            frameAttribute: { element, fresh in
                element.clippingFrameAttribute(uncached: fresh,
                    read: { element.axElement.value(for: .frame) }, reportError: reportError)
            }, hasScrollAction: { $0.hasScrollAction(in: .provider, reportError: reportError) },
            parent: { element, fresh in
                element.clippingParent(uncached: fresh, initialize: { UIElement(element: $0) },
                    read: { element.axElement.value(for: UIElementAttribute(kAXParentAttribute)) }, reportError: reportError)
            })
    }

    func chessPreferredPoint(reportError: (Error) -> Void) -> CGPoint? {
        uiElementChessClickPoint(role: { role }, title: { title },
            bundleIdentifier: { axElement.bundleIdentifier },
            resolveApp: { identifier in
                firstRunningApplicationElement(bundleIdentifier: identifier,
                    runningApplications: { NSRunningApplication.runningApplications(withBundleIdentifier: $0) },
                    resolveProcessIdentifier: systemResolvedProcessIdentifier,
                    constructElement: { UIElement(element: AXUIElementCreateApplication($0)) })
            }, elementFrame: { frameValue(reportError: reportError) },
            hitTest: { try $0.axElement.element(at: $1) },
            matchesTarget: { providerAXElementsEqual($0.axElement, axElement) },
            parentFrame: { parentValue(reportError: reportError)?.frameValue(reportError: reportError) })
    }

    func clickablePoint(reportError: (Error) -> Void) async throws -> CGPoint? {
        try await uiElementClickablePoint(scrollToVisible: false,
            preferredPoint: { chessPreferredPoint(reportError: reportError) },
            frameBeforeScroll: { frameValue(reportError: reportError) },
            scrollFrameToVisible: { _ in
                preconditionFailure("No-argument clickablePoint must never request scrolling")
            }, readFrameAttribute: { fresh in
                clippingFrameAttribute(uncached: fresh,
                    read: { axElement.value(for: .frame) }, reportError: reportError)
            }, clippingFrame: { clippingFrame(uncached: $0, reportError: reportError) }).point
    }

    func webClickHitsTarget(app: UIElement, reportError: @escaping (Error) -> Void) async -> Bool {
        let target: any UIElementProtocol = self
        return await uiElementWebClickHitsTarget(target: target,
            clickablePoint: { try await clickablePoint(reportError: reportError) },
            hitTest: { try app.axElement.element(at: $0) as (any UIElementProtocol)? },
            parent: { $0.parentValue(reportError: reportError) },
            equal: { providerAXElementsEqual($0.axElement, $1.axElement) })
    }
}
