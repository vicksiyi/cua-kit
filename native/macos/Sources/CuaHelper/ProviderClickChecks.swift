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
        var supportedParameterizedAttributes: [UIElementAttribute] { fatalError() }
        func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue? {
            guard let parameterRead else { fatalError() }
            return try parameterRead(attribute, parameter)
        }
        func element(at point: CGPoint) throws -> UIElement? {
            points.append(point)
            if fail { throw UIElementError.axError(.failure) }
            return result
        }
        var actions: [UIElementAction] { get throws { fatalError() } }
        func description(for action: UIElementAction) throws -> String? { fatalError() }
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
