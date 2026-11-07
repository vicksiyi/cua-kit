import ApplicationServices

private enum ProviderClickChecks {
    final class Hit: AXUIElementProtocol {
        var result: UIElement?
        var points: [CGPoint] = []
        var fail = false
        var performed: [UIElementAction] = []
        var readResult: (error: AXError, value: AXPartialValue?) = (.success, nil)
        var singleReads = 0
        var arrayReads: [Int] = []
        var parameterRead: ((UIElementAttribute, AXEncodedValue) throws -> AXPartialValue?)?
        static func == (lhs: Hit, rhs: Hit) -> Bool { lhs === rhs }
        func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
        var supportedAttributes: [UIElementAttribute] = []
        var attributes: [UIElementAttribute: AXPartialValue] = [:]
        func value(for attribute: UIElementAttribute) -> (error: AXError, value: AXPartialValue?) { singleReads += 1; return readResult }
        func values(for attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue] { self.attributes }
        func arrayValue(for attribute: UIElementAttribute, index: Int, maxValues: Int, countIfKnown: Int?) -> (error: AXError, value: AXPartialValue?) {
            checkEqual(index, 0); checkTrue(countIfKnown == nil)
            arrayReads.append(maxValues); return readResult
        }
        func arrayCount(for attribute: UIElementAttribute) -> (error: AXError, count: Int) { fatalError() }
        func isAttributeSettable(_ attribute: UIElementAttribute) throws -> Bool { fatalError() }
        func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws { fatalError() }
        var parameterSupport: (() -> [UIElementAttribute])?
        var supportedParameterizedAttributes: [UIElementAttribute] {
            guard let parameterSupport else { fatalError() }; return parameterSupport()
        }
        func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue? {
            guard let parameterRead else { fatalError() }
            return try parameterRead(attribute, parameter)
        }
        func element(at point: CGPoint) throws -> UIElement? {
            points.append(point)
            if fail { throw UIElementError.axError(.failure) }
            return result
        }
        var actionRead: (() throws -> [UIElementAction])?
        var descriptionRead: ((UIElementAction) throws -> String?)?
        var actions: [UIElementAction] { get throws {
            guard let actionRead else { fatalError() }; return try actionRead()
        } }
        func description(for action: UIElementAction) throws -> String? {
            guard let descriptionRead else { fatalError() }; return try descriptionRead(action)
        }
        func perform(_ action: UIElementAction) throws {
            performed.append(action)
            if fail { throw UIElementError.axError(.failure) }
        }
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
        for name in ["AXComboBox", "AXIncrementor", "AXTextArea", "AXTextField"] {
            checkTrue(transformedUIElementChromiumAllowsValue(role: UIElementRole(name),
                subrole: nil, traversalParentRole: nil))
        }
        for name in ["AXDateField", "AXDateTimeArea", "AXTimeField"] {
            checkFalse(transformedUIElementChromiumAllowsValue(role: UIElementRole("AXIncrementor"),
                subrole: nil, traversalParentRole: UIElementRole(name)))
            checkTrue(transformedUIElementChromiumAllowsValue(role: .textField,
                subrole: nil, traversalParentRole: UIElementRole(name)))
        }
        checkTrue(transformedUIElementChromiumAllowsValue(role: UIElementRole("AXIncrementor"),
            subrole: nil, traversalParentRole: .group))
        checkTrue(transformedUIElementChromiumAllowsValue(role: .radioButton,
            subrole: "AXTabButton", traversalParentRole: nil))
        checkFalse(transformedUIElementChromiumAllowsValue(role: .radioButton,
            subrole: nil, traversalParentRole: nil))
        checkFalse(transformedUIElementChromiumAllowsValue(role: .button,
            subrole: "AXTabButton", traversalParentRole: nil))
        checkFalse(transformedUIElementChromiumAllowsValue(role: UIElementRole("AXSlider"),
            subrole: nil, traversalParentRole: nil))
        let eventWritableRoles = ["AXComboBox", "AXDateField", "AXDateTimeArea", "AXIncrementor",
            "AXSlider", "AXTextArea", "AXTextField", "AXTimeField"]
        for name in eventWritableRoles + ["AXButton", "AXCheckBox", "AXStaticText", "Custom"] {
            let result = transformedUIElementValueSettable(contextType: .eventStreamContext,
                isChromium: false, role: UIElementRole(name), chromiumAllowsValue: { unexpectedFailure() },
                readSupportedAndSettable: { unexpectedFailure() })
            checkEqual(result, eventWritableRoles.contains(name))
        }
        var writableProbes: [String] = []
        checkFalse(transformedUIElementValueSettable(contextType: .eventStreamContext, isChromium: true,
            role: .textField, chromiumAllowsValue: { writableProbes.append("chromium"); return false },
            readSupportedAndSettable: { unexpectedFailure() }))
        checkEqual(writableProbes, ["chromium"])
        checkTrue(transformedUIElementValueSettable(contextType: .fullUIContext, isChromium: true,
            role: .textField, chromiumAllowsValue: { writableProbes.append("chromium"); return true },
            readSupportedAndSettable: { writableProbes.append("native"); return true }))
        checkEqual(writableProbes, ["chromium", "chromium", "native"])
        func formatted(_ raw: AnyObject, _ type: TransformedUIElementValueType) -> String? {
            transformedUIElementFormattedValue(raw, classify: { type },
                dateFormat: { unexpectedFailure() })
        }
        checkEqual(formatted(NSNumber(value: 42), .integer), "42")
        checkEqual(formatted(NSNumber(value: 1.25), .float), "1.25")
        checkEqual(formatted(kCFBooleanTrue, .boolean), "on")
        checkEqual(formatted(kCFBooleanFalse, .boolean), "off")
        checkEqual(formatted("raw string" as NSString, .string), "raw string")
        checkTrue(formatted(NSArray(), .unknown) == nil)
        for (components, expected): (Int, TransformedUIElementDateFormat) in [
            (0x0c, .time), (0x0e, .time), (0xc0, .monthAndYear), (0xe0, .date),
            (0xec, .dateAndTime), (0xee, .dateAndTime)
        ] {
            checkEqual(transformedUIElementDateFormat(components: components,
                reportUnknown: { _ in unexpectedFailure() }), expected)
        }
        checkEqual(transformedUIElementDateFormat(components: nil,
            reportUnknown: { _ in unexpectedFailure() }), .dateAndTime)
        var unknownComponents: [UInt] = []
        checkEqual(transformedUIElementDateFormat(components: 1,
            reportUnknown: { unknownComponents.append($0) }), .dateAndTime)
        checkEqual(unknownComponents, [1])
        let dateOnly = TransformedUIElementDateFormat.date.makeFormatter()
        checkEqual(dateOnly.dateStyle, .short); checkEqual(dateOnly.timeStyle, .none)
        let timeOnly = TransformedUIElementDateFormat.time.makeFormatter()
        checkEqual(timeOnly.dateStyle, .none); checkEqual(timeOnly.timeStyle, .short)
        let dateTime = TransformedUIElementDateFormat.dateAndTime.makeFormatter()
        checkEqual(dateTime.dateStyle, .short); checkEqual(dateTime.timeStyle, .short)
        let monthYear = TransformedUIElementDateFormat.monthAndYear.makeFormatter()
        checkEqual(monthYear.dateFormat, "MMMM yyyy")
        var formatRequests = 0
        let sampleDate = NSDate(timeIntervalSince1970: 0)
        let formattedDate = transformedUIElementFormattedValue(sampleDate, classify: { .date }, dateFormat: {
            formatRequests += 1; return .monthAndYear
        })
        checkEqual(formattedDate, monthYear.string(from: sampleDate as Date))
        checkEqual(formatRequests, 1)
        let visibleKey = UIElementAttribute.visibleCharacterRange
        let visibleAX = AXUIElementCreateApplication(12504)
        let encodedVisible = try AXEncodedValue(wrapping: CFRange(location: 7, length: 12))
        let visiblePartial = AXPartialValue(value: encodedVisible, arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        func visibleElement(_ attributes: [UIElementAttribute: AXPartialValue], supported: Bool = true) -> UIElement {
            UIElement(axElement: visibleAX, cache: UIElementCache(
                supportedAttributes: supported ? [visibleKey] : [], attributes: attributes,
                transactionAttributes: [visibleKey]))
        }
        var visibleReads = 0
        var visibleErrors = 0
        let cachedVisible = visibleElement([visibleKey: visiblePartial]).visibleCharacterRangeValue(
            read: { visibleReads += 1; return (.failure, nil) }, reportError: { _ in visibleErrors += 1 })
        checkEqual(cachedVisible, NSRange(location: 7, length: 12)); checkEqual(visibleReads, 0)
        let invalidVisible = AXPartialValue(value: AXEncodedValue(value: "bad" as NSString), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        let freshVisible = visibleElement([visibleKey: invalidVisible]).visibleCharacterRangeValue(
            read: { visibleReads += 1; return (.success, visiblePartial) }, reportError: { _ in visibleErrors += 1 })
        checkEqual(freshVisible, NSRange(location: 7, length: 12)); checkEqual(visibleReads, 1)
        checkEqual(visibleErrors, 0)
        let rejectedVisible = visibleElement([:]).visibleCharacterRangeValue(
            read: { (.success, invalidVisible) }, reportError: { _ in visibleErrors += 1 })
        checkTrue(rejectedVisible == nil); checkEqual(visibleErrors, 1)
        let notFoundPartial = AXPartialValue(value: try AXEncodedValue(wrapping: CFRange(location: -1, length: 0)),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        checkEqual(visibleElement([visibleKey: notFoundPartial]).visibleCharacterRangeValue(
            read: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }),
            NSRange(location: NSNotFound, length: 0))
        checkTrue(visibleElement([:]).visibleCharacterRangeValue(read: { (.failure, nil) },
            reportError: { _ in visibleErrors += 1 }) == nil)
        checkEqual(visibleErrors, 2)
        let absentVisible = visibleElement([:], supported: false).visibleCharacterRangeValue(
            read: { visibleReads += 1; return (.success, visiblePartial) }, reportError: { _ in visibleErrors += 1 })
        checkTrue(absentVisible == nil); checkEqual(visibleReads, 1)
        func truncate(_ text: String, count: Int, available: Range<Int>? = nil,
            role: UIElementRole = .textArea, visible: NSRange? = nil,
            reread: String? = nil
        ) -> (text: String, truncationRange: NSRange?) {
            transformedUIElementText(text, descriptor: .init(count: count, availableRange: available),
                role: role, visibleCharacterRange: { visible },
                readStringForRange: { _ in "remote" }, rereadValue: { reread },
                reportError: { _ in unexpectedFailure() })
        }
        let completeText = truncate("full", count: 4)
        checkEqual(completeText.text, "full"); checkTrue(completeText.truncationRange == nil)
        let partialText = truncate("part", count: 20, available: 6..<10)
        checkEqual(partialText.text, "part")
        checkEqual(partialText.truncationRange, NSRange(location: 6, length: 4))
        let rereadEmpty = truncate("part", count: 20, available: 6..<10, reread: "")
        checkEqual(rereadEmpty.text, ""); checkTrue(rereadEmpty.truncationRange == nil)
        let boundaryText = String(repeating: "b", count: 100_000)
        let boundary = transformedUIElementText(boundaryText,
            descriptor: .init(count: 100_000, availableRange: 0..<100_000), role: .textField,
            visibleCharacterRange: { unexpectedFailure() },
            readStringForRange: { _ in unexpectedFailure() },
            rereadValue: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
        checkEqual(boundary.text, boundaryText); checkTrue(boundary.truncationRange == nil)
        let huge = String(repeating: "a", count: 100_001)
        let defaultSlice = truncate(huge, count: 100_001)
        checkEqual(defaultSlice.text.count, 100_000)
        checkEqual(defaultSlice.truncationRange, NSRange(location: 0, length: 100_000))
        let zeroVisible = truncate(huge, count: 100_001, visible: NSRange(location: 20, length: 0))
        checkEqual(zeroVisible.truncationRange, NSRange(location: 0, length: 100_000))
        let visibleSlice = truncate(huge, count: 100_001, visible: NSRange(location: 10, length: 3))
        checkEqual(visibleSlice.text, "aaa")
        checkEqual(visibleSlice.truncationRange, NSRange(location: 10, length: 3))
        let remoteSlice = truncate("cached", count: 100_001, visible: NSRange(location: 20, length: 5))
        checkEqual(remoteSlice.text, "remote")
        checkEqual(remoteSlice.truncationRange, NSRange(location: 20, length: 5))
        for role in [UIElementRole.button, .unknown] {
            let untouched = transformedUIElementText("cached",
                descriptor: .init(count: 100_001, availableRange: 0..<6), role: role,
                visibleCharacterRange: { unexpectedFailure() },
                readStringForRange: { _ in unexpectedFailure() },
                rereadValue: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
            checkEqual(untouched.text, "cached"); checkTrue(untouched.truncationRange == nil)
        }
        var truncationErrors = 0
        let failedReread = transformedUIElementText("part",
            descriptor: .init(count: 20, availableRange: 6..<10), role: .staticText,
            visibleCharacterRange: { unexpectedFailure() },
            readStringForRange: { _ in unexpectedFailure() },
            rereadValue: { throw UIElementError.axError(.failure) },
            reportError: { _ in truncationErrors += 1 })
        checkEqual(failedReread.truncationRange, NSRange(location: 6, length: 4))
        checkEqual(truncationErrors, 1)
        checkEqual(transformedUIElementString(in: NSRange(location: 1, length: 2), from: "abcd",
            readStringForRange: { _ in unexpectedFailure() }), "bc")
        // A UTF-16 range fitting the local text can still use AX because the
        // original first compares its end against grapheme count, not UTF-16.
        var rangeReads = 0
        checkEqual(transformedUIElementString(in: NSRange(location: 0, length: 2), from: "🙂") {
            checkEqual($0.location, 0); checkEqual($0.length, 2)
            rangeReads += 1
            return "provider"
        }, "provider")
        checkEqual(rangeReads, 1)
        checkEqual(transformedUIElementString(in: NSRange(location: 1, length: 0), from: "🙂",
            readStringForRange: { _ in unexpectedFailure() }), "")
        checkEqual(transformedUIElementString(in: NSRange(location: NSNotFound, length: 0), from: "") {
            checkEqual($0.location, -1); checkEqual($0.length, 0)
            return nil
        }, "")
        checkEqual(transformedUIElementString(in: NSRange(location: 0, length: 20), from: "short") {
            _ in throw UIElementError.axError(.failure)
        }, "")
        func valueType(_ value: AnyObject?, role: UIElementRole = .unknown,
            subrole: String? = nil) -> TransformedUIElementValueType {
            transformedUIElementValueType(cachedValue: value, role: { role }, subrole: { subrole })
        }
        checkEqual(valueType(NSNumber(value: 7)), .integer)
        checkEqual(valueType(NSNumber(value: 7.5)), .float)
        checkEqual(valueType(kCFBooleanTrue), .boolean)
        checkEqual(valueType("hello" as NSString), .string)
        checkEqual(valueType(NSDate(timeIntervalSince1970: 0)), .date)
        checkEqual(valueType([] as NSArray), .unknown)
        checkEqual(valueType(nil, role: .textField), .string)
        checkEqual(valueType(nil, role: .textArea), .string)
        checkEqual(valueType(nil, role: .checkBox, subrole: "AXSwitch"), .unknown)
        checkEqual(valueType("yes" as NSString, role: .checkBox, subrole: "AXSwitch"), .boolean)
        checkEqual(valueType("yes" as NSString, role: .checkBox, subrole: "AXToggle"), .boolean)
        checkEqual(valueType("yes" as NSString, role: .button, subrole: "AXSwitch"), .string)
        var valueTypeReads: [String] = []
        let changingSubrole = transformedUIElementValueType(cachedValue: "yes" as NSString,
            role: { valueTypeReads.append("role"); return .checkBox }, subrole: {
                valueTypeReads.append("subrole")
                return valueTypeReads.count == 2 ? "other" : "AXToggle"
            })
        checkEqual(changingSubrole, .boolean)
        checkEqual(valueTypeReads, ["role", "subrole", "subrole"])
        checkEqual(TransformedUIElementValueType.integer.name, "integer")
        struct RenderingContext: AccessibilityRenderingContext {
            typealias Role = UIElementRole
            let type = UIElementContextType.fullUIContext
            var urlShortener = UIElementURLShortener(configuration: .init(
                individualLimit: nil, totalLimit: nil, includeQuery: true,
                includeFragment: true, baseHost: nil))
        }
        var renderingContext = RenderingContext()
        let renderURL = URL(string: "https://example.invalid/path?query=one#fragment")!
        var interpolation = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 1)
        interpolation.appendInterpolation(renderURL, role: nil, context: &renderingContext)
        var renderedURL = TransformedUIString(stringInterpolation: interpolation)
        checkTrue(renderedURL.description.contains("query=one"))
        renderingContext.urlShortener.configuration.includeQuery = false
        renderingContext.urlShortener.configuration.includeFragment = false
        checkTrue(renderedURL.trimURLs(context: &renderingContext))
        checkFalse(renderedURL.description.contains("query=one"))
        checkFalse(renderedURL.description.contains("fragment"))
        checkFalse(renderedURL.trimURLs(context: &renderingContext))
        var linked = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 1)
        linked.appendMarkdownLink(url: renderURL, role: .link, stringValue: "[label]",
            title: "ignored", description: nil, context: &renderingContext)
        let renderedLink = TransformedUIString(stringInterpolation: linked)
        checkTrue(renderedLink.description.hasPrefix("[\\[label\\]]("))
        checkTrue(renderedLink.description.hasSuffix(")"))
        var imageInterpolation = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 2)
        imageInterpolation.appendInterpolation(renderURL, role: .image, context: &renderingContext)
        imageInterpolation.appendInterpolation(renderURL, role: .image, context: &renderingContext)
        var imageText = TransformedUIString(stringInterpolation: imageInterpolation)
        checkEqual(imageText.description, "")
        checkFalse(imageText.isEmpty) // Two retained empty URL spans, not zero spans.
        checkFalse(imageText.trimURLs(context: &renderingContext))
        let compilerURL: TransformedUIString = "URL: \(renderURL, role: UIElementRole.link, context: &renderingContext)"
        checkEqual(compilerURL.description, "URL: " + renderedURL.description)
        var mappedText = TransformedUIString()
        mappedText.appendMappedString("🙂a", sourceOffsets: [10, 11, 12])
        checkEqual(mappedText.description, "🙂a")
        checkEqual(mappedText.sourceRange(forMarkdownRange: NSRange(location: 0, length: 2)),
            NSRange(location: 10, length: 2))
        let interpolatedText: TransformedUIString = "prefix \(mappedText) suffix"
        checkEqual(interpolatedText.description, "prefix 🙂a suffix")
        checkEqual(interpolatedText.sourceRange(ofMarkdownSubstring: "🙂a"),
            NSRange(location: 10, length: 3))
        checkTrue(interpolatedText.sourceRange(ofMarkdownSubstring: "prefix") == nil)
        var copiedText = mappedText
        copiedText += "!"
        copiedText.removeLast()
        copiedText.removeLast()
        checkEqual(copiedText.description, "🙂")
        checkEqual(mappedText.description, "🙂a")
        checkEqual(copiedText.last, "🙂")
        let joinedText = [TransformedUIString(), mappedText, mappedText].joined(separator: "|")
        checkEqual(joinedText.description, "🙂a|🙂a")
        checkEqual(joinedText.sourceRange(forMarkdownRange: NSRange(location: 0, length: 3)),
            NSRange(location: 10, length: 3))
        checkTrue(joinedText.sourceRange(forMarkdownRange: NSRange(location: 4, length: 3)) == nil)
        checkEqual([mappedText, TransformedUIString()].joined(separator: "|").description, "🙂a|")
        checkTrue([TransformedUIString]().joined(separator: "|").isEmpty)
        // Join retains the first URL's metadata but flattens subsequent elements.
        var urlJoin = [renderedURL, compilerURL].joined(separator: "|")
        renderingContext.urlShortener.configuration.individualLimit = 5
        checkTrue(urlJoin.trimURLs(context: &renderingContext))
        checkTrue(urlJoin.description.hasSuffix("|" + compilerURL.description))
        // Two empty image spans are structurally nonempty, so keep the separator.
        checkEqual([imageText, TransformedUIString("x")].joined(separator: "|").description, "|x")
        let repeatedText = mappedText + mappedText
        checkTrue(repeatedText.sourceRange(ofMarkdownSubstring: "🙂a") == nil)
        checkEqual(repeatedText.sourceRange(forMarkdownRange: NSRange(location: 3, length: 3)),
            NSRange(location: 10, length: 3))
        let emptyInterpolation = TransformedUIString.StringInterpolation(
            literalCapacity: -2, interpolationCount: 1)
        var emptyText = TransformedUIString(stringInterpolation: emptyInterpolation)
        emptyText.removeLast() // Zero spans are a no-op; init() has one empty span.
        checkTrue(emptyText.isEmpty)
        checkTrue(emptyText.last == nil)
        let disclosureAttribute = UIElementAttribute("AXDisclosing")
        let supportCache = UIElementCache(supportedAttributes: [disclosureAttribute],
            attributes: [:], transactionAttributes: nil)
        let unsupportedCache = UIElementCache(supportedAttributes: [],
            attributes: [:], transactionAttributes: [disclosureAttribute])
        let unrequestedCache = UIElementCache(supportedAttributes: [],
            attributes: [:], transactionAttributes: [])
        var disclosureReads: [String] = []
        for context in UIElementContextType.allCases {
            disclosureReads = []
            let supported = transformedUIElementIsDisclosable(contextType: context,
                isDisclosing: false, cache: supportCache,
                freshSupportedAttributes: { unexpectedFailure() }, isAttributeSettable: {
                    checkEqual($0, disclosureAttribute)
                    disclosureReads.append("settable")
                    return false
                })
            checkEqual(supported, context == .eventStreamContext)
            checkEqual(disclosureReads, context == .eventStreamContext ? [] : ["settable"])
            checkFalse(transformedUIElementIsDisclosable(contextType: context,
                isDisclosing: false, cache: unsupportedCache,
                freshSupportedAttributes: { unexpectedFailure() },
                isAttributeSettable: { _ in unexpectedFailure() }))
        }
        checkTrue(transformedUIElementIsDisclosable(contextType: .eventStreamContext,
            isDisclosing: true, cache: unrequestedCache,
            freshSupportedAttributes: { unexpectedFailure() },
            isAttributeSettable: { _ in unexpectedFailure() }))
        disclosureReads = []
        checkTrue(transformedUIElementIsDisclosable(contextType: .fullUIContext,
            isDisclosing: true, cache: unrequestedCache,
            freshSupportedAttributes: { disclosureReads.append("support"); return [disclosureAttribute] },
            isAttributeSettable: { _ in disclosureReads.append("settable"); return true }))
        checkEqual(disclosureReads, ["support", "settable"])
        checkFalse(transformedUIElementIsDisclosable(contextType: .fullUIContext,
            isDisclosing: true, cache: supportCache,
            freshSupportedAttributes: { unexpectedFailure() },
            isAttributeSettable: { _ in throw UIElementError.axError(.failure) }))
        // Constructor context branches must not issue live capability reads in
        // event-stream mode, or read Catalyst traits in other contexts.
        var capabilityReads: [String] = []
        for context in [UIElementContextType.fullUIContext, .informationalContext] {
            capabilityReads = []
            let flags = transformedUIElementInteractionCapabilities(contextType: context,
                isCatalyst: true, role: .group, readTraits: { unexpectedFailure() },
                hasSupportedSelectionAttributes: { unexpectedFailure() },
                readSelectable: { capabilityReads.append("selected"); return true },
                readFocusable: { capabilityReads.append("focused"); return false })
            checkTrue(flags.isSelectable)
            checkFalse(flags.isFocusable)
            checkEqual(capabilityReads, ["selected", "focused"])
        }
        func inferred(_ role: UIElementRole, catalyst: Bool = false,
            traits: UInt64? = nil, selectionAttributes: Bool = false
        ) -> (isSelectable: Bool, isFocusable: Bool) {
            transformedUIElementInteractionCapabilities(contextType: .eventStreamContext,
                isCatalyst: catalyst, role: role,
                readTraits: { capabilityReads.append("traits"); return traits },
                hasSupportedSelectionAttributes: {
                    capabilityReads.append("selectionAttributes"); return selectionAttributes
                }, readSelectable: { unexpectedFailure() }, readFocusable: { unexpectedFailure() })
        }
        capabilityReads = []
        let group = inferred(.group, selectionAttributes: true)
        checkTrue(group.isSelectable && group.isFocusable)
        checkEqual(capabilityReads, ["selectionAttributes"])
        let text = inferred(.textField)
        checkTrue(text.isFocusable)
        checkFalse(text.isSelectable)
        let row = inferred(.row)
        checkTrue(row.isSelectable && row.isFocusable)
        let unknown = inferred(.unknown, selectionAttributes: true)
        checkFalse(unknown.isSelectable || unknown.isFocusable)
        capabilityReads = []
        let traitGroup = inferred(.group, catalyst: true, traits: 1 << 3)
        checkTrue(traitGroup.isSelectable && traitGroup.isFocusable)
        checkEqual(capabilityReads, ["traits"])
        let traitUnknown = inferred(.unknown, catalyst: true, traits: 1)
        checkTrue(traitUnknown.isFocusable)
        checkFalse(traitUnknown.isSelectable)
        let absentTraits = inferred(.group, catalyst: true)
        checkFalse(absentTraits.isSelectable || absentTraits.isFocusable)
        // Source role exceptions: selection alone makes static text interactive,
        // but does not make a group or text area interactive.
        for focusable in [false, true] {
            for selectable in [false, true] {
                checkEqual(transformedUIElementCanBeUserInteractive(role: .staticText,
                    isFocusable: focusable, isSelectable: selectable), focusable || selectable)
                for role: UIElementRole in [.group, .textArea] {
                    checkEqual(transformedUIElementCanBeUserInteractive(role: role,
                        isFocusable: focusable, isSelectable: selectable), focusable)
                }
                checkTrue(transformedUIElementCanBeUserInteractive(role: .button,
                    isFocusable: focusable, isSelectable: selectable))
            }
        }
        checkFalse(transformedUIElementHasInterestingActions(nil))
        checkFalse(transformedUIElementHasInterestingActions([]))
        checkFalse(transformedUIElementHasInterestingActions([.showMenu, .scrollToVisible, .showMenu]))
        checkTrue(transformedUIElementHasInterestingActions([.showMenu, .press]))
        checkTrue(transformedUIElementHasInterestingActions([UIElementAction("custom")]))
        let appAX = AXUIElementCreateApplication(12501), targetAX = AXUIElementCreateApplication(12502)
        let provider = Provider(app: appAX)
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let textAX = AXUIElementCreateApplication(12505)
        let textProvider = Hit()
        provider.replacements[textAX] = textProvider
        let textElement = UIElement(axElement: textAX, cache: UIElementCache(
            supportedAttributes: [UIElementAttribute("AXValue"), .visibleCharacterRange],
            attributes: [UIElementAttribute("AXRole"): partial("AXTextArea" as NSString)],
            transactionAttributes: nil))
        var textErrors = 0
        textProvider.readResult = (.success, partial("full value" as NSString))
        let refreshedText = textElement.transformedTextValue("part",
            descriptor: .init(count: 20, availableRange: 0..<4), reportError: { _ in textErrors += 1 })
        checkEqual(refreshedText.text, "full value"); checkTrue(refreshedText.truncationRange == nil)
        checkEqual(textProvider.singleReads, 1)
        textProvider.readResult = (.failure, nil)
        let retainedText = textElement.transformedTextValue("part",
            descriptor: .init(count: 20, availableRange: 6..<10), reportError: { _ in textErrors += 1 })
        checkEqual(retainedText.text, "part"); checkEqual(retainedText.truncationRange, NSRange(location: 6, length: 4))
        checkEqual(textErrors, 1); checkEqual(textProvider.singleReads, 2)
        let synthesizedText = textElement.transformedTextValue("😀", descriptor: nil,
            reportError: { _ in unexpectedFailure() })
        checkEqual(synthesizedText.text, "😀"); checkTrue(synthesizedText.truncationRange == nil)
        checkEqual(textProvider.singleReads, 2)
        textProvider.readResult = (.success, visiblePartial)
        let clippedText = textElement.transformedTextValue(String(repeating: "x", count: 100001),
            descriptor: nil, reportError: { _ in unexpectedFailure() })
        checkEqual(clippedText.text, String(repeating: "x", count: 12))
        checkEqual(clippedText.truncationRange, NSRange(location: 7, length: 12))
        checkEqual(textProvider.singleReads, 3)
        var rangeRequests = 0
        textProvider.parameterRead = { attribute, parameter in
            checkEqual(attribute, UIElementAttribute("AXStringForRange"))
            let range = try decodeAXRange(parameter.value, throwingOnFailure: true)
            checkEqual(range?.location, 7); checkEqual(range?.length, 12)
            rangeRequests += 1
            return partial("remote slice" as NSString)
        }
        let remoteText = textElement.transformedTextValue("short",
            descriptor: .init(count: 100001, availableRange: 0..<5), reportError: { _ in unexpectedFailure() })
        checkEqual(remoteText.text, "remote slice")
        checkEqual(remoteText.truncationRange, NSRange(location: 7, length: 12))
        checkEqual(rangeRequests, 1); checkEqual(textProvider.singleReads, 4)
        let dateAX = AXUIElementCreateApplication(12506)
        let dateProvider = Hit()
        provider.replacements[dateAX] = dateProvider
        let dateKey = UIElementAttribute.dateTimeComponents
        func dateElement(_ component: AXPartialValue?) -> UIElement {
            var attributes = [UIElementAttribute("AXValue"): partial(sampleDate)]
            attributes[dateKey] = component
            return UIElement(axElement: dateAX, cache: UIElementCache(
                supportedAttributes: [dateKey], attributes: attributes, transactionAttributes: [dateKey]))
        }
        var dateErrors = 0
        let cachedDateElement = dateElement(partial(NSNumber(value: 0xc0)))
        checkEqual(cachedDateElement.formattedTransformedValue(sampleDate,
            reportError: { _ in dateErrors += 1 }, reportUnknownDateComponents: { _ in unexpectedFailure() }),
            monthYear.string(from: sampleDate as Date))
        checkEqual(dateProvider.singleReads, 0)
        dateProvider.readResult = (.success, partial(NSNumber(value: 0x0c)))
        checkEqual(dateElement(partial("invalid" as NSString)).transformedDateFormat(
            reportError: { _ in dateErrors += 1 }, reportUnknown: { _ in unexpectedFailure() }), .time)
        checkEqual(dateProvider.singleReads, 1); checkEqual(dateErrors, 0)
        dateProvider.readResult = (.success, partial("invalid" as NSString))
        checkEqual(dateElement(nil).transformedDateFormat(reportError: { _ in dateErrors += 1 },
            reportUnknown: { _ in unexpectedFailure() }), .dateAndTime)
        checkEqual(dateErrors, 1)
        dateProvider.readResult = (.success, partial(NSNumber(value: 1)))
        var unknownDateValues: [UInt] = []
        checkEqual(dateElement(nil).transformedDateFormat(reportError: { _ in dateErrors += 1 },
            reportUnknown: { unknownDateValues.append($0) }), .dateAndTime)
        checkEqual(unknownDateValues, [1]); checkEqual(dateErrors, 1)
        func valueStateElement(_ value: AXPartialValue?, role: String = "AXTextField") -> UIElement {
            var attributes = [UIElementAttribute("AXRole"): partial(role as NSString)]
            attributes[UIElementAttribute("AXValue")] = value
            return UIElement(axElement: textAX, cache: UIElementCache(
                supportedAttributes: [], attributes: attributes, transactionAttributes: [UIElementAttribute("AXValue")]))
        }
        func valueState(_ element: UIElement) -> TransformedUIElementValueState {
            element.transformedValueState(contextType: .eventStreamContext, isChromium: false,
                traversalParentRole: nil, reportError: { _ in unexpectedFailure() },
                reportUnknownDateComponents: { _ in unexpectedFailure() })
        }
        let readsBeforeValueState = textProvider.singleReads
        let missingValueState = valueState(valueStateElement(nil))
        checkTrue(missingValueState.value == nil); checkTrue(missingValueState.valueTypeName == nil)
        checkFalse(missingValueState.isValueSettable)
        let fullValueState = valueState(valueStateElement(partial("full" as NSString)))
        checkEqual(fullValueState.value, "full"); checkEqual(fullValueState.valueTypeName, "string")
        checkTrue(fullValueState.isValueSettable); checkTrue(fullValueState.truncationRange == nil)
        let partialValueState = valueState(valueStateElement(AXPartialValue(
            value: AXEncodedValue(value: "part" as NSString), arraySubsetDescriptor: nil,
            textTruncationDescriptor: .init(count: 20, availableRange: 4..<8))))
        checkEqual(partialValueState.value, "part")
        checkEqual(partialValueState.truncationRange, NSRange(location: 4, length: 4))
        checkFalse(partialValueState.isValueSettable)
        let numberValueState = valueState(valueStateElement(partial(NSNumber(value: 42)), role: "AXSlider"))
        checkEqual(numberValueState.value, "42"); checkEqual(numberValueState.valueTypeName, "integer")
        checkTrue(numberValueState.isValueSettable)
        checkEqual(textProvider.singleReads, readsBeforeValueState)
        let cachedStringKeys = ["AXSubrole", "AXRoleDescription", "AXTitle", "AXDescription",
            "AXValueDescription", "AXPlaceholderValue", "AXHelp", "AXIdentifier"]
        let stringsElement = UIElement(axElement: textAX, cache: UIElementCache(supportedAttributes: [],
            attributes: Dictionary(uniqueKeysWithValues: cachedStringKeys.map {
                (UIElementAttribute($0), partial(($0 + " value") as NSString))
            }), transactionAttributes: nil))
        let strings = stringsElement.transformedCachedStrings()
        checkEqual([strings.subrole, strings.roleDescription, strings.title, strings.description,
            strings.valueDescription, strings.placeholderValue, strings.help, strings.identifier],
            cachedStringKeys.map { Optional($0 + " value") })
        let badStrings = UIElement(axElement: textAX, cache: UIElementCache(supportedAttributes: [],
            attributes: [UIElementAttribute("AXTitle"): partial(NSNumber(value: 1)),
                UIElementAttribute("AXHelp"): partial("" as NSString)], transactionAttributes: nil)).transformedCachedStrings()
        checkTrue(badStrings.title == nil); checkTrue(badStrings.description == nil)
        checkEqual(badStrings.help, "")
        checkEqual(textProvider.singleReads, readsBeforeValueState)
        var actionReads = 0
        var descriptionReads: [UIElementAction] = []
        var actionErrors = 0
        let unknownAction = UIElementAction("CustomAction")
        textProvider.actionRead = {
            actionReads += 1
            return [.press, unknownAction, .expand, .press]
        }
        textProvider.descriptionRead = { action in
            descriptionReads.append(action)
            return "Native description"
        }
        func capturedActions(_ context: UIElementContextType, disclosing: Bool = false) -> [UIElementActionDescription] {
            textElement.transformedActionDescriptions(contextType: context,
                capturedIsDisclosable: true, capturedIsDisclosing: disclosing,
                reportError: { _ in actionErrors += 1 })
        }
        checkEqual(capturedActions(.eventStreamContext), [])
        checkEqual(capturedActions(.informationalContext), [])
        checkEqual(actionReads, 0)
        let fullActions = capturedActions(.fullUIContext)
        checkEqual(fullActions.map(\.action), [.press, unknownAction, .expand, .press, .expand])
        checkEqual(fullActions.map(\.description), ["Press", "Native description", "Expand", "Press", "Expand"])
        checkEqual(actionReads, 1); checkEqual(descriptionReads, [unknownAction])
        textProvider.descriptionRead = { _ in throw UIElementError.axError(.failure) }
        let failedDescription = capturedActions(.fullUIContext, disclosing: true)
        checkEqual(failedDescription[1].description, "CustomAction")
        checkEqual(failedDescription.last?.action, .collapse)
        checkEqual(actionErrors, 1)
        textProvider.descriptionRead = { _ in nil }
        checkEqual(capturedActions(.fullUIContext)[1].description, "CustomAction")
        textProvider.actionRead = { actionReads += 1; throw UIElementError.axError(.failure) }
        checkEqual(capturedActions(.fullUIContext), [])
        checkEqual(actionErrors, 2)
        checkEqual(textProvider.singleReads, readsBeforeValueState)
        let ownerAX = AXUIElementCreateApplication(12508)
        let ownerProvider = Hit()
        provider.replacements[ownerAX] = ownerProvider
        var ownerActionReads = 0
        ownerProvider.actionRead = { ownerActionReads += 1; return [.press] }
        ownerProvider.descriptionRead = { _ in unexpectedFailure() }
        let ownerElement = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [UIElementAttribute("AXRole")], attributes: [
                UIElementAttribute("AXRole"): partial("AXGroup" as NSString),
                UIElementAttribute("AXTitle"): partial("Captured group" as NSString),
                UIElementAttribute("AXSelected"): partial(kCFBooleanTrue),
                UIElementAttribute("AXFocused"): partial(kCFBooleanTrue),
                UIElementAttribute("AXEnabled"): partial(kCFBooleanFalse),
                UIElementAttribute("AXDisclosing"): partial(kCFBooleanTrue),
                UIElementAttribute("AXDOMClassList"): partial(["group", 7] as NSArray)
            ], transactionAttributes: nil))
        func ownerContext(_ type: UIElementContextType) -> UIElementTransformationContext {
            UIElementTransformationContext(type: type, application: Optional<Int>.none,
                window: Optional<Int>.none, urlConfiguration: nil,
                isCatalystApp: { _ in unexpectedFailure() },
                applicationIsWebShaped: { _ in unexpectedFailure() },
                windowHasChromeNode: { _ in unexpectedFailure() }, frame: { _ in unexpectedFailure() })
        }
        let capturedOwner = TransformedUIElement(element: ownerElement,
            context: ownerContext(.fullUIContext), traversalParentRole: nil,
            reportError: { _ in unexpectedFailure() }, reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkTrue(CFEqual(capturedOwner.element.axElement, ownerAX))
        checkEqual(capturedOwner.role, .group); checkEqual(capturedOwner.title, "Captured group")
        checkTrue(capturedOwner.isSelected); checkTrue(capturedOwner.isFocused)
        checkFalse(capturedOwner.isEnabled); checkTrue(capturedOwner.isDisclosing)
        checkFalse(capturedOwner.isDisclosable); checkFalse(capturedOwner.isFocusable)
        checkFalse(capturedOwner.isSelectable); checkFalse(capturedOwner.isValueSettable)
        checkTrue(capturedOwner.value == nil); checkTrue(capturedOwner.valueTypeName == nil)
        checkTrue(capturedOwner.attributedString == nil); checkTrue(capturedOwner.transformedString == nil)
        checkEqual(capturedOwner.domClassList, ["group"])
        checkEqual(capturedOwner.actionDescriptions.map(\.action), [.press])
        let eventOwner = TransformedUIElement(element: ownerElement,
            context: ownerContext(.eventStreamContext), traversalParentRole: nil,
            reportError: { _ in unexpectedFailure() }, reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkTrue(eventOwner.isDisclosable); checkEqual(eventOwner.actionDescriptions, [])
        checkEqual(ownerActionReads, 1); checkEqual(ownerProvider.singleReads, 0)
        checkTrue(CFEqual(capturedOwner.axElement, ownerAX))
        checkEqual(capturedOwner.cache.supportedAttributes, ownerElement.cache.supportedAttributes)
        checkEqual(capturedOwner.actions, [.press])
        checkEqual(eventOwner.actions, [])
        checkTrue(eventOwner.actions != nil)
        checkTrue(capturedOwner.hasInterestingActions)
        checkFalse(eventOwner.hasInterestingActions)
        var computedOwner = capturedOwner
        computedOwner.value = "transformed display"
        checkEqual(computedOwner.stringValue, "transformed display")
        for flag in [kCFBooleanTrue!, kCFBooleanFalse!] {
            computedOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
                supportedAttributes: [], attributes: [UIElementAttribute("AXValue"): partial(flag)],
                transactionAttributes: nil))
            checkTrue(computedOwner.stringValue == nil)
        }
        computedOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [], attributes: [UIElementAttribute("AXValue"): partial("raw text" as NSString)],
            transactionAttributes: nil))
        checkEqual(computedOwner.stringValue, "transformed display")
        computedOwner.actionDescriptions = [.init(.showMenu, description: "menu"),
            .init(.scrollToVisible, description: "scroll")]
        checkFalse(computedOwner.hasInterestingActions)
        computedOwner.role = .staticText
        computedOwner.isFocusable = false; computedOwner.isSelectable = true
        checkTrue(computedOwner.isFocusableOrSelectable); checkTrue(computedOwner.canBeUserInteractive)
        computedOwner.role = .group
        checkFalse(computedOwner.canBeUserInteractive)
        checkEqual(ownerActionReads, 1); checkEqual(ownerProvider.singleReads, 0)
        computedOwner.role = .row; computedOwner.subrole = nil
        checkFalse(computedOwner.isTableRow)
        computedOwner.role = .group; computedOwner.subrole = "AXTableRow"
        checkTrue(computedOwner.isTableRow)
        computedOwner.subrole = "AXOutlineRow"
        checkFalse(computedOwner.isTableRow)
        for classes in [nil, [], ["is-sender-extra"], ["IS-SENDER"]] as [[String]?] {
            computedOwner.domClassList = classes
            checkFalse(computedOwner.isSentByCurrentUser)
        }
        computedOwner.domClassList = ["message", "is-sender"]
        checkTrue(computedOwner.isSentByCurrentUser)
        checkTrue(computedOwner.rowIndexRange == nil)
        for (location, length, expected) in [
            (0, 2, Optional(0...1)), (4, 3, Optional(4...6)),
            (4, 1, nil), (4, 0, nil), (4, -1, nil), (-1, 2, nil),
            (Int.max, 2, nil), (Int.max - 1, 2, Optional((Int.max - 1)...Int.max))
        ] {
            var range = CFRange(location: location, length: length)
            let encodedRange = AXValueCreate(.cfRange, &range)!
            computedOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
                supportedAttributes: [], attributes: [
                    UIElementAttribute("AXRowIndexRange"): partial(encodedRange),
                    UIElementAttribute("AXColumnIndexRange"): partial(encodedRange)
                ], transactionAttributes: nil))
            checkEqual(computedOwner.rowIndexRange, expected)
            checkEqual(computedOwner.columnIndexRange, expected)
        }
        computedOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [], attributes: [UIElementAttribute("AXRowIndexRange"): partial("bad" as NSString)],
            transactionAttributes: nil))
        checkTrue(computedOwner.rowIndexRange == nil)
        checkTrue(computedOwner.columnIndexRange == nil)
        checkEqual(ownerProvider.singleReads, 0)
        computedOwner.actionDescriptions = [
            .init(.press, description: "kept label"), .init(.showMenu, description: ""),
            .init(.scrollToVisible, description: "visible"), .init(.expand, description: "custom expand"),
            .init(.press, description: "duplicate")]
        let lazyPresentation = computedOwner.presentationActions
        checkEqual(Array(lazyPresentation).map(\.kind), [.press, .showMenu, .scrollToVisible, .other, .press])
        checkEqual(Array(lazyPresentation).map(\.description), ["kept label", "", "visible", "custom expand", "duplicate"])
        let savedPress = UIElementAction.press
        UIElementAction.press = .showMenu
        checkEqual(Array(lazyPresentation).map(\.kind), [.other, .press, .scrollToVisible, .other, .other])
        UIElementAction.press = savedPress
        computedOwner.actionDescriptions = []
        checkEqual(Array(lazyPresentation).count, 5)
        checkTrue(Array(computedOwner.presentationActions).isEmpty)
        computedOwner.role = .radioButton
        checkEqual(computedOwner.flattenedRole?.description, "radio button")
        computedOwner.role = .row
        checkEqual(computedOwner.flattenedRole?.description, "outline row")
        computedOwner.role = .group
        checkTrue(computedOwner.flattenedRole == nil)
        computedOwner.description = nil; computedOwner.value = ""; computedOwner.title = nil
        computedOwner.placeholderValue = nil
        checkFalse(computedOwner.hasDescriptiveAttributes)
        computedOwner.placeholderValue = " "
        checkTrue(computedOwner.hasDescriptiveAttributes)
        computedOwner.placeholderValue = nil; computedOwner.role = .image
        checkTrue(computedOwner.hasDescriptiveAttributes)
        computedOwner.role = .group; computedOwner.value = "off"
        computedOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [], attributes: [UIElementAttribute("AXValue"): partial(kCFBooleanFalse)],
            transactionAttributes: nil))
        checkTrue(computedOwner.stringValue == nil)
        checkTrue(computedOwner.hasDescriptiveAttributes)
        checkEqual(ownerActionReads, 1); checkEqual(ownerProvider.singleReads, 0)
        let protocolOwner: any AccessibilityNode = computedOwner
        checkEqual(protocolOwner.boolValue, false)
        checkTrue(protocolOwner.stringValue == nil)
        checkTrue(protocolOwner.hasDescriptiveAttributes)
        checkEqual(Array(protocolOwner.presentationActions).count, 0)
        checkTrue(CFEqual(computedOwner.id, ownerAX))
        var titledOwner = capturedOwner
        let titleLinks = UIElementAttribute("AXServesAsTitleForUIElements")
        titledOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [titleLinks], attributes: [titleLinks: partial([] as NSArray)],
            transactionAttributes: nil))
        checkTrue(titledOwner.titleTargetIdentities.isEmpty)
        checkEqual(ownerProvider.singleReads, 0)
        ownerProvider.readResult = (.success, partial([] as NSArray))
        titledOwner.element = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [titleLinks], attributes: [:], transactionAttributes: nil))
        checkTrue(titledOwner.titleTargetIdentities.isEmpty)
        checkEqual(ownerProvider.singleReads, 1)
        // Use the actual transformed node in the restored generic tree.
        let transformedLeaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        var transformedTree = UIElementTree<TransformedUIElement>(items: [
            .init(element: capturedOwner, subtree: transformedLeaf)
        ], focusedElement: capturedOwner)
        checkEqual(Array(transformedTree).count, 1)
        checkTrue(transformedTree.hasDescendant(where: \TransformedUIElement.hasDescriptiveAttributes))
        checkTrue(CFEqual(transformedTree.focusedElement!.id, ownerAX))
        func mutateCapturedNode<Node: MutableAccessibilityNode>(_ node: inout Node, role: Node.Role) {
            node.role = role
            node.roleDescription = "flattened"
            node.title = "joined"
            node.title?.append(" title")
            node.description = "description"
            node.value = "rendered value"
            node.isFocusable = true
            node.url = URL(string: "https://example.com/transform")
            node.transformedString = TransformedUIString(stringLiteral: "rendered")
        }
        var mutableOwner = capturedOwner
        let readsBeforeMutation = ownerProvider.singleReads
        mutateCapturedNode(&mutableOwner, role: .staticText)
        checkEqual(mutableOwner.role, .staticText)
        checkEqual(mutableOwner.roleDescription, "flattened")
        checkEqual(mutableOwner.title, "joined title")
        checkEqual(mutableOwner.description, "description")
        checkEqual(mutableOwner.value, "rendered value")
        checkTrue(mutableOwner.isFocusable)
        checkEqual(mutableOwner.url?.absoluteString, "https://example.com/transform")
        checkEqual(mutableOwner.transformedString?.description, "rendered")
        checkEqual(capturedOwner.title, "Captured group")
        checkEqual(mutableOwner.element.role, .group)
        checkTrue(CFEqual(mutableOwner.id, capturedOwner.id))
        checkEqual(ownerProvider.singleReads, readsBeforeMutation)
        checkEqual(ownerActionReads, 1)
        // Attribute changes affect display, but not native element identity.
        checkEqual(capturedOwner, mutableOwner)
        checkEqual(capturedOwner.hashValue, mutableOwner.hashValue)
        checkEqual(Set([capturedOwner, mutableOwner]).count, 1)
        var otherIdentityOwner = mutableOwner
        otherIdentityOwner.element = UIElement(axElement: textAX, cache: mutableOwner.cache)
        checkFalse(capturedOwner == otherIdentityOwner)
        checkEqual(Set([capturedOwner, otherIdentityOwner]).count, 2)
        // Hash combines the original CF identity, not the provider replacement.
        var expectedHasher = Hasher()
        expectedHasher.combine(CFHash(capturedOwner.axElement))
        var actualHasher = Hasher()
        capturedOwner.hash(into: &actualHasher)
        checkEqual(actualHasher.finalize(), expectedHasher.finalize())
        checkEqual(ownerProvider.singleReads, readsBeforeMutation)
        var parentNode = capturedOwner; parentNode.title = "parent"
        var childNode = capturedOwner; childNode.title = "child"
        var removedNode = capturedOwner; removedNode.title = "remove"
        var hiddenNode = capturedOwner; hiddenNode.title = "hidden"
        let childrenTree = UIElementTree<TransformedUIElement>(items: [
            .init(element: childNode, subtree: transformedLeaf)], focusedElement: childNode)
        let hiddenTree = UIElementTree<TransformedUIElement>(items: [
            .init(element: hiddenNode, subtree: transformedLeaf)], focusedElement: nil)
        let transformInput = UIElementTree<TransformedUIElement>(items: [
            .init(element: parentNode, subtree: childrenTree),
            .init(element: removedNode, subtree: hiddenTree)], focusedElement: parentNode)
        var transformTrace: [String] = []
        let transformedOutput = transformInput.transformed(using: [0, 1], in: &transformTrace) { rule, item, trace in
            let title = item.element.title!
            trace.append("\(rule):\(title)")
            if title == "remove" { return .removed }
            var changed = item
            if rule == 0 && title == "parent" {
                changed.element.title = "replacement"
                return .replaced(changed)
            }
            if rule == 0 && title == "replacement" {
                changed.element.title = "changed"
                return .transformed(changed)
            }
            return .unchanged
        }
        checkEqual(transformTrace, ["0:parent", "0:replacement", "1:changed", "0:child", "1:child", "0:remove"])
        checkEqual(transformedOutput.items.count, 1)
        checkEqual(transformedOutput.items[0].element.title, "changed")
        checkEqual(transformedOutput.items[0].children[0].element.title, "child")
        checkEqual(transformedOutput.focusedElement?.title, "parent")
        checkEqual(transformedOutput.items[0].subtree.focusedElement?.title, "child")
        checkEqual(transformInput.items.count, 2)
        var noRules = 0
        let unchangedTree = transformInput.transformed(using: [Int](), in: &noRules) { _, _, _ in unexpectedFailure() }
        checkEqual(unchangedTree.items.count, 2)
        checkEqual(unchangedTree.items[1].children[0].element.title, "hidden")
        let commonPipeline = UIElementTreeTransformation.defaultPipeline
        checkEqual(commonPipeline, [.associateTitleUIElements, .flattenIntoSelectableAncestor,
            .pruneNonDescriptiveSubtrees, .pruneEmptyDisabledElements, .mergeSingleItemGroups,
            .flattenRedundantHierarchy, .flattenRepetitiveStaticText, .flattenLinksIntoMarkdownText,
            .mergeTextOnlySiblings])
        checkEqual(MacUIElementTreeTransformation.defaultPipeline,
            [.filterActions] + commonPipeline.map(MacUIElementTreeTransformation.shared) + [
                .removeElementsUnderCalendarEvents, .retrieveAttributedTextFromTextAreas,
                .retrieveAttributedTextFromWebAreas])
        UIElementTreeTransformation.defaultPipeline = [.mergeTextOnlySiblings, .mergeTextOnlySiblings]
        checkEqual(MacUIElementTreeTransformation.defaultPipeline, [.filterActions,
            .shared(.mergeTextOnlySiblings), .shared(.mergeTextOnlySiblings),
            .removeElementsUnderCalendarEvents, .retrieveAttributedTextFromTextAreas,
            .retrieveAttributedTextFromWebAreas])
        UIElementTreeTransformation.defaultPipeline = commonPipeline
        // Item description traverses all descendants, trims each string, and
        // preserves duplicates/order. An image descendant alone does not count.
        var textRoot = capturedOwner
        textRoot.role = .group
        textRoot.title = nil
        textRoot.description = "  \n "
        textRoot.value = nil
        textRoot.placeholderValue = nil
        var textChild = textRoot
        textChild.title = " child "
        var textGrandchild = textRoot
        textGrandchild.title = "\n grandchild\t"
        let grandchildTree = UIElementTree<TransformedUIElement>(items: [
            .init(element: textGrandchild, subtree: transformedLeaf)], focusedElement: nil)
        let descriptionTree = UIElementTree<TransformedUIElement>(items: [
            .init(element: textChild, subtree: grandchildTree),
            .init(element: textChild, subtree: transformedLeaf)], focusedElement: nil)
        let descriptionItem = UIElementTree<TransformedUIElement>.Item(
            element: textRoot, subtree: descriptionTree)
        checkEqual(descriptionItem.flattenedString { $0.title }, "child\ngrandchild\nchild")
        checkTrue(descriptionItem.hasDescriptiveAttributes)
        checkTrue(textRoot.hasDescriptiveAttributes)
        checkTrue(!UIElementTree<TransformedUIElement>.Item(
            element: textRoot, subtree: transformedLeaf).hasDescriptiveAttributes)
        var imageNode = textRoot
        imageNode.role = .image
        let imageTree = UIElementTree<TransformedUIElement>(items: [
            .init(element: imageNode, subtree: transformedLeaf)], focusedElement: nil)
        checkTrue(!UIElementTree<TransformedUIElement>.Item(
            element: textRoot, subtree: imageTree).hasDescriptiveAttributes)
        checkTrue(UIElementTree<TransformedUIElement>.Item(
            element: imageNode, subtree: transformedLeaf).hasDescriptiveAttributes)
        for key in [\TransformedUIElement.description, \.value, \.title, \.placeholderValue] {
            var descriptiveNode = textRoot
            descriptiveNode[keyPath: key] = " content "
            checkTrue(UIElementTree<TransformedUIElement>.Item(
                element: descriptiveNode, subtree: transformedLeaf).hasDescriptiveAttributes)
        }
        var emptyDisabled = textRoot
        emptyDisabled.isEnabled = false
        emptyDisabled.isFocused = false
        emptyDisabled.isFocusable = false
        emptyDisabled.isSelectable = false
        emptyDisabled.actionDescriptions = []
        typealias PruneItem = UIElementTree<TransformedUIElement>.Item
        func removed(_ result: UIElementTreeTransformation.Result<TransformedUIElement>) -> Bool {
            switch result {
            case .removed: return true
            case .unchanged: return false
            default: unexpectedFailure("pruning must only remove or preserve")
            }
        }
        let emptyItem = PruneItem(element: emptyDisabled, subtree: transformedLeaf)
        checkTrue(removed(UIElementTreeTransformation.pruneEmptyDisabledElements(item: emptyItem)))
        checkTrue(removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: emptyItem)))
        // Unknown/unloaded children metadata is not a substitute for stored children.
        var subsetItem = emptyItem
        subsetItem.availableSubset = .init(count: 50, availableRanges: [])
        checkTrue(removed(UIElementTreeTransformation.pruneEmptyDisabledElements(item: subsetItem)))
        for key in [\TransformedUIElement.isEnabled, \.isFocused] {
            var preserved = emptyItem
            preserved.element[keyPath: key] = true
            checkTrue(!removed(UIElementTreeTransformation.pruneEmptyDisabledElements(item: preserved)))
            // Neither enabled nor focused alone protects a non-descriptive subtree.
            checkTrue(removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: preserved)))
        }
        for key in [\TransformedUIElement.isFocusable, \.isSelectable] {
            var interactive = emptyItem
            interactive.element[keyPath: key] = true
            checkTrue(!removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: interactive)))
            checkTrue(removed(UIElementTreeTransformation.pruneEmptyDisabledElements(item: interactive)))
            let nested = PruneItem(element: emptyDisabled, subtree: .init(items: [interactive], focusedElement: nil))
            checkTrue(!removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: nested)))
        }
        var actionItem = emptyItem
        actionItem.element.actionDescriptions = capturedOwner.actionDescriptions
        checkTrue(actionItem.element.hasInterestingActions)
        checkTrue(!removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: actionItem)))
        let actionParent = PruneItem(element: emptyDisabled, subtree: .init(items: [actionItem], focusedElement: nil))
        checkTrue(!removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: actionParent)))
        let emptyParent = PruneItem(element: emptyDisabled, subtree: .init(items: [emptyItem], focusedElement: nil))
        checkTrue(!removed(UIElementTreeTransformation.pruneEmptyDisabledElements(item: emptyParent)))
        checkTrue(removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: emptyParent)))
        checkTrue(!removed(UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: descriptionItem)))
        checkTrue(!removed(UIElementTreeTransformation.pruneEmptyDisabledElements(
            item: .init(element: imageNode, subtree: transformedLeaf))))
        // Run the concrete branches through the actual driver; a parent kept
        // before child pruning is not revisited after that child disappears.
        var pruneContext = 0
        let pruneInput = UIElementTree<TransformedUIElement>(items: [emptyParent, emptyItem], focusedElement: nil)
        let pruneOutput = pruneInput.transformed(using: [UIElementTreeTransformation.pruneEmptyDisabledElements],
            in: &pruneContext) { _, item, _ in
                UIElementTreeTransformation.pruneEmptyDisabledElements(item: item)
            }
        checkEqual(pruneOutput.items.count, 1)
        checkTrue(pruneOutput.items[0].children.isEmpty)
        checkEqual(pruneInput.items[0].children.count, 1)
        // Single-item grouping uses the node predicate, not item text, and
        // blocks replacement for any explicit child subset ranges (even []).
        var anonymousGroup = emptyDisabled
        anonymousGroup.description = nil
        let mergeChild = PruneItem(element: textChild, subtree: grandchildTree)
        let groupItem = PruneItem(element: anonymousGroup,
            subtree: .init(items: [mergeChild], focusedElement: textChild))
        func replacedChild(_ item: PruneItem) -> PruneItem? {
            switch UIElementTreeTransformation.mergeSingleItemGroups(item: item) {
            case .replaced(let child): return child
            case .unchanged, .removed: return nil
            default: unexpectedFailure("group rule must not return transformed")
            }
        }
        checkEqual(replacedChild(groupItem)?.element.title, " child ")
        checkEqual(replacedChild(groupItem)?.children.count, 1)
        for key in [\TransformedUIElement.isSelectable, \.isFocused] {
            var retained = groupItem
            retained.element[keyPath: key] = true
            checkTrue(replacedChild(retained) == nil)
        }
        var focusableGroup = groupItem
        focusableGroup.element.isFocusable = true
        checkTrue(replacedChild(focusableGroup) != nil)
        var whitespaceGroup = groupItem
        whitespaceGroup.element.description = " "
        checkTrue(replacedChild(whitespaceGroup) == nil)
        var nonGroup = groupItem
        nonGroup.element.role = .button
        checkTrue(replacedChild(nonGroup) == nil)
        var parentSubsetGroup = groupItem
        parentSubsetGroup.availableSubset = .init(count: 20, availableRanges: [])
        checkTrue(replacedChild(parentSubsetGroup) != nil)
        for ranges: [Range<Int>]? in [nil, [], [0..<1]] {
            var subsetGroup = groupItem
            subsetGroup.subtree.items[0].availableSubset = .init(count: 50, availableRanges: ranges)
            checkEqual(replacedChild(subsetGroup) != nil, ranges == nil)
        }
        let emptyGroup = PruneItem(element: anonymousGroup, subtree: transformedLeaf)
        checkTrue(removed(UIElementTreeTransformation.mergeSingleItemGroups(item: emptyGroup)))
        var multiGroup = groupItem
        multiGroup.subtree.items.append(mergeChild)
        checkTrue(!removed(UIElementTreeTransformation.mergeSingleItemGroups(item: multiGroup)))
        // Replacement restarts the pipeline, allowing a chain of anonymous
        // groups to collapse while preserving the surviving child's subtree.
        let outerGroup = PruneItem(element: anonymousGroup,
            subtree: .init(items: [groupItem], focusedElement: nil))
        let mergeInput = UIElementTree<TransformedUIElement>(items: [outerGroup], focusedElement: textChild)
        let mergeOutput = mergeInput.transformed(using: [UIElementTreeTransformation.mergeSingleItemGroups],
            in: &pruneContext) { _, item, _ in
                UIElementTreeTransformation.mergeSingleItemGroups(item: item)
            }
        checkEqual(mergeOutput.items.count, 1)
        checkEqual(mergeOutput.items[0].element.title, " child ")
        checkEqual(mergeOutput.items[0].children[0].element.title, "\n grandchild\t")
        checkEqual(mergeOutput.focusedElement?.title, " child ")
        enum HierarchyRenderFailure: Error { case expected }
        var hierarchyContext = ownerContext(.fullUIContext)
        var hierarchyCalls: [String] = []
        var redundantParent = anonymousGroup
        redundantParent.identifier = "parent"
        func namedGroup(_ name: String) -> TransformedUIElement {
            var node = anonymousGroup
            node.identifier = name
            return node
        }
        let nestedA = PruneItem(element: namedGroup("a"), subtree: grandchildTree)
        let nestedB = PruneItem(element: namedGroup("b"), subtree: .init(items: [mergeChild], focusedElement: nil))
        let redundantItem = PruneItem(element: redundantParent,
            subtree: .init(items: [nestedA, nestedB], focusedElement: textChild))
        let flattened = UIElementTreeTransformation.flattenRedundantHierarchy(
            item: redundantItem, context: &hierarchyContext) { node, _ in
                hierarchyCalls.append(node.identifier!)
                return "same"
            }
        guard case .transformed(let flattenedItem) = flattened else { unexpectedFailure() }
        checkEqual(hierarchyCalls, ["parent", "b", "a"])
        checkEqual(flattenedItem.children.map { $0.element.title }, ["\n grandchild\t", " child "])
        checkEqual(flattenedItem.subtree.focusedElement?.title, " child ")
        checkEqual(redundantItem.children.count, 2)
        hierarchyCalls = []
        let partialFlatten = UIElementTreeTransformation.flattenRedundantHierarchy(
            item: redundantItem, context: &hierarchyContext) { node, _ in
                hierarchyCalls.append(node.identifier!)
                if node.identifier == "b" { throw HierarchyRenderFailure.expected }
                return "same"
            }
        guard case .transformed(let partialItem) = partialFlatten else { unexpectedFailure() }
        checkEqual(hierarchyCalls, ["parent", "b", "a"])
        checkEqual(partialItem.children[1].element.identifier, "b")
        checkEqual(partialItem.children[0].element.title, "\n grandchild\t")
        var parentFailureCalls = 0
        let failedParent = UIElementTreeTransformation.flattenRedundantHierarchy(
            item: redundantItem, context: &hierarchyContext) { _, context in
                parentFailureCalls += 1
                context.urlShortener.configuration.totalLimit = 321
                throw HierarchyRenderFailure.expected
            }
        guard case .unchanged = failedParent else { unexpectedFailure() }
        checkEqual(parentFailureCalls, 1)
        checkEqual(hierarchyContext.urlShortener.configuration.totalLimit, 321)
        for key in [\TransformedUIElement.isSelectable, \.isFocused] {
            var blocked = redundantItem
            blocked.element[keyPath: key] = true
            let result = UIElementTreeTransformation.flattenRedundantHierarchy(
                item: blocked, context: &hierarchyContext) { _, _ in unexpectedFailure() }
            guard case .unchanged = result else { unexpectedFailure() }
        }
        var skipChildren = redundantItem
        skipChildren.subtree.items[0].element.role = .button
        skipChildren.subtree.items[1].availableSubset = .init(count: 1, availableRanges: [])
        hierarchyCalls = []
        let skipped = UIElementTreeTransformation.flattenRedundantHierarchy(
            item: skipChildren, context: &hierarchyContext) { node, _ in
                hierarchyCalls.append(node.identifier!)
                return "same"
            }
        guard case .transformed(let skippedItem) = skipped else { unexpectedFailure() }
        checkEqual(hierarchyCalls, ["parent"])
        checkEqual(skippedItem.children.count, 2)
        let differentText = UIElementTreeTransformation.flattenRedundantHierarchy(
            item: redundantItem, context: &hierarchyContext) { node, _ in node.identifier! }
        guard case .transformed(let differentItem) = differentText else { unexpectedFailure() }
        checkEqual(differentItem.children.count, 2)
        let noChildren = UIElementTreeTransformation.flattenRedundantHierarchy(
            item: emptyGroup, context: &hierarchyContext) { _, _ in "" }
        guard case .transformed(let emptyTransformed) = noChildren else { unexpectedFailure() }
        checkTrue(emptyTransformed.children.isEmpty)
        var repeatParent = anonymousGroup
        repeatParent.description = "prefix duplicate suffix"
        var repeatNode = anonymousGroup
        repeatNode.description = "  duplicate\n"
        var uniqueNode = anonymousGroup
        uniqueNode.description = "unique"
        let uniqueItem = PruneItem(element: uniqueNode, subtree: transformedLeaf)
        let repeatLeaf = PruneItem(element: repeatNode, subtree: .init(items: [uniqueItem], focusedElement: nil))
        let repeatNested = PruneItem(element: repeatNode, subtree: .init(items: [repeatLeaf], focusedElement: nil))
        let repetitionInput = PruneItem(element: repeatParent,
            subtree: .init(items: [repeatNested, uniqueItem, repeatLeaf], focusedElement: nil))
        let repetitionResult = UIElementTreeTransformation.flattenRepetitiveStaticText(item: repetitionInput)
        guard case .transformed(let repetitionOutput) = repetitionResult else { unexpectedFailure() }
        checkEqual(repetitionOutput.children.map { $0.element.description }, ["unique", "unique", "unique"])
        checkEqual(repetitionInput.children.count, 3)
        for key in [\TransformedUIElement.isFocusable, \.isSelectable] {
            var interactiveParent = repetitionInput
            interactiveParent.element[keyPath: key] = true
            guard case .unchanged = UIElementTreeTransformation.flattenRepetitiveStaticText(
                item: interactiveParent) else { unexpectedFailure() }
        }
        var interactiveDescendant = repetitionInput
        interactiveDescendant.subtree.items[0].subtree.items[0].element.role = .button
        guard case .unchanged = UIElementTreeTransformation.flattenRepetitiveStaticText(
            item: interactiveDescendant) else { unexpectedFailure() }
        var whitespaceRepeat = repetitionInput
        whitespaceRepeat.subtree.items = [.init(element: textRoot, subtree: transformedLeaf)]
        guard case .unchanged = UIElementTreeTransformation.flattenRepetitiveStaticText(
            item: whitespaceRepeat) else { unexpectedFailure() }
        // Parent value uses stringValue, whereas child value uses raw value.
        var valueParent = anonymousGroup
        valueParent.value = "prefix repeated suffix"
        var valueChild = anonymousGroup
        valueChild.value = " repeated "
        let valueRepeated = PruneItem(element: valueParent,
            subtree: .init(items: [.init(element: valueChild, subtree: transformedLeaf)], focusedElement: nil))
        checkEqual(valueParent.stringValue, valueParent.value)
        guard case .transformed(let valueFlattened) = UIElementTreeTransformation.flattenRepetitiveStaticText(
            item: valueRepeated) else { unexpectedFailure() }
        checkTrue(valueFlattened.children.isEmpty)
        var incompleteRepeat = repetitionInput
        incompleteRepeat.subtree.items[0].availableSubset = .init(count: 20, availableRanges: [])
        guard case .transformed = UIElementTreeTransformation.flattenRepetitiveStaticText(
            item: incompleteRepeat) else { unexpectedFailure() }
        guard case .unchanged = UIElementTreeTransformation.flattenRepetitiveStaticText(
            item: emptyGroup) else { unexpectedFailure() }
        let identityChildren = PruneItem(element: capturedOwner, subtree: .init(items: [
            .init(element: otherIdentityOwner, subtree: transformedLeaf),
            .init(element: capturedOwner, subtree: transformedLeaf),
            .init(element: mutableOwner, subtree: transformedLeaf)], focusedElement: nil))
        checkEqual(identityChildren.firstChildIndex(matching: capturedOwner.id), 1)
        checkEqual(identityChildren.firstChildIndex(matching: otherIdentityOwner.id), 0)
        let deepIdentity = PruneItem(element: capturedOwner, subtree: .init(items: [
            .init(element: otherIdentityOwner, subtree: .init(items: [
                .init(element: capturedOwner, subtree: transformedLeaf)], focusedElement: nil))], focusedElement: nil))
        checkTrue(deepIdentity.firstChildIndex(matching: capturedOwner.id) == nil)
        checkTrue(emptyItem.firstChildIndex(matching: capturedOwner.id) == nil)
        // Title association accepts exactly one present field, rather than
        // choosing a fallback priority or deduplicating equal strings.
        for mask in 0..<8 {
            var candidate = anonymousGroup
            candidate.value = mask & 1 == 0 ? nil : "value"
            candidate.title = mask & 2 == 0 ? nil : "title"
            candidate.description = mask & 4 == 0 ? nil : "description"
            let expected: String?
            switch mask {
            case 1: expected = "value"
            case 2: expected = "title"
            case 4: expected = "description"
            default: expected = nil
            }
            checkEqual(soleTitleAssociationText(candidate), expected)
        }
        var emptyTitleCandidate = anonymousGroup
        emptyTitleCandidate.title = ""
        checkEqual(soleTitleAssociationText(emptyTitleCandidate), "")
        emptyTitleCandidate.title = "  \n "
        checkEqual(soleTitleAssociationText(emptyTitleCandidate), "  \n ")
        emptyTitleCandidate.title = "same"
        emptyTitleCandidate.value = "same"
        checkTrue(soleTitleAssociationText(emptyTitleCandidate) == nil)
        // A present provider returning nil is distinct from no provider.
        var providerLookups = 0
        let titleTargets = identityChildren.children
        checkFalse(titleAssociationTargetLacksTitle(identity: capturedOwner.id, in: titleTargets))
        checkTrue(titleAssociationTargetLacksTitle(identity: capturedOwner.id, in: titleTargets,
            providerTitle: { identity in
                providerLookups += 1
                checkTrue(CFEqual(identity, capturedOwner.id))
                return nil
            }))
        checkEqual(providerLookups, 1)
        for providedTitle in ["", " ", "existing"] {
            checkFalse(titleAssociationTargetLacksTitle(identity: capturedOwner.id, in: [PruneItem](),
                providerTitle: { _ in providedTitle }))
        }
        checkTrue(titleAssociationTargetLacksTitle(identity: capturedOwner.id, in: [PruneItem]()))
        var untitledTarget = capturedOwner
        untitledTarget.title = nil
        let duplicateTargets = [PruneItem(element: untitledTarget, subtree: transformedLeaf),
            PruneItem(element: capturedOwner, subtree: transformedLeaf)]
        checkTrue(titleAssociationTargetLacksTitle(identity: capturedOwner.id, in: duplicateTargets))
        checkFalse(titleAssociationTargetLacksTitle(identity: capturedOwner.id, in: Array(duplicateTargets.reversed())))
        var emptyExistingTitle = untitledTarget
        emptyExistingTitle.title = ""
        checkFalse(titleAssociationTargetLacksTitle(identity: capturedOwner.id,
            in: [PruneItem(element: emptyExistingTitle, subtree: transformedLeaf)]))
        // Title association: captured order, duplicate targets, relocation and callbacks.
        func associationNode(_ ax: AXUIElement, _ targets: [AXUIElement], title: String? = nil) -> TransformedUIElement {
            var node = anonymousGroup
            node.title = title; node.value = nil; node.description = nil
            node.element = UIElement(axElement: ax, cache: UIElementCache(
                supportedAttributes: [titleLinks], attributes: [titleLinks: partial(targets as NSArray)],
                transactionAttributes: nil))
            return node
        }
        let associationA = AXUIElementCreateApplication(13201)
        let associationB = AXUIElementCreateApplication(13202)
        let associationLabel = AXUIElementCreateApplication(13203)
        let associationMissing = AXUIElementCreateApplication(13204)
        func associationItem(_ node: TransformedUIElement, children: [PruneItem] = []) -> PruneItem {
            .init(element: node, subtree: .init(items: children, focusedElement: nil))
        }
        let targetA = associationItem(associationNode(associationA, []))
        let targetB = associationItem(associationNode(associationB, []))
        for labelFirst in [true, false] {
            let label = associationItem(associationNode(associationLabel, [associationA, associationA], title: ""))
            let parent = associationItem(anonymousGroup, children: labelFirst ? [label, targetA] : [targetA, label])
            var context = ownerContext(.fullUIContext)
            switch UIElementTreeTransformation.associateTitleUIElements(item: parent, context: &context) {
            case .transformed(let result):
                checkEqual(result.children.count, 1)
                checkTrue(CFEqual(result.children[0].element.id, associationA))
                checkEqual(result.children[0].element.title, "")
            default: unexpectedFailure("title association did not assign/remove label")
            }
        }
        let multiLabel = associationItem(associationNode(associationLabel, [associationB, associationA, associationB], title: "Group"))
        let multiParent = associationItem(anonymousGroup, children: [targetA, multiLabel, targetB])
        var associationContext = ownerContext(.fullUIContext)
        switch UIElementTreeTransformation.associateTitleUIElements(item: multiParent, context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.children.count, 1)
            checkTrue(CFEqual(result.children[0].element.id, associationLabel))
            checkEqual(result.children[0].children.count, 2)
            checkTrue(CFEqual(result.children[0].children[0].element.id, associationB))
            checkTrue(CFEqual(result.children[0].children[1].element.id, associationA))
        default: unexpectedFailure("title association did not relocate targets")
        }
        var rebuildIDs: [AXUIElement] = []
        switch UIElementTreeTransformation.associateTitleUIElements(item: multiParent, context: &associationContext,
            rebuild: { tree, child, _ in
                rebuildIDs.append(child.element.id)
                tree.items.insert(child, at: 0)
            }) {
        case .transformed(let result):
            checkEqual(rebuildIDs.count, 2)
            checkTrue(CFEqual(rebuildIDs[0], associationB))
            checkTrue(CFEqual(rebuildIDs[1], associationA))
            checkEqual(result.children[0].children.count, 2)
            checkTrue(CFEqual(result.children[0].children[0].element.id, associationA))
        default: unexpectedFailure("title association omitted rebuild callback")
        }
        for label in [
            associationItem(associationNode(associationLabel, [associationA, associationMissing])),
            associationItem(associationNode(associationLabel, [associationA, associationB]), children: [targetA])
        ] {
            let parent = associationItem(anonymousGroup, children: [targetA, label, targetB])
            switch UIElementTreeTransformation.associateTitleUIElements(item: parent, context: &associationContext) {
            case .unchanged: break
            default: unexpectedFailure("incomplete target set or nonempty label must remain unchanged")
            }
        }

        var selectableRoot = anonymousGroup
        selectableRoot.isSelectable = true
        selectableRoot.isFocusable = true
        selectableRoot.title = " root "
        selectableRoot.description = " root description "
        selectableRoot.value = " root value "
        var plainChild = associationNode(associationA, [], title: " child ")
        plainChild.description = " child description "
        plainChild.value = " child value "
        var boolChild = associationNode(associationB, [], title: " boolean ")
        boolChild.value = "false"
        boolChild.element = UIElement(axElement: associationB, cache: UIElementCache(
            supportedAttributes: [], attributes: [UIElementAttribute("AXValue"): partial(kCFBooleanFalse)],
            transactionAttributes: nil))
        let selectableItem = associationItem(selectableRoot, children: [
            associationItem(plainChild, children: [associationItem(boolChild)])
        ])
        switch UIElementTreeTransformation.flattenIntoSelectableAncestor(item: selectableItem, context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.element.title, "root\nchild\nboolean")
            checkEqual(result.element.description, "root description\nchild description")
            checkEqual(result.element.value, "root value\nchild value")
            checkFalse(result.element.isFocusable) // replaces own true, uses descendants only
            checkEqual(result.children.count, 1)
            checkTrue(CFEqual(result.children[0].element.id, associationB))
            checkEqual(result.children[0].element.boolValue, false) // false is retained too
        default: unexpectedFailure("selectable ancestor did not flatten text and preserve Boolean item")
        }
        for guardIndex in 0..<6 {
            var root = selectableRoot
            var child = plainChild
            if guardIndex == 0 { root.isSelectable = false }
            if guardIndex == 1 { root.isFocused = true }
            if guardIndex == 2 { root.role = .table }
            if guardIndex == 3 { root.subrole = "AXTableRow" }
            if guardIndex == 4 { child.isValueSettable = true }
            if guardIndex == 5 { child.isSelectable = true }
            let parent = associationItem(root, children: [associationItem(anonymousGroup, children: [associationItem(child)])])
            switch UIElementTreeTransformation.flattenIntoSelectableAncestor(item: parent, context: &associationContext) {
            case .unchanged: break
            default: unexpectedFailure("selectable ancestor guard was ignored")
            }
        }
        var focusableChild = plainChild
        focusableChild.isFocusable = true
        var booleanCallbacks = 0
        let callbackParent = associationItem(selectableRoot, children: [associationItem(focusableChild), associationItem(boolChild)])
        switch UIElementTreeTransformation.flattenIntoSelectableAncestor(item: callbackParent, context: &associationContext,
            rebuild: { tree, child, _ in
                checkTrue(tree.items.isEmpty)
                checkTrue(CFEqual(child.element.id, associationB))
                booleanCallbacks += 1
                // The callback owns insertion; the rule must not append again.
            }) {
        case .transformed(let result):
            checkTrue(result.element.isFocusable)
            checkTrue(result.children.isEmpty)
            checkEqual(booleanCallbacks, 1)
        default: unexpectedFailure("selectable ancestor rebuild was not invoked")
        }
        // Filtering the traversal retains full items; a nested Boolean is
        // present both within its retained parent and as its own retained item.
        var nestedBool = boolChild
        nestedBool.element = UIElement(axElement: associationLabel, cache: UIElementCache(
            supportedAttributes: [], attributes: [UIElementAttribute("AXValue"): partial(kCFBooleanTrue)],
            transactionAttributes: nil))
        let booleanParent = associationItem(selectableRoot, children: [
            associationItem(boolChild, children: [associationItem(nestedBool)])
        ])
        switch UIElementTreeTransformation.flattenIntoSelectableAncestor(item: booleanParent, context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.children.count, 2)
            checkTrue(CFEqual(result.children[0].element.id, associationB))
            checkTrue(CFEqual(result.children[1].element.id, associationLabel))
            checkEqual(result.children[0].children.count, 1)
            checkEqual(result.children[1].element.boolValue, true)
        default: unexpectedFailure("Boolean traversal must preserve full captured items")
        }
        var emptySelectable = anonymousGroup
        emptySelectable.isSelectable = true
        switch UIElementTreeTransformation.flattenIntoSelectableAncestor(item: associationItem(emptySelectable), context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.element.title, "")
            checkEqual(result.element.description, "")
            checkEqual(result.element.value, "")
        default: unexpectedFailure("selectable leaf should still transform")
        }

        var linkNode = associationNode(associationA, [], title: "Keep title")
        linkNode.role = .link
        linkNode.roleDescription = "Original role"
        linkNode.description = "Keep description"
        linkNode.url = renderURL
        linkNode.isFocused = true
        linkNode.isFocusable = true
        let linkItem = associationItem(linkNode, children: [targetA])
        var linkContext = RenderingContext()
        switch UIElementTreeTransformation.flattenLinksIntoMarkdownText(item: linkItem, context: &linkContext) {
        case .transformed(let result):
            checkEqual(result.element.role, .staticText)
            checkEqual(result.element.roleDescription, "link")
            checkEqual(result.element.title, "Keep title")
            checkEqual(result.element.description, "Keep description")
            checkTrue(result.element.isFocused)
            checkTrue(result.element.isFocusable)
            checkTrue(result.element.url == nil)
            checkTrue(result.children.isEmpty)
            checkTrue(result.element.value?.contains("query=one") == true)
            checkFalse(result.element.value?.contains("Keep title") == true)
            checkEqual(result.element.value, result.element.transformedString?.description)
            var text = result.element.transformedString!
            linkContext.urlShortener.configuration.includeQuery = false
            checkTrue(text.trimURLs(context: &linkContext)) // URL span retained, not plain text
            checkFalse(text.description.contains("query=one"))
        default: unexpectedFailure("link URL was not transformed")
        }
        for variant in 0..<2 {
            var node = linkNode
            if variant == 0 { node.role = .button }
            else { node.url = nil }
            switch UIElementTreeTransformation.flattenLinksIntoMarkdownText(item: associationItem(node), context: &linkContext) {
            case .unchanged: break
            default: unexpectedFailure("non-link or missing URL should not transform")
            }
        }

        var hiddenLink = linkNode
        hiddenLink.url = URL(string: "data:text/plain,fixture")!
        switch UIElementTreeTransformation.flattenLinksIntoMarkdownText(
            item: associationItem(hiddenLink, children: [targetA]), context: &linkContext) {
        case .unchanged: break
        default: unexpectedFailure("empty rendered URL must not erase the original link subtree")
        }

        var siblingTextNode = associationNode(associationA, [], title: "Not a fallback")
        siblingTextNode.role = .staticText
        siblingTextNode.isFocusable = true
        siblingTextNode.isSelectable = true
        siblingTextNode.value = "  plain\ntext  "
        siblingTextNode.transformedString = TransformedUIString("Ignored previous transform")
        for type in UIElementContextType.allCases {
            var context = ownerContext(type)
            let candidate = siblingMergeText(element: siblingTextNode, context: &context)
            checkEqual(candidate?.text.description, "  plain\ntext  ")
            checkEqual(candidate?.role, .staticText)
        }
        siblingTextNode.value = ""
        checkEqual(siblingMergeText(element: siblingTextNode, context: &associationContext)?.text.description, "")
        siblingTextNode.value = nil
        checkTrue(siblingMergeText(element: siblingTextNode, context: &associationContext) == nil)
        siblingTextNode.value = "false"
        siblingTextNode.element = boolChild.element
        checkTrue(siblingMergeText(element: siblingTextNode, context: &associationContext) == nil)
        var siblingLink = linkNode
        siblingLink.value = "[Label]"
        for type in [UIElementContextType.fullUIContext, .eventStreamContext] {
            var context = ownerContext(type)
            checkTrue(siblingMergeText(element: siblingLink, context: &context) == nil)
        }
        var informativeContext = ownerContext(.informationalContext)
        informativeContext.urlShortener.configuration = .init(individualLimit: nil, totalLimit: nil,
            includeQuery: true, includeFragment: true, baseHost: nil)
        let informativeLink = siblingMergeText(element: siblingLink, context: &informativeContext)
        checkEqual(informativeLink?.role, .link)
        checkTrue(informativeLink?.text.description.hasPrefix("[\\[Label\\]](") == true)
        checkTrue(informativeLink?.text.description.contains("query=one") == true)
        siblingLink.url = nil
        let missingLink = siblingMergeText(element: siblingLink, context: &informativeContext)
        checkEqual(missingLink?.text.description, "")
        checkEqual(missingLink?.role, .link)
        siblingLink.role = .button
        checkTrue(siblingMergeText(element: siblingLink, context: &informativeContext) == nil)

        func mergeTextNode(_ ax: AXUIElement, _ value: String) -> PruneItem {
            var node = associationNode(ax, [], title: "Keep first title")
            node.role = .staticText; node.value = value
            return associationItem(node, children: [targetA])
        }
        let mergeA = mergeTextNode(associationA, " A ")
        let mergeB = mergeTextNode(associationB, " B ")
        let mergeBlank = mergeTextNode(associationLabel, " \n\t")
        var mergeBarrier = associationNode(associationMissing, [])
        mergeBarrier.role = .button
        let mergeParent = associationItem(anonymousGroup, children: [
            mergeA, mergeBlank, mergeB, associationItem(mergeBarrier), mergeB, mergeA
        ])
        switch UIElementTreeTransformation.mergeTextOnlySiblings(item: mergeParent, context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.children.count, 3)
            checkEqual(result.children[0].element.value, " A   B ")
            checkEqual(result.children[2].element.value, " B   A ")
            checkTrue(CFEqual(result.children[0].element.id, associationA))
            checkTrue(CFEqual(result.children[1].element.id, associationMissing))
            checkTrue(CFEqual(result.children[2].element.id, associationB))
            checkEqual(result.children[0].element.roleDescription, "text")
            checkEqual(result.children[0].element.title, "Keep first title")
            checkTrue(result.children[0].children.isEmpty)
            checkEqual(result.children[0].element.transformedString?.description, " A   B ")
        default: unexpectedFailure("sibling ranges were not merged in reverse order")
        }
        for flag in 0..<2 {
            var blocked = mergeParent
            if flag == 0 { blocked.element.isSelectable = true }
            else { blocked.element.isFocusable = true }
            switch UIElementTreeTransformation.mergeTextOnlySiblings(item: blocked, context: &associationContext) {
            case .unchanged: break
            default: unexpectedFailure("interactive parent must reject sibling merge")
            }
        }
        switch UIElementTreeTransformation.mergeTextOnlySiblings(item: associationItem(anonymousGroup, children: [mergeA]), context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.children.count, 1)
            checkEqual(result.children[0].children.count, 1) // singleton is not rewritten
        default: unexpectedFailure("singleton candidate must yield transformed")
        }
        switch UIElementTreeTransformation.mergeTextOnlySiblings(item: associationItem(anonymousGroup, children: [associationItem(mergeBarrier)]), context: &associationContext) {
        case .unchanged: break
        default: unexpectedFailure("no candidate must yield unchanged")
        }
        switch UIElementTreeTransformation.mergeTextOnlySiblings(item: associationItem(anonymousGroup, children: [mergeBlank, mergeBlank]), context: &associationContext) {
        case .transformed(let result):
            checkEqual(result.children.count, 1)
            checkEqual(result.children[0].element.value, "")
        default: unexpectedFailure("whitespace run must merge to empty text")
        }
        var realLink = linkNode
        realLink.value = "Link label"
        let linkLeadingRun = associationItem(anonymousGroup, children: [associationItem(realLink), mergeA])
        switch UIElementTreeTransformation.mergeTextOnlySiblings(item: linkLeadingRun, context: &informativeContext) {
        case .transformed(let result): checkEqual(result.children.count, 2) // link has no flattenedRole
        default: unexpectedFailure("descriptorless run must still yield transformed")
        }
        let textLeadingRun = associationItem(anonymousGroup, children: [mergeA, associationItem(realLink)])
        switch UIElementTreeTransformation.mergeTextOnlySiblings(item: textLeadingRun, context: &informativeContext) {
        case .transformed(let result):
            checkEqual(result.children.count, 1)
            checkTrue(result.children[0].element.value?.contains("[Link label](") == true)
        default: unexpectedFailure("mixed-role candidate run should merge when first descriptor exists")
        }

        var pipelineRoot = associationNode(associationMissing, [], title: "Parent")
        pipelineRoot.isEnabled = true
        let pipelineTree = UIElementTree<TransformedUIElement>(items: [
            associationItem(pipelineRoot, children: [mergeA, mergeB])
        ], focusedElement: pipelineRoot)
        var pipelineContext = ownerContext(.fullUIContext)
        var dispatched: Set<UIElementTreeTransformation> = []
        let pipelineResult = pipelineTree.transformed(using: UIElementTreeTransformation.defaultPipeline, in: &pipelineContext) {
            rule, item, context in
            dispatched.insert(rule)
            return rule.transform(item: item, context: &context, render: { node, _ in node.title ?? node.value ?? "" })
        }
        checkEqual(dispatched.count, 9)
        checkEqual(pipelineResult.items.count, 1)
        checkEqual(pipelineResult.items[0].children.count, 1)
        checkEqual(pipelineResult.items[0].children[0].element.value, " A   B ")
        checkTrue(CFEqual(pipelineResult.items[0].children[0].element.id, associationA))
        checkTrue(CFEqual(pipelineResult.focusedElement!.id, associationMissing))

        // Native action filtering: exact conditional removals and lazy reads.
        var filterRole = UIElementRole.button
        var filterSettable = false
        var roleReads = 0
        var settableReads = 0
        var scrollReads: [String] = []
        var hasScrollElement = false
        func keepAction(_ action: UIElementAction, catalyst: Bool = false) -> Bool {
            macUIElementKeepsAction(action, isCatalyst: catalyst,
                role: { roleReads += 1; return filterRole },
                isValueSettable: { settableReads += 1; return filterSettable },
                readElement: { attribute in
                    scrollReads.append(attribute.name as String)
                    return hasScrollElement ? capturedOwner.element : nil
                })
        }
        checkFalse(keepAction(.showAlternateUI))
        checkFalse(keepAction(.showDefaultUI))
        checkFalse(keepAction(.cancel, catalyst: true))
        checkEqual(roleReads, 0)
        checkEqual(settableReads, 0)
        checkTrue(scrollReads.isEmpty)
        filterRole = UIElementRole("AXMenuBar")
        checkFalse(keepAction(.cancel))
        checkEqual(roleReads, 1)
        filterRole = .menuItem
        checkFalse(keepAction(.cancel))
        checkEqual(roleReads, 3) // two ordered role getter calls
        checkFalse(keepAction(.pick))
        filterRole = .button
        checkTrue(keepAction(.cancel))
        checkTrue(keepAction(.pick))
        filterRole = .textField
        checkFalse(keepAction(.confirm))
        filterRole = .textArea
        checkTrue(keepAction(.confirm))
        for action in [UIElementAction.increment, .decrement] {
            filterSettable = false
            checkTrue(keepAction(action))
            filterSettable = true
            checkFalse(keepAction(action))
        }
        for action in [UIElementAction.scrollLeftByPage, .scrollRightByPage, .scrollUpByPage, .scrollDownByPage] {
            hasScrollElement = false
            checkFalse(keepAction(action))
            hasScrollElement = true
            checkTrue(keepAction(action))
        }
        checkEqual(scrollReads, Array(repeating: "AXHorizontalScrollBar", count: 4) +
            Array(repeating: "AXVerticalScrollBar", count: 4))
        let priorReads = (roleReads, settableReads, scrollReads.count)
        checkTrue(keepAction(.press))
        checkTrue(keepAction(UIElementAction("AXCustomAction")))
        checkEqual(roleReads, priorReads.0)
        checkEqual(settableReads, priorReads.1)
        checkEqual(scrollReads.count, priorReads.2)
        var filterNode = anonymousGroup
        filterNode.actionDescriptions = [
            UIElementActionDescription(.press, description: "First"),
            UIElementActionDescription(.showDefaultUI, description: "Hidden"),
            UIElementActionDescription(.press, description: "Duplicate"),
        ]
        let filterItem = associationItem(filterNode, children: [targetA])
        for type in [UIElementContextType.eventStreamContext, .informationalContext] {
            switch MacUIElementTreeTransformation.filterActions(item: filterItem, context: ownerContext(type),
                readElement: { _ in unexpectedFailure("non-full context must not read attributes") }) {
            case .unchanged: break
            default: unexpectedFailure("non-full context should bypass action filtering")
            }
        }
        switch MacUIElementTreeTransformation.filterActions(item: filterItem, context: ownerContext(.fullUIContext),
            readElement: { _ in unexpectedFailure("these actions must not read attributes") }) {
        case let .transformed(result):
            checkEqual(result.element.actionDescriptions.map(\.description), ["First", "Duplicate"])
            checkTrue(CFEqual(result.element.id, filterItem.element.id))
            checkEqual(result.children.count, 1)
        default: unexpectedFailure("full context must return transformed")
        }
        filterNode.actionDescriptions = []
        switch MacUIElementTreeTransformation.filterActions(item: associationItem(filterNode),
            context: ownerContext(.fullUIContext), readElement: { _ in nil }) {
        case let .transformed(result): checkTrue(result.element.actionDescriptions.isEmpty)
        default: unexpectedFailure("empty actions still produce transformed")
        }

        // Mac's non-full leaf override differs from the common rule.
        var macLeaf = anonymousGroup
        macLeaf.isSelected = false
        macLeaf.isDisclosing = false
        macLeaf.actionDescriptions = [UIElementActionDescription(.showMenu, description: "Menu")]
        macLeaf.isFocusable = true
        for type in [UIElementContextType.eventStreamContext, .informationalContext] {
            switch MacUIElementTreeTransformation.pruneNonDescriptiveSubtrees(
                item: associationItem(macLeaf), context: ownerContext(type)) {
            case .removed: break
            default: unexpectedFailure("inactive non-full leaf must be removed despite actions/focusability")
            }
        }
        switch MacUIElementTreeTransformation.pruneNonDescriptiveSubtrees(
            item: associationItem(macLeaf), context: ownerContext(.fullUIContext)) {
        case .unchanged: break
        default: unexpectedFailure("full context must retain common focusable leaf behavior")
        }
        for field in [\TransformedUIElement.isFocused, \TransformedUIElement.isSelected, \TransformedUIElement.isDisclosing] {
            var active = macLeaf
            active[keyPath: field] = true
            switch MacUIElementTreeTransformation.pruneNonDescriptiveSubtrees(
                item: associationItem(active), context: ownerContext(.informationalContext)) {
            case .unchanged: break
            default: unexpectedFailure("active leaf must reach common rule")
            }
        }
        var describedLeaf = macLeaf
        describedLeaf.title = "Descriptive"
        for item in [associationItem(describedLeaf), associationItem(macLeaf, children: [targetA])] {
            switch MacUIElementTreeTransformation.pruneNonDescriptiveSubtrees(
                item: item, context: ownerContext(.informationalContext)) {
            case .unchanged: break
            default: unexpectedFailure("descriptive or non-leaf node must reach common rule")
            }
        }
        // A focused flag alone bypasses the Mac override, not common pruning.
        var focusedOnly = anonymousGroup
        focusedOnly.isFocused = true
        switch MacUIElementTreeTransformation.pruneNonDescriptiveSubtrees(
            item: associationItem(focusedOnly), context: ownerContext(.informationalContext)) {
        case .removed: break
        default: unexpectedFailure("bypassing Mac override is not an unconditional retain")
        }
        var calendarNode = anonymousGroup
        calendarNode.role = .staticText
        calendarNode.roleDescription = "Event"
        calendarNode.value = "Calendar event"
        var calendarChild = anonymousGroup
        calendarChild.role = .staticText
        let calendarItem = associationItem(calendarNode, children: [associationItem(calendarChild, children: [targetA])])
        var bundleReads = 0
        func calendarResult(_ item: PruneItem, _ bundle: String?) -> UIElementTreeTransformation.Result<TransformedUIElement> {
            MacUIElementTreeTransformation.removeElementsUnderCalendarEvents(item: item,
                owningBundleIdentifier: { bundleReads += 1; return bundle })
        }
        switch calendarResult(calendarItem, "com.apple.iCal") {
        case let .transformed(result):
            checkTrue(result.children.isEmpty)
            checkEqual(result.element.value, "Calendar event")
            checkEqual(result.element.roleDescription, "Event")
            checkTrue(CFEqual(result.element.id, calendarItem.element.id))
        default: unexpectedFailure("Calendar Event child must be removed")
        }
        for bundle in [nil, "com.apple.Calendar", "com.apple.ical", "com.example.calendar"] as [String?] {
            switch calendarResult(calendarItem, bundle) {
            case .unchanged: break
            default: unexpectedFailure("only original Calendar bundle identity should match")
            }
        }
        let bundleReadsBeforeGuards = bundleReads
        var nonEvent = calendarNode
        nonEvent.roleDescription = "event"
        var wrongRole = calendarNode
        wrongRole.role = .group
        for item in [associationItem(nonEvent, children: calendarItem.children),
            associationItem(wrongRole, children: calendarItem.children), associationItem(calendarNode),
            associationItem(calendarNode, children: [targetA]),
            associationItem(calendarNode, children: calendarItem.children + calendarItem.children)] {
            switch calendarResult(item, "com.apple.iCal") {
            case .unchanged: break
            default: unexpectedFailure("Calendar structural guard should bypass")
            }
        }
        checkEqual(bundleReads, bundleReadsBeforeGuards)

        var richNode = anonymousGroup
        richNode.role = .textArea
        richNode.value = "Original"
        richNode.truncationRange = nil
        let richText = NSAttributedString(string: "Rich input")
        var richContext = ownerContext(.fullUIContext)
        var richCalls: [String] = []
        var textualContent: String? = nil
        var richAvailable = true
        var richThrows = false
        var rangesRead: [NSRange] = []
        func richResult(_ node: TransformedUIElement) -> UIElementTreeTransformation.Result<TransformedUIElement> {
            MacUIElementTreeTransformation.retrieveAttributedTextFromTextAreas(
                item: associationItem(node, children: [targetA]), context: &richContext,
                readTextualContent: { richCalls.append("content"); return textualContent },
                readFullText: {
                    richCalls.append("full")
                    if richThrows { throw NSError(domain: "fixture", code: 1) }
                    return richAvailable ? richText : nil
                }, readRange: { range in
                    richCalls.append("range"); rangesRead.append(range)
                    if richThrows { throw NSError(domain: "fixture", code: 2) }
                    return richAvailable ? richText : nil
                }, render: { value, context in
                    richCalls.append("render")
                    checkTrue(value === richText)
                    context.isWebShaped = true
                    return TransformedUIString(stringLiteral: "Formatted")
                })
        }
        func richUnchanged(_ node: TransformedUIElement, calls: [String]) {
            richCalls = []
            switch richResult(node) {
            case .unchanged: break
            default: unexpectedFailure("rich-text guard/failure should preserve input")
            }
            checkEqual(richCalls, calls)
        }
        var notTextArea = richNode
        notTextArea.role = .textField
        richUnchanged(notTextArea, calls: [])
        textualContent = "AXTextualContextSourceCode"
        richUnchanged(richNode, calls: ["content"])
        textualContent = nil
        var noRichValue = richNode
        noRichValue.value = nil
        richUnchanged(noRichValue, calls: ["content"])
        richAvailable = false
        richUnchanged(richNode, calls: ["content", "full"])
        richAvailable = true
        richThrows = true
        richUnchanged(richNode, calls: ["content", "full"])
        richThrows = false
        for range in [nil, NSRange(location: 3, length: 7), NSRange(location: NSNotFound, length: 0)] as [NSRange?] {
            var node = richNode
            node.truncationRange = range
            node.value = "" // present empty value is eligible
            richCalls = []
            switch richResult(node) {
            case let .transformed(result):
                checkTrue(result.element.attributedString === richText)
                checkEqual(result.element.value, "Formatted")
                checkEqual(result.element.transformedString?.description, "Formatted")
                checkEqual(result.children.count, 1)
                checkEqual(result.element.truncationRange, range)
                checkTrue(richContext.isWebShaped)
            default: unexpectedFailure("rich-text success should transform")
            }
            checkEqual(richCalls, ["content", range == nil ? "full" : "range", "render"])
        }
        checkEqual(rangesRead, [NSRange(location: 3, length: 7), NSRange(location: -1, length: 0)])
        richNode.truncationRange = NSRange(location: 1, length: 2)
        richThrows = true
        richUnchanged(richNode, calls: ["content", "range"])

        // Opaque local marker fixtures: no live document positions or AX reads.
        func webMarker(_ bytes: [UInt8]) -> UITextMarker {
            UITextMarker(marker: bytes.withUnsafeBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) })
        }
        let webStart = webMarker([1, 2, 3]), webEnd = webMarker([4, 5, 6])
        var webNode = anonymousGroup
        webNode.role = .webArea
        webNode.value = nil // unlike text areas, captured value is not required
        var webContext = ownerContext(.informationalContext)
        var webCalls: [String] = []
        var webChrome = false, webMissingStart = false, webMissingEnd = false
        var webNextPresent = false, webNextThrows = false, webReadThrows = false, webReadNil = false
        func webResult() -> UIElementTreeTransformation.Result<TransformedUIElement> {
            MacUIElementTreeTransformation.retrieveAttributedTextFromWebAreas(
                item: associationItem(webNode, children: [targetA]), context: &webContext,
                supportsChromeNodeID: { webCalls.append("support"); return webChrome },
                readStartMarker: { webCalls.append("start"); return webMissingStart ? nil : webStart },
                readEndMarker: { webCalls.append("end"); return webMissingEnd ? nil : webEnd },
                nextLineEnd: { marker in
                    webCalls.append("next")
                    checkTrue(CFEqual(marker.marker, webEnd.marker))
                    if webNextThrows { throw NSError(domain: "fixture", code: 3) }
                    return webNextPresent ? webStart : nil
                }, reportUnexpectedNextLine: { webCalls.append("diagnostic") },
                readRange: { range in
                    webCalls.append("range")
                    checkTrue(CFEqual(AXTextMarkerRangeCopyStartMarker(range.range), webStart.marker))
                    checkTrue(CFEqual(AXTextMarkerRangeCopyEndMarker(range.range), webEnd.marker))
                    if webReadThrows { throw NSError(domain: "fixture", code: 4) }
                    return webReadNil ? nil : richText
                }, render: { value, context in
                    webCalls.append("render"); checkTrue(value === richText)
                    context.isWebShaped = true
                    return TransformedUIString(stringLiteral: "Web formatted")
                })
        }
        func webUnchanged(_ calls: [String]) {
            webCalls = []
            switch webResult() {
            case .unchanged: break
            default: unexpectedFailure("web guard/failure should preserve input")
            }
            checkEqual(webCalls, calls)
        }
        for type in [UIElementContextType.fullUIContext, .eventStreamContext] {
            webContext.type = type; webUnchanged([])
        }
        webContext.type = .informationalContext
        webNode.role = .textArea; webUnchanged([])
        webNode.role = .webArea
        webChrome = true; webUnchanged(["support"]); webChrome = false
        webMissingStart = true; webUnchanged(["support", "start"]); webMissingStart = false
        webMissingEnd = true; webUnchanged(["support", "start", "end"]); webMissingEnd = false
        webNextPresent = true
        webUnchanged(["support", "start", "end", "next", "diagnostic"])
        webNextPresent = false
        webReadNil = true; webUnchanged(["support", "start", "end", "next", "range"]); webReadNil = false
        webReadThrows = true; webUnchanged(["support", "start", "end", "next", "range"]); webReadThrows = false
        for nextThrows in [false, true] {
            webNextThrows = nextThrows; webCalls = []
            switch webResult() {
            case let .transformed(result):
                checkTrue(result.children.isEmpty)
                checkTrue(result.element.attributedString === richText)
                checkEqual(result.element.value, "Web formatted")
                checkEqual(result.element.transformedString?.description, "Web formatted")
                checkTrue(CFEqual(result.element.id, webNode.id))
                checkTrue(webContext.isWebShaped)
            default: unexpectedFailure("nil/failed next-line probe must continue to range formatting")
            }
            checkEqual(webCalls, ["support", "start", "end", "next", "range", "render"])
        }

        let attributedRange = UITextMarkerRange(start: webStart, end: webEnd)
        let optionsAttribute = UIElementAttribute("AXAttributedStringForTextMarkerRangeWithOptions")
        var nativeTextCalls: [String] = []
        var nativeHasOptions = true
        var nativeTextNil = false
        var nativeTextThrows = false
        ownerProvider.parameterSupport = {
            nativeTextCalls.append("support")
            return nativeHasOptions ? [optionsAttribute] : []
        }
        ownerProvider.parameterRead = { attribute, encoded in
            nativeTextCalls.append("read")
            if nativeHasOptions {
                checkTrue(attribute == optionsAttribute)
                let options = encoded.value as! NSDictionary
                checkEqual(options.count, 2)
                checkTrue(CFEqual(options["AXTextMarkerRange"] as! AXTextMarkerRange, attributedRange.range))
                let spellCheck = options["AXSpellCheck"] as! NSNumber
                checkTrue(CFGetTypeID(spellCheck) == CFBooleanGetTypeID())
                checkFalse(spellCheck.boolValue)
            } else {
                checkTrue(attribute == UIElementAttribute("AXAttributedStringForTextMarkerRange"))
                checkTrue(CFEqual(encoded.value as! AXTextMarkerRange, attributedRange.range))
            }
            if nativeTextThrows { throw UIElementError.axError(.failure) }
            return nativeTextNil ? nil : partial(richText)
        }
        for options in [true, false] {
            nativeHasOptions = options; nativeTextCalls = []
            checkTrue(try capturedOwner.attributedText(for: attributedRange) === richText)
            checkEqual(nativeTextCalls, ["support", "read"])
            nativeTextNil = true; nativeTextCalls = []
            checkTrue(try capturedOwner.attributedText(for: attributedRange) == nil)
            checkEqual(nativeTextCalls, ["support", "read"])
            nativeTextNil = false; nativeTextThrows = true; nativeTextCalls = []
            do {
                _ = try capturedOwner.attributedText(for: attributedRange)
                unexpectedFailure("native rich-text read must propagate error")
            } catch UIElementError.axError(let error) { checkTrue(error == .failure) }
            checkEqual(nativeTextCalls, ["support", "read"]) // never retry the other attribute
            nativeTextThrows = false
        }
        for wrong in ["plain text" as NSString, NSArray(), webStart.marker, attributedRange.range, ownerAX] as [AnyObject] {
            checkTrue(try decodeAXAttributedString(wrong, throwingOnFailure: false) == nil)
            do {
                _ = try decodeAXAttributedString(wrong, throwingOnFailure: true)
                unexpectedFailure("wrong rich-text type must throw")
            } catch UIElementError.failedToUnwrapAttributeValue { }
              catch UIElementError.unexpectedAttributeValueType {
                checkTrue(CFGetTypeID(wrong) == CFArrayGetTypeID())
            }
        }
        ownerProvider.parameterSupport = nil
        ownerProvider.parameterRead = nil

        var fullTextCalls: [String] = []
        var fullTextOptions = false
        var fullTextMarkerMissing = false
        var fullTextMarkerWrongType = false
        var fullTextReadThrows = false
        var capturedFullValue: String? = "A😀e\u{301}"
        func fullTextResult() throws -> NSAttributedString? {
            try uiElementFullAttributedText(capturedValue: capturedFullValue,
                supportedParameterizedAttributes: {
                    fullTextCalls.append("support")
                    return fullTextOptions ? [optionsAttribute] : []
                }, makeElement: { fullTextCalls.append("construct"); return capturedOwner.element },
                read: { attribute, encoded in
                    fullTextCalls.append(attribute.name as String)
                    if fullTextReadThrows { throw UIElementError.axError(.failure) }
                    if attribute == UIElementAttribute("AXTextMarkerRangeForUIElement") {
                        checkTrue(CFEqual(encoded.value as! AXUIElement, capturedOwner.axElement))
                        if fullTextMarkerWrongType { return partial("wrong" as NSString) }
                        return fullTextMarkerMissing ? nil : partial(attributedRange.range)
                    }
                    if attribute == optionsAttribute {
                        let options = encoded.value as! NSDictionary
                        checkTrue(CFEqual(options["AXTextMarkerRange"] as! AXTextMarkerRange, attributedRange.range))
                        checkFalse((options["AXSpellCheck"] as! NSNumber).boolValue)
                    } else {
                        checkTrue(attribute == UIElementAttribute("AXAttributedStringForRange"))
                        var range = CFRange()
                        checkTrue(AXValueGetValue(encoded.value as! AXValue, .cfRange, &range))
                        checkEqual(range.location, 0)
                        checkEqual(range.length, capturedFullValue!.utf16.count)
                    }
                    return partial(richText)
                })
        }
        checkEqual(capturedFullValue!.count, 3)
        checkEqual(capturedFullValue!.utf16.count, 5)
        checkTrue(try fullTextResult() === richText)
        checkEqual(fullTextCalls, ["support", "AXAttributedStringForRange"])
        capturedFullValue = nil; fullTextCalls = []
        checkTrue(try fullTextResult() == nil)
        checkEqual(fullTextCalls, ["support"])
        capturedFullValue = ""; fullTextCalls = []
        checkTrue(try fullTextResult() === richText)
        checkEqual(fullTextCalls, ["support", "AXAttributedStringForRange"])
        fullTextOptions = true; capturedFullValue = nil; fullTextCalls = []
        checkTrue(try fullTextResult() === richText)
        checkEqual(fullTextCalls, ["support", "construct", "AXTextMarkerRangeForUIElement", "AXAttributedStringForTextMarkerRangeWithOptions"])
        fullTextMarkerMissing = true; fullTextCalls = []
        checkTrue(try fullTextResult() == nil)
        checkEqual(fullTextCalls, ["support", "construct", "AXTextMarkerRangeForUIElement"])
        fullTextMarkerMissing = false; fullTextMarkerWrongType = true; fullTextCalls = []
        do {
            _ = try fullTextResult(); unexpectedFailure("invalid marker range must throw")
        } catch UIElementError.failedToUnwrapAttributeValue { }
        checkEqual(fullTextCalls, ["support", "construct", "AXTextMarkerRangeForUIElement"])
        fullTextMarkerWrongType = false; fullTextReadThrows = true; fullTextCalls = []
        do {
            _ = try fullTextResult(); unexpectedFailure("full-text provider failure must propagate")
        } catch UIElementError.axError(let error) { checkTrue(error == .failure) }
        checkEqual(fullTextCalls, ["support", "construct", "AXTextMarkerRangeForUIElement"])

        var composedRichNode = capturedOwner
        composedRichNode.role = .textArea
        composedRichNode.value = "A😀e\u{301}"
        var composedCalls: [String] = []
        var composedReadNil = false, composedReadWrong = false, composedReadFailure = false
        var composedRange = CFRange()
        ownerProvider.parameterSupport = { composedCalls.append("support"); return [] }
        ownerProvider.parameterRead = { attribute, parameter in
            composedCalls.append("parameter")
            checkTrue(attribute == UIElementAttribute("AXAttributedStringForRange"))
            checkTrue(CFGetTypeID(parameter.value) == AXValueGetTypeID())
            checkTrue(AXValueGetType(parameter.value as! AXValue) == .cfRange)
            checkTrue(AXValueGetValue(parameter.value as! AXValue, .cfRange, &composedRange))
            if composedReadFailure { throw UIElementError.axError(.failure) }
            if composedReadWrong { return partial("not attributed" as NSString) }
            return composedReadNil ? nil : partial(richText)
        }
        func composedRichResult() -> UIElementTreeTransformation.Result<TransformedUIElement> {
            MacUIElementTreeTransformation.retrieveAttributedTextFromTextAreas(
                item: associationItem(composedRichNode, children: [targetA]), context: &richContext,
                readTextualContent: { composedCalls.append("textual"); return nil },
                render: { value, _ in
                    composedCalls.append("render"); checkTrue(value === richText)
                    return TransformedUIString(stringLiteral: "Composed result")
                })
        }
        for range in [nil, NSRange(location: 2, length: 3), NSRange(location: NSNotFound, length: 0)] as [NSRange?] {
            composedRichNode.truncationRange = range; composedCalls = []
            switch composedRichResult() {
            case let .transformed(result):
                checkEqual(result.element.value, "Composed result")
                checkTrue(result.element.attributedString === richText)
                checkEqual(result.children.count, 1)
            default: unexpectedFailure("provider-backed text-area composition should transform")
            }
            checkEqual(composedCalls, range == nil ? ["textual", "support", "parameter", "render"] : ["textual", "parameter", "render"])
            checkEqual(composedRange.location, range.map { $0.location == NSNotFound ? -1 : $0.location } ?? 0)
            checkEqual(composedRange.length, range?.length ?? 5)
        }
        for failure in 0..<3 {
            composedReadNil = failure == 0; composedReadWrong = failure == 1; composedReadFailure = failure == 2
            composedCalls = []
            switch composedRichResult() {
            case .unchanged: break
            default: unexpectedFailure("provider nil/type/error must preserve original item")
            }
            checkEqual(composedCalls, ["textual", "parameter"])
        }
        ownerProvider.parameterSupport = nil; ownerProvider.parameterRead = nil

        let textualAttribute = UIElementAttribute("AXTextualContext")
        var contextNode = capturedOwner
        contextNode.role = .textArea
        contextNode.value = "Context fixture"
        contextNode.truncationRange = NSRange(location: 0, length: 3)
        func contextCache(_ attributes: [UIElementAttribute: AXPartialValue], supported: Set<UIElementAttribute> = []) {
            contextNode.element = UIElement(axElement: ownerAX, cache: UIElementCache(
                supportedAttributes: supported, attributes: attributes, transactionAttributes: nil))
        }
        var textualErrors = 0
        ownerProvider.readResult = (.success, partial("AXTextualContextSourceCode" as NSString))
        let textualReadsBefore = ownerProvider.singleReads
        contextCache([textualAttribute: partial("AXTextualContextSourceCode" as NSString)])
        checkEqual(contextNode.textualContext { _ in textualErrors += 1 }, "AXTextualContextSourceCode")
        checkEqual(ownerProvider.singleReads, textualReadsBefore) // valid cached value wins
        contextCache([textualAttribute: partial(42 as NSNumber)])
        checkEqual(contextNode.textualContext { _ in textualErrors += 1 }, "AXTextualContextSourceCode")
        checkEqual(ownerProvider.singleReads, textualReadsBefore + 1) // failed cached decode falls through
        checkEqual(textualErrors, 0)
        contextCache([:])
        ownerProvider.readResult = (.success, partial(42 as NSNumber))
        checkTrue(contextNode.textualContext { _ in textualErrors += 1 } == nil)
        checkEqual(textualErrors, 1)
        ownerProvider.readResult = (.failure, nil)
        checkTrue(contextNode.textualContext { _ in textualErrors += 1 } == nil)
        checkEqual(textualErrors, 2)
        let readsBeforeUnsupported = ownerProvider.singleReads
        contextCache([:], supported: [UIElementAttribute("AXRole")])
        checkTrue(contextNode.textualContext { _ in textualErrors += 1 } == nil)
        checkEqual(ownerProvider.singleReads, readsBeforeUnsupported)
        contextCache([textualAttribute: partial("AXTextualContextSourceCode" as NSString)])
        ownerProvider.parameterRead = { _, _ in unexpectedFailure("source code context must not read rich text") }
        switch MacUIElementTreeTransformation.retrieveAttributedTextFromTextAreas(
            item: associationItem(contextNode), context: &richContext,
            reportAttributeError: { _ in unexpectedFailure("cached string should decode") },
            render: { _, _ in unexpectedFailure("source code context must skip render") }) {
        case .unchanged: break
        default: unexpectedFailure("provider-composed source-code guard must preserve item")
        }
        contextCache([:])
        ownerProvider.readResult = (.failure, nil)
        var contextParameterReads = 0
        ownerProvider.parameterRead = { _, _ in contextParameterReads += 1; return partial(richText) }
        switch MacUIElementTreeTransformation.retrieveAttributedTextFromTextAreas(
            item: associationItem(contextNode), context: &richContext,
            reportAttributeError: { _ in textualErrors += 1 },
            render: { _, _ in TransformedUIString(stringLiteral: "Context read failed, rich text available") }) {
        case let .transformed(result):
            checkEqual(result.element.value, "Context read failed, rich text available")
        default: unexpectedFailure("context lookup failure becomes nil and does not abort later rich-text read")
        }
        checkEqual(contextParameterReads, 1)
        checkEqual(textualErrors, 3)
        ownerProvider.parameterRead = nil

        var composedWeb = capturedOwner
        composedWeb.role = .webArea
        let chromeID = UIElementAttribute("ChromeAXNodeId")
        let startAttribute = UIElementAttribute("AXStartTextMarker")
        let endAttribute = UIElementAttribute("AXEndTextMarker")
        let webMarkerCache = [startAttribute: partial(webStart.marker), endAttribute: partial(webEnd.marker)]
        func webCache(supported: Set<UIElementAttribute>, requested: Set<UIElementAttribute>?) {
            composedWeb.element = UIElement(axElement: ownerAX, cache: UIElementCache(
                supportedAttributes: supported, attributes: webMarkerCache, transactionAttributes: requested))
        }
        ownerProvider.supportedAttributes = [chromeID]
        webCache(supported: [], requested: nil)
        checkFalse(composedWeb.supportsChromeNodeID()) // no transaction restriction: use captured support
        webCache(supported: [], requested: [])
        checkTrue(composedWeb.supportsChromeNodeID()) // excluded by transaction: fresh support
        webCache(supported: [chromeID], requested: [chromeID])
        ownerProvider.supportedAttributes = []
        checkTrue(composedWeb.supportsChromeNodeID()) // explicitly requested: cache is authoritative
        webCache(supported: [], requested: nil)
        let webSingleReadsBefore = ownerProvider.singleReads
        checkTrue(CFEqual(composedWeb.textMarker(for: startAttribute, reportError: { _ in unexpectedFailure() })!.marker, webStart.marker))
        checkEqual(ownerProvider.singleReads, webSingleReadsBefore)
        var composedWebCalls: [String] = []
        var composedWebProbeWrong = false
        var composedWebProbePresent = false
        ownerProvider.parameterSupport = { composedWebCalls.append("support"); return [] }
        ownerProvider.parameterRead = { attribute, parameter in
            composedWebCalls.append(attribute.name as String)
            if attribute == UIElementAttribute("AXNextLineEndTextMarkerForTextMarker") {
                checkTrue(CFEqual(parameter.value as! AXTextMarker, webEnd.marker))
                if composedWebProbeWrong { return partial("invalid marker" as NSString) }
                return composedWebProbePresent ? partial(webStart.marker) : nil
            }
            checkTrue(attribute == UIElementAttribute("AXAttributedStringForTextMarkerRange"))
            let range = parameter.value as! AXTextMarkerRange
            checkTrue(CFEqual(AXTextMarkerRangeCopyStartMarker(range), webStart.marker))
            checkTrue(CFEqual(AXTextMarkerRangeCopyEndMarker(range), webEnd.marker))
            return partial(richText)
        }
        var composedWebContext = ownerContext(.informationalContext)
        func composedWebResult() -> UIElementTreeTransformation.Result<TransformedUIElement> {
            MacUIElementTreeTransformation.retrieveAttributedTextFromWebAreas(
                item: associationItem(composedWeb, children: [targetA]), context: &composedWebContext,
                reportAttributeError: { _ in unexpectedFailure("cached markers should decode") },
                reportUnexpectedNextLine: { composedWebCalls.append("diagnostic") },
                render: { value, _ in
                    checkTrue(value === richText); composedWebCalls.append("render")
                    return TransformedUIString(stringLiteral: "Composed web")
                })
        }
        for wrong in [false, true] {
            composedWebProbeWrong = wrong; composedWebCalls = []
            switch composedWebResult() {
            case let .transformed(result):
                checkEqual(result.element.value, "Composed web"); checkTrue(result.children.isEmpty)
            default: unexpectedFailure("nil/invalid next-line marker should continue")
            }
            checkEqual(composedWebCalls, ["AXNextLineEndTextMarkerForTextMarker", "support", "AXAttributedStringForTextMarkerRange", "render"])
        }
        composedWebProbeWrong = false; composedWebProbePresent = true; composedWebCalls = []
        switch composedWebResult() {
        case .unchanged: break
        default: unexpectedFailure("present next-line marker should preserve web tree")
        }
        checkEqual(composedWebCalls, ["AXNextLineEndTextMarkerForTextMarker", "diagnostic"])
        webCache(supported: [chromeID], requested: nil); composedWebCalls = []
        switch composedWebResult() {
        case .unchanged: break
        default: unexpectedFailure("Chrome capability must bypass marker reads")
        }
        checkTrue(composedWebCalls.isEmpty)
        composedWeb.element = UIElement(axElement: ownerAX, cache: UIElementCache(
            supportedAttributes: [], attributes: [:], transactionAttributes: nil))
        ownerProvider.readResult = (.success, partial(webStart.marker))
        checkTrue(CFEqual(composedWeb.textMarker(for: startAttribute, reportError: { _ in unexpectedFailure() })!.marker, webStart.marker))
        ownerProvider.readResult = (.success, partial("wrong" as NSString))
        var webMarkerErrors = 0
        checkTrue(composedWeb.textMarker(for: startAttribute, reportError: { _ in webMarkerErrors += 1 }) == nil)
        checkEqual(webMarkerErrors, 1)
        ownerProvider.parameterSupport = nil; ownerProvider.parameterRead = nil

        // Exercise the complete Mac rule order through the real recursive driver.
        var macPipelineContext = ownerContext(.fullUIContext)
        var macVisited: [MacUIElementTreeTransformation] = []
        func dispatchMac(_ rule: MacUIElementTreeTransformation, _ item: PruneItem,
            _ context: inout UIElementTransformationContext) -> UIElementTreeTransformation.Result<TransformedUIElement> {
            if !macVisited.contains(rule) { macVisited.append(rule) }
            return rule.transform(item: item, context: &context,
                rebuild: { tree, child, _ in tree.items.append(child) },
                providerTitle: { _ in nil },
                owningBundleIdentifier: { _ in unexpectedFailure("non-calendar fixture must not resolve app") },
                renderNode: { node, _ in node.title ?? node.value ?? "" },
                renderAttributed: { _, _ in unexpectedFailure("non-rich fixture must not format attributed text") },
                reportAttributeError: { _ in unexpectedFailure("fixture must not read uncached attributes") },
                reportUnexpectedNextLine: { unexpectedFailure("fixture must not probe text markers") })
        }
        let macPipelineResult = pipelineTree.transformed(using: MacUIElementTreeTransformation.defaultPipeline,
            in: &macPipelineContext, apply: dispatchMac)
        checkEqual(macVisited.count, 13)
        checkTrue(macVisited == MacUIElementTreeTransformation.defaultPipeline)
        checkEqual(macPipelineResult.items.count, 1)
        checkEqual(macPipelineResult.items[0].children.count, 1)
        checkEqual(macPipelineResult.items[0].children[0].element.value, " A   B ")
        checkTrue(CFEqual(macPipelineResult.focusedElement!.id, pipelineRoot.id))
        var macInformational = ownerContext(.informationalContext)
        switch dispatchMac(.shared(.pruneNonDescriptiveSubtrees), associationItem(macLeaf), &macInformational) {
        case .removed: break
        default: unexpectedFailure("Mac dispatcher must use native override, not generic pruning")
        }
        var actionDispatch = anonymousGroup
        actionDispatch.actionDescriptions = [UIElementActionDescription(.showDefaultUI, description: "Hide"),
            UIElementActionDescription(.press, description: "Keep")]
        switch dispatchMac(.filterActions, associationItem(actionDispatch), &macPipelineContext) {
        case let .transformed(result): checkEqual(result.element.actionDescriptions.map(\.description), ["Keep"])
        default: unexpectedFailure("Mac dispatcher must filter action descriptions")
        }

        // Rich runs preserve UTF-16 offsets and emit a terminal flush callback.
        let runKey = NSAttributedString.Key("fixture-format")
        let runText = NSMutableAttributedString(string: "A😀e\u{301}")
        runText.addAttribute(runKey, value: "accent", range: NSRange(location: 3, length: 2))
        var runTexts: [String] = [], runOffsets: [[Int?]] = [], runAttributes: [Bool] = []
        traverseAttributedTextRuns(runText) { run, attributes in
            runTexts.append(run.text)
            runOffsets.append(run.sourceOffsets)
            runAttributes.append(attributes[runKey] != nil)
        }
        checkEqual(runTexts, ["A😀", "e\u{301}", ""])
        checkEqual(runOffsets, [[0, 1, 2], [3, 4], []])
        checkEqual(runAttributes, [false, true, false])
        var emptyRunCount = 0
        traverseAttributedTextRuns(NSAttributedString(string: "")) { run, attributes in
            emptyRunCount += 1
            checkEqual(run.text, "")
            checkTrue(run.sourceOffsets.isEmpty && attributes.isEmpty)
        }
        checkEqual(emptyRunCount, 1)

        let classAttribute = UIElementAttribute("AXDOMClassList")
        func classList(_ object: AnyObject?) -> [String]? {
            UIElement(axElement: textAX, cache: UIElementCache(supportedAttributes: [classAttribute],
                attributes: object.map { [classAttribute: partial($0)] } ?? [:],
                transactionAttributes: nil)).transformedDOMClassList
        }
        checkTrue(classList(nil) == nil)
        checkTrue(classList("not an array" as NSString) == nil)
        checkEqual(classList([] as NSArray), [])
        let mixedClasses: NSArray = ["button", NSNumber(value: 7), "", "button", ["nested"], NSNull(), "active"]
        checkEqual(classList(mixedClasses), ["button", "", "button", "active"])
        checkEqual(classList([NSNumber(value: 2), NSNull()] as NSArray), [])
        checkEqual(try decodeAXStringArray(mixedClasses, throwingOnFailure: true), ["button", "", "button", "active"])
        do {
            _ = try decodeAXStringArray("bad" as NSString, throwingOnFailure: true)
            unexpectedFailure("strict outer String-array mismatch must throw")
        } catch is UIElementError {}
        checkEqual(textProvider.singleReads, readsBeforeValueState)
        let urlAX = AXUIElementCreateApplication(12507)
        let urlProvider = Hit()
        provider.replacements[urlAX] = urlProvider
        let documentAttribute = UIElementAttribute("AXDocument")
        func urlElement(_ attributes: [UIElementAttribute: AXPartialValue], supported: Bool = true) -> UIElement {
            UIElement(axElement: urlAX, cache: UIElementCache(
                supportedAttributes: supported ? [documentAttribute] : [UIElementAttribute("AXRole")],
                attributes: attributes, transactionAttributes: nil))
        }
        var urlErrors = 0
        func transformedURL(_ element: UIElement, role: UIElementRole = .window) -> URL? {
            element.transformedURL(capturedRole: role, reportError: { _ in urlErrors += 1 })
        }
        let canonicalURL = URL(string: "https://example.com/cached")!
        checkEqual(transformedURL(urlElement([UIElementAttribute("AXURL"): partial(canonicalURL as NSURL)])), canonicalURL)
        checkEqual(urlProvider.singleReads, 0)
        checkTrue(transformedURL(urlElement([:]), role: .textField) == nil)
        checkEqual(urlProvider.singleReads, 0)
        checkEqual(transformedURL(urlElement([documentAttribute: partial("relative/document" as NSString)])),
            URL(string: "relative/document"))
        checkEqual(urlProvider.singleReads, 0)
        urlProvider.readResult = (.success, partial("https://example.com/fresh" as NSString))
        checkEqual(transformedURL(urlElement([documentAttribute: partial(NSNumber(value: 3))])),
            URL(string: "https://example.com/fresh"))
        checkEqual(urlProvider.singleReads, 1)
        // A String in AXURL is not parsed there; the window document is used.
        checkEqual(transformedURL(urlElement([UIElementAttribute("AXURL"): partial("https://ignored.example" as NSString)])),
            URL(string: "https://example.com/fresh"))
        checkEqual(urlProvider.singleReads, 2)
        checkTrue(transformedURL(urlElement([:], supported: false)) == nil)
        checkEqual(urlProvider.singleReads, 2)
        urlProvider.readResult = (.success, partial(NSNumber(value: 3)))
        checkTrue(transformedURL(urlElement([:])) == nil)
        checkEqual(urlErrors, 1)
        urlProvider.readResult = (.failure, nil)
        checkTrue(transformedURL(urlElement([:])) == nil)
        checkEqual(urlErrors, 2)
        checkEqual(urlProvider.singleReads, 4)
        let role = UIElementAttribute("AXRole")
        var rect = CGRect(x: 10, y: 20, width: 80, height: 40)
        let target = UIElement(axElement: targetAX, cache: UIElementCache(supportedAttributes: [role, .frame],
            attributes: [role: partial("AXWindow" as NSString), .frame: partial(AXValueCreate(.cgRect, &rect)!)], transactionAttributes: nil))
        // Exercise real concrete witnesses through the existential used by a
        // transaction root, rather than a separate fixture implementation.
        let targetMock = Hit()
        provider.replacements[targetAX] = targetMock
        let protocolTarget: any UIElementProtocol = target
        checkTrue(UIElement.role == nil)
        checkTrue(CFEqual(protocolTarget.id, targetAX))
        checkTrue(protocolTarget.valueTypeName == nil)
        checkFalse(protocolTarget.isSentByCurrentUser)
        checkFalse(protocolTarget.isTableRow)
        checkTrue(protocolTarget.rowIndexRange == nil)
        checkTrue(protocolTarget.columnIndexRange == nil)
        checkTrue(protocolTarget.presentationActions.isEmpty)
        try protocolTarget.perform(action: .press)
        checkEqual(targetMock.performed, [.press])
        targetMock.fail = true
        do {
            try protocolTarget.perform(action: .press)
            unexpectedFailure("provider action failure must escape the protocol witness")
        } catch UIElementError.axError(.failure) {}
        checkEqual(targetMock.performed, [.press, .press])
        targetMock.fail = false
        let transaction = UIElementTreeTransaction(element: target,
            cache: UIElementTransactionCache(attributeTable: [targetAX: target.cache.attributes],
                requestedAttributes: [role, .frame], fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable<UIElementRole>())
        try transaction.perform { root in
            checkTrue(CFEqual(root.axElement, targetAX))
            let reconstructed: any UIElementProtocol = UIElement(element: root.axElement)
            checkEqual(reconstructed.role, root.role)
            try reconstructed.perform(action: .press)
        }
        checkTrue(UIElementTreeTransaction.current == nil)
        checkEqual(targetMock.performed, [.press, .press, .press])
        var hierarchyCopies = 0
        let reader = AXHierarchyReader(resolvePID: { element in
                checkTrue(CFEqual(element, targetAX)); return 99999
            }, currentPID: { 1 }, isMainThread: { unexpectedFailure() },
            onMain: { _ in unexpectedFailure() },
            optionKeys: { AXHierarchyOptionKeys(skipInspectionForAttributes: "skip" as CFString,
                arrayAttributes: "arrays" as CFString, truncateStrings: "truncate" as CFString,
                maxArrayCount: "max" as CFString) },
            resultKeys: { AXHierarchyResultKeys(value: "value", count: "count") },
            incompleteResultKey: { "incomplete" },
            decodeBoolean: { try decodeAXBool($0, throwingOnFailure: false) },
            copy: { element, _, options, output in
                hierarchyCopies += 1
                checkEqual((options as NSDictionary)["max"] as? Int, -7)
                let raw: [AXUIElement: NSDictionary] = [element: ["AXRole": ["value": "AXButton"]]]
                output = .passRetained((raw as NSDictionary) as CFDictionary)
                return .success
            })
        let prefetched = target.subtreeTransaction(additionalAttributes: [role],
            maxChildCount: -7, reader: reader)
        checkEqual(hierarchyCopies, 1)
        checkTrue(prefetched.element is UIElement)
        checkEqual(prefetched.element.role, .button)
        checkEqual(prefetched.roleFrequencyTable[.button], 1)
        checkTrue(UIElementTreeTransaction.current == nil)
        prefetched.perform { root in
            checkEqual(UIElement(element: root.axElement).role, .button)
            // No prefetch means no hierarchy calls. Its root must be constructed
            // against the new empty cache, not inherit this outer prefetched role.
            let cold = UIElementTreeTransaction.$prefetchEnabled.withValue(false) {
                target.subtreeTransaction(additionalAttributes: [], maxChildCount: 2, reader: reader)
            }
            checkTrue(cold.element is UIElement)
            checkTrue(cold.cache.attributeTable.isEmpty)
            checkTrue(cold.cache.requestedAttributes.isEmpty)
            checkEqual(hierarchyCopies, 1)
            checkTrue(cold.element.cache.attributes.isEmpty)
            checkEqual(UIElement(element: root.axElement).role, .button)
        }
        checkTrue(UIElementTreeTransaction.current == nil)
        // Scoped convenience wrapper reuses a containing prefetch table, but
        // passes the original receiver (AXWindow), not its cached root (AXButton).
        prefetched.perform { _ in
            target.withSubtreeTransaction(additionalAttributes: [], maxChildCount: 500,
                reader: reader) { receiver in
                checkEqual(receiver.role, .window)
                checkEqual(UIElementTreeTransaction.current?.element.role, .button)
            }
        }
        checkEqual(hierarchyCopies, 1)
        target.withSubtreeTransaction(additionalAttributes: [], maxChildCount: -7,
            reader: reader) { receiver in
            checkEqual(receiver.role, .button)
            checkTrue(UIElementTreeTransaction.current != nil)
        }
        checkEqual(hierarchyCopies, 2)
        checkTrue(UIElementTreeTransaction.current == nil)
        enum ScopeFailure: Error { case expected }
        do {
            try target.withSubtreeTransaction(additionalAttributes: [], maxChildCount: -7,
                reader: reader) { _ in throw ScopeFailure.expected }
            unexpectedFailure("work failure must escape")
        } catch ScopeFailure.expected {}
        checkEqual(hierarchyCopies, 3)
        checkTrue(UIElementTreeTransaction.current == nil)
        // With prefetch disabled, an existing scope bypasses even table membership.
        transaction.perform { _ in
            UIElementTreeTransaction.$prefetchEnabled.withValue(false) {
                let outside = UIElement(axElement: AXUIElementCreateApplication(12504), cache: target.cache)
                outside.withSubtreeTransaction(additionalAttributes: [], maxChildCount: 0,
                    reader: reader) { receiver in
                    checkTrue(CFEqual(receiver.axElement, outside.axElement))
                }
            }
        }
        checkEqual(hierarchyCopies, 3)
        UIElementTreeTransaction.$prefetchEnabled.withValue(false) {
            target.withSubtreeTransaction(additionalAttributes: [], maxChildCount: 0,
                reader: reader) { receiver in
                checkTrue(UIElementTreeTransaction.current != nil)
                checkTrue(receiver.cache.attributes.isEmpty)
            }
        }
        checkEqual(hierarchyCopies, 3)
        checkTrue(UIElementTreeTransaction.current == nil)
        let emptyScope = UIElementTreeTransaction(element: target,
            cache: UIElementTransactionCache(attributeTable: [:], requestedAttributes: [],
                fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable<UIElementRole>())
        emptyScope.perform { _ in
            target.withSubtreeTransaction(additionalAttributes: [], maxChildCount: -7,
                reader: reader) { receiver in
                checkEqual(receiver.role, .button)
                checkFalse(UIElementTreeTransaction.current!.cache.attributeTable.isEmpty)
            }
            checkTrue(UIElementTreeTransaction.current!.cache.attributeTable.isEmpty)
        }
        checkEqual(hierarchyCopies, 4)
        checkTrue(UIElementTreeTransaction.current == nil)
        let childrenKey = UIElementAttribute("AXChildren")
        let subset = AXArraySubsetDescriptor(count: 99, availableRanges: [0..<2])
        checkTrue(uiElementAvailableSubsetDescription(nil) == nil)
        checkTrue(uiElementAvailableSubsetDescription(.init(count: 99)) == nil)
        checkEqual(uiElementAvailableSubsetDescription(subset), "(showing 0-2 of 99 items)")
        checkEqual(uiElementAvailableSubsetDescription(.init(count: 9, availableRanges: [])), "(showing  of 9 items)")
        checkEqual(uiElementAvailableSubsetDescription(.init(count: 9, availableRanges: [5..<7, 0..<2])),
            "(showing 5-7, 0-2 of 9 items)")
        let childrenPartial = AXPartialValue(value: AXEncodedValue(value: [targetAX, targetAX] as NSArray),
            arraySubsetDescriptor: subset, textTruncationDescriptor: nil)
        let cachedChildren = UIElement(axElement: targetAX,
            cache: UIElementCache(supportedAttributes: [childrenKey], attributes: [childrenKey: childrenPartial], transactionAttributes: nil))
        let cachedPartial = try cachedChildren.partialArrayValue(for: childrenKey, maxCount: 1)
        checkEqual(cachedPartial?.array.count, 2)
        checkEqual(cachedPartial?.subsetDescriptor, subset)
        checkEqual(targetMock.singleReads, 0)
        checkTrue(targetMock.arrayReads.isEmpty)
        let badChildren = UIElement(axElement: targetAX,
            cache: UIElementCache(supportedAttributes: [childrenKey], attributes: [childrenKey: partial("wrong type" as NSString)], transactionAttributes: nil))
        checkTrue(try badChildren.partialArrayValue(for: childrenKey, maxCount: 2) == nil)
        checkTrue(targetMock.arrayReads.isEmpty)
        let uncachedChildren = UIElement(axElement: targetAX,
            cache: UIElementCache(supportedAttributes: [childrenKey], attributes: [:], transactionAttributes: nil))
        targetMock.readResult = (.noValue, childrenPartial)
        let tolerated = try uncachedChildren.partialArrayValue(for: childrenKey, maxCount: -3)
        checkEqual(tolerated?.subsetDescriptor, subset)
        checkEqual(targetMock.arrayReads, [-3])
        targetMock.readResult = (.attributeUnsupported, childrenPartial)
        checkEqual(try uncachedChildren.partialArrayValue(for: childrenKey, maxCount: nil)?.array.count, 2)
        checkEqual(targetMock.singleReads, 1)
        targetMock.readResult = (.failure, childrenPartial)
        do {
            _ = try uncachedChildren.partialArrayValue(for: childrenKey, maxCount: 2)
            unexpectedFailure("unexpected AX failures must propagate")
        } catch UIElementError.axError(.failure) {}
        let leafTree = UIElementTree<UIElement>(items: [], focusedElement: nil)
        let childTree = UIElementTree(items: [UIElementTree.Item(element: cachedChildren, subtree: leafTree)], focusedElement: nil)
        var tree = UIElementTree(items: [UIElementTree.Item(element: target, subtree: childTree, availableSubset: subset),
            UIElementTree.Item(element: target, subtree: leafTree)], focusedElement: target)
        checkEqual(tree.items[0].children.count, 1)
        checkEqual(tree.items[0].availableSubsetDescription, "(showing 0-2 of 99 items)")
        checkEqual(tree.focusedElement?.role, .window)
        let iterator = tree.makeIterator()
        let shared = iterator
        let independent = tree.makeIterator()
        tree.items.removeAll()
        checkTrue(Array(tree).isEmpty)
        checkEqual(iterator.next()?.role, .window)
        checkTrue(shared.next()?.cache.attributes[childrenKey] != nil)
        checkEqual(iterator.next()?.role, .window)
        checkTrue(shared.next() == nil)
        checkTrue(shared.next() == nil)
        checkEqual(independent.next()?.role, .window)
        checkEqual(Array(childTree).count, 1)
        checkFalse(tree.hasDescendant(where: \UIElement.hasDescriptiveAttributes))
        let titled = UIElement(axElement: targetAX, cache: UIElementCache(supportedAttributes: [],
            attributes: [UIElementAttribute("AXTitle"): partial("named child" as NSString)], transactionAttributes: nil))
        let describedChild = UIElementTree(items: [UIElementTree.Item(element: titled, subtree: leafTree)], focusedElement: nil)
        tree.items.append(.init(element: target, subtree: describedChild))
        checkTrue(tree.hasDescendant(where: \UIElement.hasDescriptiveAttributes))
        checkTrue(tree.hasDescendant(where: \UIElement.hasDescriptiveAttributes))
        tree.items[0].subtree.items.removeAll()
        checkFalse(tree.hasDescendant(where: \UIElement.hasDescriptiveAttributes))
        // A descriptive parent does not satisfy a leaf-only predicate while
        // its sole child is undescriptive. Removing the child changes that.
        var leafQueries = UIElementTree(items: [UIElementTree.Item(element: titled,
            subtree: UIElementTree(items: [.init(element: target, subtree: leafTree)], focusedElement: nil),
            availableSubset: subset)], focusedElement: nil)
        checkTrue(leafQueries.hasDescendant(where: \UIElement.hasDescriptiveAttributes))
        checkFalse(leafQueries.hasLeafDescendant(where: \UIElement.hasDescriptiveAttributes))
        checkEqual(leafQueries.element(at: IndexPath(indexes: [0, 0]))?.role, .window)
        checkEqual(leafQueries.item(for: IndexPath(index: 0))?.availableSubset, subset)
        for path in [IndexPath(), IndexPath(index: -1), IndexPath(index: 1),
                     IndexPath(indexes: [0, -1]), IndexPath(indexes: [0, 1]), IndexPath(indexes: [0, 0, 0])] {
            checkTrue(leafQueries.item(at: path) == nil)
            checkTrue(leafQueries.element(for: path) == nil)
        }
        leafQueries.items[0].subtree.items.removeAll()
        // An incomplete subset with no currently stored children is still a leaf.
        checkTrue(leafQueries.hasLeafDescendant(where: \UIElement.hasDescriptiveAttributes))
        checkTrue(leafQueries.hasLeafDescendant(where: \UIElement.hasDescriptiveAttributes))
        leafQueries.items.removeAll()
        checkFalse(leafQueries.hasLeafDescendant(where: \UIElement.hasDescriptiveAttributes))
        // Duplicate AX identity resolves to the last preorder ID; earlier IDs
        // still retain positional paths, while reverse lookup reflects final values.
        var indexed = UIElementTree(items: [.init(element: target, subtree: childTree),
            .init(element: titled, subtree: leafTree)], focusedElement: nil)
        checkEqual(indexed.id(for: targetAX), 2)
        let indexTable = indexed.table()
        checkEqual(indexTable.path(to: 0), IndexPath(index: 0))
        checkEqual(indexTable.path(to: 1), IndexPath(indexes: [0, 0]))
        checkEqual(indexTable.path(to: 2), IndexPath(index: 1))
        checkTrue(indexTable[value: 0] == nil)
        checkTrue(CFEqual(indexTable[value: 2]!, targetAX))
        checkEqual(indexed.element(for: 0)?.role, .window)
        checkEqual(indexed.element(for: 2)?.title, "named child")
        checkTrue(indexed.item(for: -1) == nil)
        checkTrue(indexed.item(for: 3) == nil)
        checkEqual(indexed.setFocusedElement(identity: targetAX)?.title, "named child")
        checkEqual(indexed.focusedElement?.title, "named child")
        checkTrue(indexed.setFocusedElement(identity: AXUIElementCreateApplication(12505)) == nil)
        checkTrue(indexed.focusedElement == nil)
        indexed.items.removeLast()
        checkEqual(indexed.id(for: targetAX), 1)
        checkTrue(indexed.table().path(to: 2) == nil)
        let collisions = UIElementTreeTable(values: ["one": 7, "two": 7], paths: [7: IndexPath(index: 3)])
        checkTrue(["one", "two"].contains(collisions[value: 7]!))
        checkEqual(collisions.values.count, 2)
        checkEqual(collisions.elements.count, 1)
        let selectedItem = UIElementTree<UIElement>.Item(element: cachedChildren, subtree: childTree, availableSubset: subset)
        checkTrue(indexed.focusTree(selectedItems: [selectedItem]) == nil)
        let focusedSource = UIElementTree<UIElement>(items: [], focusedElement: titled)
        let focusTree = focusedSource.focusTree(selectedItems: [selectedItem, selectedItem])!
        checkTrue(focusTree.isFocusTree())
        checkEqual(focusTree.items.count, 1)
        checkEqual(focusTree.items[0].element.title, "named child")
        checkTrue(focusTree.items[0].availableSubset == nil)
        checkTrue(focusTree.items[0].subtree.focusedElement == nil)
        checkEqual(focusTree.items[0].children.count, 2)
        checkEqual(focusTree.items[0].children[0].availableSubset, subset)
        checkEqual(focusTree.items[0].children[0].children.count, 1)
        checkTrue(focusedSource.focusTree(selectedItems: [])!.isFocusTree())
        checkFalse(focusedSource.isFocusTree())
        let sameIdentity = UIElementTree(items: [.init(element: target, subtree: childTree)], focusedElement: titled)
        checkTrue(sameIdentity.isFocusTree())
        let different = UIElement(axElement: AXUIElementCreateApplication(12506), cache: target.cache)
        checkFalse(UIElementTree(items: [.init(element: different, subtree: leafTree)], focusedElement: titled).isFocusTree())
        checkFalse(UIElementTree(items: [.init(element: target, subtree: leafTree)], focusedElement: nil).isFocusTree())
        checkFalse(UIElementTree(items: [.init(element: target, subtree: leafTree), .init(element: target, subtree: leafTree)], focusedElement: titled).isFocusTree())
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
private func unexpectedFailure(_ message: String = "unexpected failure") -> Never { preconditionFailure(message) }

func runProviderClickChecks() async throws { try await ProviderClickChecks.run() }
