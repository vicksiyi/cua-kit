import ApplicationServices

private enum ProviderClickChecks {
    final class Hit: AXUIElementProtocol {
        var result: UIElement?
        var points: [CGPoint] = []
        var fail = false
        static func == (lhs: Hit, rhs: Hit) -> Bool { lhs === rhs }
        func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
        var supportedAttributes: [UIElementAttribute] = []
        var attributes: [UIElementAttribute: AXPartialValue] = [:]
        func value(for attribute: UIElementAttribute) -> (error: AXError, value: AXPartialValue?) { fatalError() }
        func values(for attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue] { self.attributes }
        func arrayValue(for attribute: UIElementAttribute, index: Int, maxValues: Int, countIfKnown: Int?) -> (error: AXError, value: AXPartialValue?) { fatalError() }
        func arrayCount(for attribute: UIElementAttribute) -> (error: AXError, count: Int) { fatalError() }
        func isAttributeSettable(_ attribute: UIElementAttribute) throws -> Bool { fatalError() }
        func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws { fatalError() }
        var supportedParameterizedAttributes: [UIElementAttribute] { fatalError() }
        func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue? { fatalError() }
        func element(at point: CGPoint) throws -> UIElement? {
            points.append(point)
            if fail { throw UIElementError.axError(.failure) }
            return result
        }
        var actions: [UIElementAction] { get throws { fatalError() } }
        func description(for action: UIElementAction) throws -> String? { fatalError() }
        func perform(_ action: UIElementAction) throws { fatalError() }
        var pid: Int32 { get throws { fatalError() } }
        var actualPID: Int32 { get throws { fatalError() } }
        var windowID: UInt32 { get throws { fatalError() } }
        var bundleIdentifier: String? { fatalError() }
        func isEqual(to other: any AXUIElementProtocol) -> Bool { self === other }
    }
    final class Provider: AXMockProvider {
        let app: AXUIElement
        let hit = Hit()
        var replacements: [AXUIElement: Hit] = [:]
        init(app: AXUIElement) { self.app = app }
        func lookup(_ element: AXUIElement) -> (any AXUIElementProtocol)? {
            CFEqual(app, element) ? hit : replacements[element]
        }
    }
    static func run() async throws {
        let appAX = AXUIElementCreateApplication(12501), targetAX = AXUIElementCreateApplication(12502)
        let provider = Provider(app: appAX)
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let role = UIElementAttribute("AXRole")
        var rect = CGRect(x: 10, y: 20, width: 80, height: 40)
        let target = UIElement(axElement: targetAX, cache: UIElementCache(supportedAttributes: [role, .frame],
            attributes: [role: partial("AXWindow" as NSString), .frame: partial(AXValueCreate(.cgRect, &rect)!)], transactionAttributes: nil))
        let app = UIElement(axElement: appAX, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
        let point = try await target.clickablePoint(reportError: { _ in unexpectedFailure("unexpected read failure") })
        checkEqual(point, CGPoint(x: 50, y: 40))
        checkTrue(provider.hit.points.isEmpty)
        let parentAX = AXUIElementCreateApplication(12503)
        let parentKey = UIElementAttribute("AXParent")
        let parentMock = Hit()
        parentMock.supportedAttributes = [role, .frame]
        var parentRect = CGRect(x: 0, y: 0, width: 100, height: 100)
        parentMock.attributes = [role: partial("AXWindow" as NSString), .frame: partial(AXValueCreate(.cgRect, &parentRect)!)]
        provider.replacements[parentAX] = parentMock
        let nested = UIElement(axElement: targetAX, cache: UIElementCache(supportedAttributes: [role, .frame, parentKey],
            attributes: [role: partial("AXButton" as NSString), .frame: partial(AXValueCreate(.cgRect, &rect)!), parentKey: partial(parentAX)], transactionAttributes: nil))
        let nestedPoint = try await nested.clickablePoint(reportError: { _ in unexpectedFailure() })
        checkEqual(nestedPoint, CGPoint(x: 50, y: 40))
        parentRect = CGRect(x: 0, y: 0, width: 5, height: 5)
        parentMock.attributes[.frame] = partial(AXValueCreate(.cgRect, &parentRect)!)
        let clippedPoint = try await nested.clickablePoint(reportError: { _ in unexpectedFailure() })
        checkTrue(clippedPoint == nil)
        provider.hit.result = target
        let hits = await target.webClickHitsTarget(app: app, reportError: { _ in unexpectedFailure() })
        checkTrue(hits)
        checkEqual(provider.hit.points, [CGPoint(x: 50, y: 40)])
        provider.hit.fail = true
        let failed = await target.webClickHitsTarget(app: app, reportError: { _ in unexpectedFailure() })
        checkFalse(failed)
        let noFrame = UIElement(axElement: targetAX, cache: UIElementCache(supportedAttributes: [role],
            attributes: [role: partial("AXWindow" as NSString)], transactionAttributes: nil))
        do {
            _ = try await noFrame.clickablePoint(reportError: { _ in unexpectedFailure() })
            unexpectedFailure("missing frame must throw")
        } catch UIElementGeometryError.elementHasNoFrame {}
        let before = provider.hit.points.count
        let missingFrameHit = await noFrame.webClickHitsTarget(app: app, reportError: { _ in unexpectedFailure() })
        checkFalse(missingFrameHit)
        checkEqual(provider.hit.points.count, before)
    }
}

private func checkEqual<T: Equatable>(_ lhs: T, _ rhs: T) { precondition(lhs == rhs) }
private func checkTrue(_ value: Bool) { precondition(value) }
private func checkFalse(_ value: Bool) { precondition(!value) }
private func unexpectedFailure(_ message: String = "unexpected failure") { preconditionFailure(message) }

func runProviderClickChecks() async throws { try await ProviderClickChecks.run() }
