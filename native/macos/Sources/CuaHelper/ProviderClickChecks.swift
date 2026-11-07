import DequeModule
import Carbon
import ApplicationServices
import AppKit

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
        var writeValue: ((AXEncodedValue, UIElementAttribute) throws -> Void)?
        func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws {
            guard let writeValue else { fatalError() }
            try writeValue(value, attribute)
        }
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
        var testBundleIdentifier: String?
        var bundleReads = 0
        var bundleIdentifier: String? { bundleReads += 1; return testBundleIdentifier }
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
        checkEqual(capturedOwner.actions, Optional<[UIElementAction]>.some([.press]))
        checkEqual(eventOwner.actions, Optional<[UIElementAction]>.some([]))
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
        do {
            var writes = 0
            ownerProvider.writeValue = { encoded, attribute in
                writes += 1
                checkEqual(encoded.value as? String, "native edit")
                checkEqual(attribute, UIElementAttribute("AXValue"))
            }
            try mutableOwner.setValue("native edit", forAttribute: UIElementAttribute("AXValue"))
            checkEqual(writes, 1)
            checkEqual(mutableOwner.value, "rendered value")
            checkEqual(ownerProvider.singleReads, readsBeforeMutation)
            ownerProvider.writeValue = { _, _ in
                writes += 1; throw UIElementError.axError(.cannotComplete)
            }
            do {
                try mutableOwner.setValue("native edit", forAttribute: UIElementAttribute("AXValue"))
                unexpectedFailure()
            } catch UIElementError.axError(let code) { checkEqual(code, .cannotComplete) }
            checkEqual(writes, 2)
            checkEqual(mutableOwner.value, "rendered value")
            ownerProvider.writeValue = nil
        }
        do {
            var node = capturedOwner
            var writes: [Bool] = []
            ownerProvider.writeValue = { encoded, attribute in
                checkEqual(attribute, UIElementAttribute("AXDisclosing"))
                writes.append((encoded.value as! NSNumber).boolValue)
            }
            node.isDisclosable = false; node.isDisclosing = true
            try node.toggleDisclosure()
            checkTrue(writes.isEmpty)
            node.isDisclosable = true; node.isDisclosing = false
            try node.toggleDisclosure()
            try node.toggleDisclosure()
            checkEqual(writes, [true, true]) // immutable captured state, no optimistic toggle
            checkFalse(node.isDisclosing)
            node.isDisclosing = true
            try node.toggleDisclosure()
            checkEqual(writes, [true, true, false])
            checkEqual(ownerProvider.singleReads, readsBeforeMutation)
            ownerProvider.writeValue = { _, _ in throw UIElementError.axError(.cannotComplete) }
            do { try node.toggleDisclosure(); unexpectedFailure() }
            catch UIElementError.axError(let code) { checkEqual(code, .cannotComplete) }
            checkTrue(node.isDisclosing)
            ownerProvider.writeValue = nil
        }
        do {
            let performAX = AXUIElementCreateApplication(12509)
            let performProvider = Hit()
            provider.replacements[performAX] = performProvider
            var node = capturedOwner
            node.role = .button
            node.element = UIElement(axElement: performAX, cache: UIElementCache(
                supportedAttributes: [], attributes: [:], transactionAttributes: nil))
            performProvider.performed = []; performProvider.readResult = (.success, nil)
            try node.perform(action: .press)
            checkEqual(performProvider.performed, [.press])
            node.isDisclosable = true; node.isDisclosing = false
            var disclosureWrites = 0
            performProvider.writeValue = { value, attribute in
                disclosureWrites += 1
                checkEqual(attribute, UIElementAttribute("AXDisclosing"))
                checkEqual((value.value as? NSNumber)?.boolValue, true)
            }
            try node.perform(action: .expand)
            try node.perform(action: .collapse)
            checkEqual(disclosureWrites, 2)
            checkEqual(performProvider.performed, [.press])
            try node.perform(action: .scrollDownByPage) // no scrollbar -> native fallback
            checkEqual(performProvider.performed, [.press, .scrollDownByPage])
            performProvider.fail = true
            do { try node.perform(action: .press); unexpectedFailure() }
            catch UIElementError.axError(let code) { checkEqual(code, .failure) }
            checkEqual(performProvider.performed.count, 3)
            performProvider.fail = false; performProvider.writeValue = nil
        }
        do {
            let webAX = AXUIElementCreateApplication(12510)
            let webProvider = Hit()
            provider.replacements[webAX] = webProvider
            var node = capturedOwner
            node.element = UIElement(axElement: webAX, cache: UIElementCache(
                supportedAttributes: [], attributes: [:], transactionAttributes: nil))
            node.role = .webArea
            checkTrue(node.isInsideWebView)
            checkEqual(webProvider.bundleReads, 0)
            node.role = .button
            checkFalse(node.isInsideWebView)
            checkEqual(webProvider.bundleReads, 1)
            webProvider.testBundleIdentifier = "com.openai.atlas.beta"
            checkTrue(node.isInsideWebView)
            webProvider.testBundleIdentifier = "org.example.com.openai.atlas"
            checkFalse(node.isInsideWebView)
        }
        do {
            let initAX = AXUIElementCreateApplication(12511)
            let initProvider = Hit()
            provider.replacements[initAX] = initProvider
            let roleAttribute = UIElementAttribute("AXRole")
            initProvider.supportedAttributes = [roleAttribute]
            initProvider.attributes = [roleAttribute: partial("AXButton" as NSString)]
            initProvider.actionRead = { [.press] }
            initProvider.descriptionRead = { _ in "Press" }
            let node = TransformedUIElement(element: initAX)
            checkTrue(TransformedUIElement.role == nil)
            checkEqual(node.role, .button)
            checkEqual(node.actionDescriptions.map(\.action), [.press])
            var snapshot = node
            snapshot.actionDescriptions = []
            snapshot.isDisclosable = false
            checkEqual(snapshot.actions, Optional<[UIElementAction]>.some([]))
            let protocolNode: any UIElementProtocol = snapshot
            checkEqual(protocolNode.actions, [.press])
            checkEqual(protocolNode.actionDescriptions, [])
            var context = ownerContext(.informationalContext)
            let informational = TransformedUIElement(element: initAX, context: &context)
            checkEqual(informational.role, .button)
            checkTrue(informational.actionDescriptions.isEmpty)
            checkEqual(context.type, .informationalContext)
        }
        do {
            func rendered(_ identity: Int, _ id: Int?, _ path: IndexPath?) -> UIElementRender<Int> {
                UIElementRender(id: identity, elementID: id, text: "node",
                    detailText: nil, sourcePath: path, children: [])
            }
            let existing = rendered(1, 7, IndexPath(indexes: [0, 2]))
            let tree = UIElementRenderTree(isFocus: false, roots: [existing])
            var next = tree.nextAvailableElementIDIterator()
            var identities: [Int: Int] = [1: 3, 2: 6]
            let original = try resolveRevisionRenderIdentity(existing, identities: &identities, nextID: &next)
            checkEqual(original.elementID, 7)
            checkEqual(original.sourcePath, IndexPath(indexes: [0, 2]))
            let duplicate = rendered(1, nil, IndexPath(index: 4))
            checkEqual(try resolveRevisionRenderIdentity(duplicate, identities: &identities, nextID: &next).elementID, 7)
            let missing = rendered(3, nil, nil)
            do { _ = try resolveRevisionRenderIdentity(missing, identities: &identities, nextID: &next); unexpectedFailure() }
            catch is MissingRenderSourcePathError {}
            checkTrue(missing.elementID == nil); checkTrue(identities[3] == nil)
            let fresh = rendered(3, nil, IndexPath()) // empty path is present, not nil
            checkEqual(try resolveRevisionRenderIdentity(fresh, identities: &identities, nextID: &next).elementID, 8)
            checkEqual(fresh.elementID, 8)
            checkEqual(identities, [1: 7, 2: 6, 3: 8])
        }
        do {
            var full = capturedOwner; full.title = "full"
            var focused = full; focused.title = "focus"
            let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
            let fullTree = UIElementTree(items: [.init(element: full, subtree: leaf)], focusedElement: nil)
            let focusTree = UIElementTree(items: [.init(element: focused, subtree: leaf)], focusedElement: focused)
            let ids = UIElementTreeTable(values: [full.id: 42], paths: [42: IndexPath(index: 0)])
            checkEqual(revisionTreeItem(for: 42, ids: ids, tree: fullTree, focusTree: focusTree)?.element.title, "focus")
            checkEqual(revisionTreeItem(for: 42, ids: ids, tree: fullTree, focusTree: nil)?.element.title, "full")
            checkTrue(revisionTreeItem(for: 0, ids: ids, tree: fullTree, focusTree: focusTree) == nil)
            let invalid = UIElementTreeTable(values: [full.id: 42], paths: [42: IndexPath(index: 1)])
            let largerFull = UIElementTree(items: [.init(element: full, subtree: leaf), .init(element: full, subtree: leaf)], focusedElement: nil)
            checkTrue(revisionTreeItem(for: 42, ids: invalid, tree: largerFull, focusTree: focusTree) == nil)
            let noIdentity = UIElementTreeTable<AXUIElement, Int>(values: [:], paths: [42: IndexPath(index: 0)])
            checkTrue(revisionTreeItem(for: 42, ids: noIdentity, tree: fullTree, focusTree: nil) == nil)
            var other = focused
            other.element = UIElement(axElement: textAX, cache: focused.cache)
            let unrelatedFocus = UIElementTree(items: [.init(element: other, subtree: leaf)], focusedElement: other)
            checkEqual(revisionTreeItem(for: 42, ids: ids, tree: fullTree, focusTree: unrelatedFocus)?.element.title, "full")
        }
        do {
            func render(_ identity: Int, _ id: Int?, _ path: [Int], _ children: [UIElementRender<Int>] = []) -> UIElementRender<Int> {
                UIElementRender(id: identity, elementID: id, text: "node", detailText: nil,
                    sourcePath: IndexPath(indexes: path), children: children)
            }
            let child = render(2, 1, [0, 3])
            let main = UIElementRenderTree(isFocus: false, roots: [render(1, 0, [0], [child])])
            let focusChild = render(2, nil, [0])
            let added = render(3, nil, [1])
            let focus = UIElementRenderTree(isFocus: true, roots: [focusChild, added])
            let table = try makeRevisionTable(renderTree: main, focusRenderTree: focus)
            checkEqual(table.values, [1: 0, 2: 1, 3: 2])
            checkEqual(table.path(to: 1), IndexPath(index: 0))
            checkEqual(focusChild.elementID, 1); checkEqual(added.elementID, 2)
            checkEqual(child.sourcePath, IndexPath(indexes: [0, 3]))
            let withoutFocus = try makeRevisionTable(renderTree: main, focusRenderTree: nil)
            checkEqual(withoutFocus.path(to: 1), IndexPath(indexes: [0, 3]))
            let empty = UIElementRenderTree<Int>(isFocus: false, roots: [])
            checkTrue(try makeRevisionTable(renderTree: empty, focusRenderTree: nil).values.isEmpty)
            let first = render(4, nil, [0])
            let invalid = UIElementRender(id: 5, elementID: nil, text: "invalid", detailText: nil, sourcePath: nil, children: [])
            let partial = UIElementRenderTree(isFocus: false, roots: [first, invalid])
            do { _ = try makeRevisionTable(renderTree: partial, focusRenderTree: nil); unexpectedFailure() }
            catch is MissingRenderSourcePathError {}
            checkEqual(first.elementID, 1) // mutations before failure are not rolled back
            checkTrue(invalid.elementID == nil)
        }
        do {
            var source = capturedOwner; source.title = "full"
            var focus = source; focus.title = "focus"
            let empty = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
            let fullTree = UIElementTree(items: [.init(element: source, subtree: empty)], focusedElement: nil)
            let focusTree = UIElementTree(items: [.init(element: focus, subtree: empty)], focusedElement: focus)
            var calls: [String] = []
            var mainRender: UIElementRender<AXUIElement>?
            let revision = try UIElementTreeRevision.root(fullTree, focusTree: focusTree, lineageID: "lineage") { input in
                let name = input.items[0].element.title!
                calls.append(name)
                if name == "focus" { checkEqual(mainRender?.elementID, 0) }
                let node = UIElementRender(id: source.id, elementID: nil, text: name, detailText: nil,
                    sourcePath: IndexPath(index: 0), children: [])
                if name == "full" { mainRender = node }
                return UIElementRenderTree(isFocus: name == "focus", roots: [node])
            }
            checkEqual(calls, ["full", "focus"])
            checkEqual(revision.lineageID, "lineage")
            checkTrue(revision.previousRevision == nil)
            checkTrue(revision.lineageRootRevision === revision)
            checkEqual(revision.focusRenderTree?.roots[0].elementID, 0)
            checkEqual(revision.element(for: 0)?.title, "focus")
            checkTrue(revision.element(for: 1) == nil)
            enum RenderFailure: Error { case expected }
            calls = []
            do {
                _ = try UIElementTreeRevision.root(fullTree, focusTree: focusTree, lineageID: "failed") { input in
                    calls.append(input.items[0].element.title!)
                    if calls.count == 2 { throw RenderFailure.expected }
                    mainRender!.elementID = nil
                    return UIElementRenderTree(isFocus: false, roots: [mainRender!])
                }
                unexpectedFailure()
            } catch RenderFailure.expected {}
            checkEqual(calls, ["full", "focus"])
            checkEqual(mainRender?.elementID, 0)
        }
        do {
            let bytes = [UInt8](repeating: 0xff, count: 16)
            checkEqual(timestampUUID(Date(timeIntervalSince1970: 0), randomBytes: bytes).uuidString,
                "00000000-0000-7FFF-BFFF-FFFFFFFFFFFF")
            checkEqual(timestampUUID(Date(timeIntervalSince1970: 1.2349), randomBytes: bytes).uuidString,
                "00000000-04D2-7FFF-BFFF-FFFFFFFFFFFF")
            let empty = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
            var context = ownerContext(.fullUIContext)
            let revision = try UIElementTreeRevision.root(empty, context: &context)
            checkTrue(UUID(uuidString: revision.lineageID) != nil)
            checkEqual(revision.lineageID, revision.lineageID.lowercased())
            checkEqual(Array(revision.lineageID)[14], "7")
            checkTrue(revision.focusTree == nil); checkTrue(revision.focusRenderTree == nil)
            checkTrue(revision.renderTree.roots.isEmpty)
            checkEqual(context.type, .fullUIContext)
        }
        do {
            typealias Change = UIElementRenderDifference<Int>.Change
            let old = UIElementRender(id: 1, elementID: 9, text: "old", detailText: nil, sourcePath: nil, children: [])
            let new = UIElementRender(id: 2, elementID: 5, text: "new", detailText: nil, sourcePath: nil, children: [])
            let before = Change.Cursor(item: old, path: IndexPath(indexes: [0, 1]))
            let after = Change.Cursor(item: new, path: IndexPath(index: 0))
            Change.none(offset: 20, new: after, old: before).inheritElementID()
            checkEqual(new.elementID, 9); checkEqual(old.elementID, 9)
            new.elementID = 5; old.elementID = nil
            Change.update(offset: 0, new: after, old: before).inheritElementID()
            checkEqual(new.elementID, 5)
            old.elementID = 0
            Change.update(offset: 0, new: after, old: before).inheritElementID()
            checkEqual(new.elementID, 0)
            new.elementID = nil
            Change.insert(offset: 0, new: after).inheritElementID()
            Change.remove(offset: 0, old: before).inheritElementID()
            checkTrue(new.elementID == nil); checkEqual(old.elementID, 0)
            checkEqual(before.depth, 1); checkEqual(after.depth, 0)
        }
        do {
            typealias Difference = UIElementRenderDifference<Int>
            func node(_ id: Int, _ text: String, _ detail: String?, _ children: [UIElementRender<Int>] = []) -> UIElementRender<Int> {
                UIElementRender(id: id, elementID: id, text: text, detailText: detail,
                    sourcePath: nil, children: children)
            }
            let child = node(3, "child", nil)
            let old = Difference.Cursor(item: node(1, "é", "old", [child]), path: IndexPath(index: 2))
            let new = Difference.Cursor(item: node(1, "e\u{301}", "new"), path: IndexPath(index: 5))
            var pending: Deque<Difference.PendingChildren> = []
            switch Difference.matchedChange(offset: 7, new: new, old: old, pending: &pending) {
            case .none(let offset, let after, let before):
                checkEqual(offset, 7); checkTrue(after.item === new.item); checkTrue(before.item === old.item)
            default: unexpectedFailure()
            }
            checkEqual(pending.count, 1)
            let pair = pending.popFirst()!
            checkEqual(pair.old[0].path, IndexPath(indexes: [2, 0]))
            checkTrue(pair.old[0].item === child); checkTrue(pair.new.isEmpty)
            let changed = Difference.Cursor(item: node(1, "changed", nil), path: IndexPath(index: 0))
            switch Difference.matchedChange(offset: 8, new: changed, old: new, pending: &pending) {
            case .update(let offset, _, _): checkEqual(offset, 8)
            default: unexpectedFailure()
            }
            checkTrue(pending.isEmpty)
        }
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

        // Provider parameter read -> Mac dispatch -> concrete rich formatter.
        do {
            let text = NSAttributedString(string: "Hi 😀", attributes: [
                .accessibilityUnderline: 1, NSAttributedString.Key("AXStyleName"): "Heading, custom"])
            var node = capturedOwner
            node.role = .textArea
            node.value = text.string
            node.truncationRange = NSRange(location: 0, length: text.length)
            node.element = UIElement(axElement: ownerAX, cache: UIElementCache(
                supportedAttributes: [UIElementAttribute("AXRole")], attributes: [:], transactionAttributes: nil))
            var reads = 0, unknown: [String] = []
            ownerProvider.parameterRead = { attribute, _ in
                checkEqual(attribute, UIElementAttribute("AXAttributedStringForRange"))
                reads += 1
                return partial(text)
            }
            var context = ownerContext(.fullUIContext)
            let result = MacUIElementTreeTransformation.retrieveAttributedTextFromTextAreas.transform(
                item: associationItem(node, children: [targetA]), context: &context,
                rebuild: { _, _, _ in unexpectedFailure("rich branch must not rebuild") },
                providerTitle: { _ in unexpectedFailure() },
                owningBundleIdentifier: { _ in unexpectedFailure() },
                renderNode: { _, _ in unexpectedFailure() },
                reportUnknownAttributedStyle: { unknown.append($0) },
                reportAttributeError: { _ in unexpectedFailure() },
                reportUnexpectedNextLine: { unexpectedFailure() })
            switch result {
            case .transformed(let item):
                checkEqual(item.element.value, "## <u>Hi 😀</u>")
                checkEqual(item.element.transformedString?.sourceRange(ofMarkdownSubstring: "😀"), NSRange(location: 3, length: 2))
                checkTrue(item.element.attributedString === text)
                checkEqual(item.children.count, 1)
            default: unexpectedFailure("native dispatch must format parameterized rich text")
            }
            checkEqual(reads, 1)
            checkEqual(unknown, ["custom"])
            webCache(supported: [], requested: nil)
            var webReads: [String] = []
            ownerProvider.parameterSupport = { [] }
            ownerProvider.parameterRead = { attribute, _ in
                webReads.append(attribute.name as String)
                if attribute == UIElementAttribute("AXNextLineEndTextMarkerForTextMarker") { return nil }
                checkEqual(attribute, UIElementAttribute("AXAttributedStringForTextMarkerRange"))
                return partial(text)
            }
            context = ownerContext(.informationalContext)
            let webResult = MacUIElementTreeTransformation.retrieveAttributedTextFromWebAreas.transform(
                item: associationItem(composedWeb, children: [targetA]), context: &context,
                rebuild: { _, _, _ in unexpectedFailure() }, providerTitle: { _ in unexpectedFailure() },
                owningBundleIdentifier: { _ in unexpectedFailure() }, renderNode: { _, _ in unexpectedFailure() },
                reportUnknownAttributedStyle: { unknown.append($0) },
                reportAttributeError: { _ in unexpectedFailure() }, reportUnexpectedNextLine: { unexpectedFailure() })
            switch webResult {
            case .transformed(let item):
                checkEqual(item.element.value, "## <u>Hi 😀</u>")
                checkTrue(item.children.isEmpty)
                checkEqual(item.element.transformedString?.sourceRange(ofMarkdownSubstring: "😀"), NSRange(location: 3, length: 2))
            default: unexpectedFailure("web marker dispatch must use concrete rich formatter")
            }
            checkEqual(webReads, ["AXNextLineEndTextMarkerForTextMarker", "AXAttributedStringForTextMarkerRange"])
            checkEqual(unknown, ["custom", "custom"])
            ownerProvider.parameterRead = nil
            ownerProvider.parameterSupport = nil
        }

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
                reportUnknownAttributedStyle: { _ in unexpectedFailure("non-rich fixture has no attributed styles") },
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

        // Numeric AX decorations are not interchangeable truthiness checks.
        let underlineKey = NSAttributedString.Key.accessibilityUnderline
        let strikeKey = NSAttributedString.Key.accessibilityStrikethrough
        let baselineKey = NSAttributedString.Key.accessibilitySuperscript
        for (number, underline, strike, baseline) in [
            (NSNumber(value: 2), true, true, AttributedTextNumericStyles.Baseline.superscript),
            (NSNumber(value: -2), false, true, .subscript),
            (NSNumber(value: 0), false, false, .normal),
            (NSNumber(value: 0.5), false, true, .normal)
        ] {
            let style = AttributedTextNumericStyles(attributes: [underlineKey: number,
                strikeKey: number, baselineKey: number])
            checkEqual(style.underline, underline)
            checkEqual(style.strikethrough, strike)
            checkEqual(style.baseline, baseline)
        }
        let emptyStyles = AttributedTextNumericStyles(attributes: [:])
        checkEqual(AttributedTextNumericStyles(attributes: [underlineKey: "1",
            strikeKey: "true" as NSString, baselineKey: NSNull()]), emptyStyles)

        let fontNameKey = NSAccessibility.FontAttributeKey.fontName.rawValue
        let fontSizeKey = NSAccessibility.FontAttributeKey.fontSize.rawValue
        let fontFamilyKey = NSAccessibility.FontAttributeKey.fontFamily.rawValue
        var resolvedFonts = 0
        let fontStyle = AttributedTextFontStyles(attributes: [.accessibilityFont: [
            fontNameKey: "Fixture", fontSizeKey: 13.5, fontFamilyKey: 42, "AXFontBold": false
        ]]) { descriptor, size in
            resolvedFonts += 1
            checkEqual(descriptor[.name] as? String, "Fixture")
            checkEqual(descriptor[.family] as? Int, 42)
            checkEqual(size, 13.5)
            return [.traitBold, .traitItalic]
        }
        checkEqual(resolvedFonts, 1)
        checkTrue(fontStyle.bold && fontStyle.italic)
        let explicitBold = AttributedTextFontStyles(attributes: [.accessibilityFont: [
            fontNameKey: "Fixture", fontSizeKey: "13", "AXFontBold": true
        ]]) { _, _ in unexpectedFailure("invalid size must not resolve font") }
        checkTrue(explicitBold.bold)
        checkFalse(explicitBold.italic)
        let failedFont = AttributedTextFontStyles(attributes: [.accessibilityFont: [
            fontNameKey: "Fixture", fontSizeKey: 12.0, "AXFontBold": true
        ]]) { _, _ in nil }
        checkTrue(failedFont.bold)
        checkFalse(failedFont.italic)
        let noFont = AttributedTextFontStyles(attributes: [.accessibilityFont: "invalid"])
        checkFalse(noFont.bold || noFont.italic)
        let invalidBold = AttributedTextFontStyles(attributes: [.accessibilityFont: ["AXFontBold": "true"]])
        checkFalse(invalidBold.bold || invalidBold.italic)
        // Exercise the actual AppKit/CoreText resolver with a system-provided font.
        let systemBold = NSFont.boldSystemFont(ofSize: 13)
        let realFont = AttributedTextFontStyles(attributes: [.accessibilityFont: [
            fontNameKey: systemBold.fontName, fontSizeKey: 13.0
        ]])
        checkTrue(realFont.bold)

        do {
        let attributedLinkAX = AXUIElementCreateApplication(12519)
        let sourceLink = AttributedTextSourceRun(text: "  😀[x] ", range: NSRange(location: 10, length: 8))
        var linkContext = ownerContext(.fullUIContext)
        linkContext.urlShortener = UIElementURLShortener(configuration: .init(
            individualLimit: nil, totalLimit: nil, includeQuery: true, includeFragment: true, baseHost: nil))
        let targetLinkURL = URL(string: "https://example.invalid/path")!
        func attributedLinkNode(_ roleName: String, _ url: AnyObject?) -> UIElement {
            var attributes: [UIElementAttribute: AXPartialValue] = [UIElementAttribute("AXRole"): partial(roleName as NSString)]
            if let url { attributes[UIElementAttribute("AXURL")] = partial(url) }
            return UIElement(axElement: attributedLinkAX, cache: UIElementCache(supportedAttributes: [],
                attributes: attributes, transactionAttributes: nil))
        }
        let mappedLink = transformAttributedTextLink(sourceLink, attributes: [.accessibilityLink: attributedLinkAX],
            context: &linkContext, makeElement: { identity in
                checkTrue(CFEqual(identity, attributedLinkAX))
                return attributedLinkNode("AXLink", targetLinkURL as NSURL)
            })
        checkEqual(mappedLink.text, "[😀[x]](example.invalid/path)")
        checkEqual(Array(mappedLink.sourceOffsets.prefix(6)), [nil, 12, 13, 14, 15, 16])
        checkTrue(mappedLink.sourceOffsets.dropFirst(6).allSatisfy { $0 == nil })
        let imageLink = transformAttributedTextLink(sourceLink, attributes: [.accessibilityLink: attributedLinkAX],
            context: &linkContext, makeElement: { _ in attributedLinkNode("AXImage", targetLinkURL as NSURL) })
        checkEqual(imageLink.text, sourceLink.text)
        checkEqual(imageLink.sourceOffsets, sourceLink.sourceOffsets)
        let stringURLLink = transformAttributedTextLink(sourceLink, attributes: [.accessibilityLink: attributedLinkAX],
            context: &linkContext, makeElement: { _ in attributedLinkNode("AXLink", "https://example.invalid/ignored" as NSString) })
        checkEqual(stringURLLink.text, sourceLink.text)
        let noLink = transformAttributedTextLink(sourceLink, attributes: [:], context: &linkContext,
            makeElement: { _ in unexpectedFailure("absent link must not create an element") })
        checkEqual(noLink.text, sourceLink.text)
        let whitespaceRun = AttributedTextSourceRun(text: " \n", range: NSRange(location: 1, length: 2))
        let emptyLabelLink = transformAttributedTextLink(whitespaceRun, attributes: [.accessibilityLink: attributedLinkAX],
            context: &linkContext, makeElement: { _ in attributedLinkNode("AXLink", targetLinkURL as NSURL) })
        checkEqual(emptyLabelLink.text, "[](example.invalid/path)")
        checkTrue(emptyLabelLink.sourceOffsets.allSatisfy { $0 == nil })

        }
        do {
            let attachmentAX = AXUIElementCreateApplication(12520)
            func attachmentNode(_ role: String = "AXGroup", _ roleDescription: String? = nil,
                _ description: String? = nil, _ url: URL? = nil) -> UIElement {
                var values: [UIElementAttribute: AXPartialValue] = [UIElementAttribute("AXRole"): partial(role as NSString)]
                for (key, value) in [("AXRoleDescription", roleDescription), ("AXDescription", description)] {
                    if let value { values[UIElementAttribute(key)] = partial(value as NSString) }
                }
                if let url { values[UIElementAttribute("AXURL")] = partial(url as NSURL) }
                return UIElement(axElement: attachmentAX, cache: UIElementCache(supportedAttributes: [], attributes: values, transactionAttributes: nil))
            }
            var context = ownerContext(.fullUIContext)
            for (text, expected) in [("", "[attachment: cached]"), ("\u{fffc}", "[attachment: cached]"),
                ("label", "[attachment: label]"), (" ", "[attachment:  ]"),
                ("a\nb", "[attachment: cached] a\nb"), ("a\tb", "[attachment: a\tb]")] {
                let input = AttributedTextSourceRun(text: text, range: NSRange(location: 20, length: text.utf16.count))
                let result = transformAttributedTextAttachment(input, attributes: [.accessibilityAttachment: attachmentAX],
                    context: &context, makeElement: { _ in attachmentNode("AXGroup", nil, "cached") })
                checkEqual(result.text, expected)
                if text.contains("\n") {
                    checkEqual(Array(result.sourceOffsets.suffix(text.utf16.count)), input.sourceOffsets)
                } else { checkTrue(result.sourceOffsets.allSatisfy { $0 == nil }) }
            }
            let input = AttributedTextSourceRun(text: " 😀 ", range: NSRange(location: 30, length: 4))
            let imageURL = URL(string: "https://example.invalid/image")!
            let image = transformAttributedTextAttachment(input, attributes: [.accessibilityAttachment: attachmentAX],
                context: &context, makeElement: { _ in attachmentNode("AXImage", "image", "ignored", imageURL) },
                shorten: { url, isImage, _ in
                    checkEqual(url, imageURL); checkTrue(isImage); return "fixture-target"
                })
            checkEqual(image.text, "![😀](fixture-target)")
            checkEqual(Array(image.sourceOffsets.prefix(4)), [nil, nil, 31, 32])
            let suppressedImage = transformAttributedTextAttachment(input, attributes: [.accessibilityAttachment: attachmentAX],
                context: &context, makeElement: { _ in attachmentNode("AXImage", "image", "ignored", imageURL) })
            checkEqual(suppressedImage.text, "[image:  😀 ]")
            let absent = transformAttributedTextAttachment(input, attributes: [:], context: &context,
                makeElement: { _ in unexpectedFailure("missing attachment must not resolve") })
            checkEqual(absent.sourceOffsets, input.sourceOffsets)
        }

        do {
            var unknownStyles: [String] = []
            let formats = attributedTextNamedFormats([
                NSAttributedString.Key("AXBlockQuoteLevel"): NSNumber(value: 2),
                NSAttributedString.Key("AXStyleName"): "Title, Fixed width, Body, Collapsed, Title, mystery, Expanded"
            ], reportUnknownStyle: { unknownStyles.append($0) })
            checkEqual(formats, [.blockQuote(2), .heading(1), .codeBlock, .collapsed])
            checkEqual(unknownStyles, ["mystery"])
            let exactSplit = attributedTextNamedFormats([NSAttributedString.Key("AXStyleName"): "Title,Heading"],
                reportUnknownStyle: { unknownStyles.append($0) })
            checkTrue(exactSplit.isEmpty)
            checkEqual(unknownStyles.last, "Title,Heading")
            checkTrue(attributedTextNamedFormats([NSAttributedString.Key("AXBlockQuoteLevel"): -1],
                reportUnknownStyle: { _ in unexpectedFailure() }).isEmpty)
            let boundaries = attributedTextFormatBoundaries(
                closing: [.italic, .bold, .heading(1), .underline, .codeBlock, .collapsed],
                opening: [.bold, .heading(2), .blockQuote(1), .italic])
            checkEqual(boundaries.closing, "***</u>\n```\n</summary>(collapsed content is hidden)</details>")
            checkEqual(boundaries.opening, "> ## ***")
            let listBoundaries = attributedTextFormatBoundaries(closing: [.list(level: 1, index: 4, prefix: "4.")],
                opening: [.list(level: 1, index: 4, prefix: "4."), .underline, .strikethrough, .superscript, .subscript])
            checkEqual(listBoundaries.closing, "")
            checkEqual(listBoundaries.opening, "    4. <u>~~<sup><sub>")
            let blocks = attributedTextFormatBoundaries(closing: [.superscript, .subscript, .strikethrough],
                opening: [.bold, .codeBlock, .collapsed])
            checkEqual(blocks.closing, "</sup></sub>~~")
            checkEqual(blocks.opening, "<details><summary>\n```\n**")
        }

        do {
            func list(_ prefix: String, _ index: NSNumber = 7) -> AttributedTextFormat? {
                attributedTextListFormat([.accessibilityListItemLevel: NSNumber(value: 2),
                    .accessibilityListItemPrefix: NSAttributedString(string: prefix),
                    .accessibilityListItemIndex: index])
            }
            checkEqual(list("checklist item, incomplete"), .list(level: 2, index: 7, prefix: "* [ ]"))
            checkEqual(list("checklist item, completed"), .list(level: 2, index: 7, prefix: "* [x]"))
            for prefix in ["", "•", "a)", " 1.", "Checklist item, completed"] {
                checkEqual(list(prefix), .list(level: 2, index: 7, prefix: "*"))
            }
            for prefix in ["1.", "９)", "Ⅷ", "½"] {
                checkEqual(list(prefix), .list(level: 2, index: 7, prefix: "7."))
            }
            // Native uses NSNumber.stringValue for the marker, integerValue for identity.
            checkEqual(list("1.", 2.5), .list(level: 2, index: 2, prefix: "2.5."))
            checkTrue(attributedTextListFormat([:]) == nil)
            checkTrue(attributedTextListFormat([.accessibilityListItemLevel: 1,
                .accessibilityListItemPrefix: "1.", .accessibilityListItemIndex: 1]) == nil)
            checkTrue(attributedTextListFormat([.accessibilityListItemLevel: 1,
                .accessibilityListItemPrefix: NSAttributedString(string: "1.")]) == nil)
            checkEqual(attributedTextListFormat([.accessibilityListItemLevel: -1,
                .accessibilityListItemPrefix: NSAttributedString(string: "•"),
                .accessibilityListItemIndex: -2]), .list(level: -1, index: -2, prefix: "*"))
        }

        do {
            let original = AttributedTextSourceRun(text: "😀\ne\u{301}\r\nZ\u{2028}\n", range: NSRange(location: 20, length: 10))
            let marker = AttributedTextSourceRun(text: "</u>\n<u>", sourceOffsets: Array(repeating: nil, count: 8))
            let replaced = original.replacingLineFeeds(with: marker)
            checkEqual(replaced.text, "😀</u>\n<u>e\u{301}\r\nZ\u{2028}</u>\n<u>")
            checkEqual(replaced.sourceOffsets, [20, 21] + Array(repeating: nil, count: 8)
                + [23, 24, 25, 26, 27, 28] + Array(repeating: nil, count: 8))
            let mapped = AttributedTextSourceRun(text: "x", sourceOffsets: [100])
            let consecutive = AttributedTextSourceRun(text: "\n\n", range: NSRange(location: 0, length: 2))
            checkEqual(consecutive.replacingLineFeeds(with: mapped).sourceOffsets, [100, 100])
            let empty = AttributedTextSourceRun(text: "", sourceOffsets: [])
            checkEqual(consecutive.replacingLineFeeds(with: empty).text, "")
            checkEqual(empty.replacingLineFeeds(with: marker).sourceOffsets, [])
            let unchanged = AttributedTextSourceRun(text: "\r\n\r\u{85}\u{2028}\u{2029}", range: NSRange(location: 3, length: 6))
            checkEqual(unchanged.replacingLineFeeds(with: marker).sourceOffsets, unchanged.sourceOffsets)
            checkEqual(unchanged.replacingLineFeeds(with: marker).text, unchanged.text)
        }

        do {
            var state = AttributedTextFormatState()
            let first = state.transition(to: [.underline, .bold, .italic, .bold])
            checkEqual(Array(first.opening), [.underline, .bold, .italic])
            checkTrue(first.closing.isEmpty)
            let changed = state.transition(to: [.italic, .bold, .superscript])
            checkEqual(Array(changed.closing), [.underline])
            checkEqual(Array(changed.opening), [.superscript])
            checkEqual(Array(state.active), [.bold, .italic, .superscript])
            let reordered = state.transition(to: [.superscript, .italic, .bold])
            checkTrue(reordered.opening.isEmpty)
            checkTrue(reordered.closing.isEmpty)
            checkEqual(Array(state.active), [.bold, .italic, .superscript])
            let terminal = state.transition(to: [])
            checkEqual(Array(terminal.closing), [.bold, .italic, .superscript])
            checkTrue(state.active.isEmpty)
            let oldList = AttributedTextFormat.list(level: 1, index: 2, prefix: "*")
            let nextList = AttributedTextFormat.list(level: 1, index: 3, prefix: "*")
            _ = state.transition(to: [oldList, .heading(1)])
            let listChange = state.transition(to: [nextList, .heading(2)])
            checkEqual(Array(listChange.closing), [oldList, .heading(1)])
            checkEqual(Array(listChange.opening), [nextList, .heading(2)])
            // Exercise OrderedSet's hash-backed storage as well as its small-set path.
            state = AttributedTextFormatState()
            let many = (1...100).map { AttributedTextFormat.heading($0) }
            _ = state.transition(to: many)
            let reduced = state.transition(to: Array(many.reversed().prefix(50)))
            checkEqual(Array(reduced.closing), Array(many.prefix(50)))
            checkTrue(reduced.opening.isEmpty)
            checkEqual(Array(state.active), Array(many.suffix(50)))
        }

        do {
            var renderer = AttributedTextBoundaryRenderer()
            func run(_ text: String, _ start: Int) -> AttributedTextSourceRun {
                AttributedTextSourceRun(text: text, range: NSRange(location: start, length: text.utf16.count))
            }
            renderer.append(run("Hello", 0), formats: [.bold])
            renderer.append(run(" world", 5), formats: [.bold, .italic])
            renderer.append(run("", 11), formats: [])
            checkEqual(renderer.output.description, "**Hello* world***")
            checkEqual(renderer.output.sourceRange(ofMarkdownSubstring: "Hello"), NSRange(location: 0, length: 5))
            checkEqual(renderer.output.sourceRange(ofMarkdownSubstring: " world"), NSRange(location: 5, length: 6))
            renderer = AttributedTextBoundaryRenderer()
            renderer.append(run("😀\nB\n", 30), formats: [.heading(1), .underline])
            renderer.append(run("C", 35), formats: [.heading(1), .underline])
            renderer.append(run("", 36), formats: [])
            checkEqual(renderer.output.description, "# <u>😀</u>\n# <u>B</u>\n# <u>C</u>")
            checkEqual(renderer.output.sourceRange(ofMarkdownSubstring: "😀"), NSRange(location: 30, length: 2))
            checkEqual(renderer.output.sourceRange(ofMarkdownSubstring: "C"), NSRange(location: 35, length: 1))
            renderer = AttributedTextBoundaryRenderer()
            renderer.append(run("A\n", 0), formats: [.bold])
            renderer.append(run("", 2), formats: [])
            checkEqual(renderer.output.description, "**A**\n")
            checkTrue(renderer.output.sourceRange(ofMarkdownSubstring: "\n") == nil)
            renderer = AttributedTextBoundaryRenderer()
            renderer.append(run("A\r\nB", 0), formats: [.heading(1)])
            renderer.append(run("", 4), formats: [])
            checkEqual(renderer.output.description, "# A\r\nB")
            checkEqual(renderer.output.sourceRange(ofMarkdownSubstring: "\r\n"), NSRange(location: 1, length: 2))
        }

        do {
            let override = AttributedTextFontStyles(attributes: [.accessibilityFont: [
                NSAccessibility.FontAttributeKey.fontName.rawValue: "fixture",
                NSAccessibility.FontAttributeKey.fontSize.rawValue: 12.0,
                "AXFontBold": true]], resolveTraits: { _, _ in [.traitItalic] })
            checkEqual(override.orderedFormats, [.italic, .bold])
            let traits = AttributedTextFontStyles(attributes: [.accessibilityFont: [
                NSAccessibility.FontAttributeKey.fontName.rawValue: "fixture",
                NSAccessibility.FontAttributeKey.fontSize.rawValue: 12.0,
                "AXFontBold": true]], resolveTraits: { _, _ in [.traitItalic, .traitBold] })
            checkEqual(traits.orderedFormats, [.bold, .italic])
            var context = ownerContext(.fullUIContext)
            let input = NSMutableAttributedString(string: "Title\n😀 item")
            input.addAttributes([NSAttributedString.Key("AXStyleName"): "Title",
                .accessibilityUnderline: NSNumber(value: 1)], range: NSRange(location: 0, length: 6))
            input.addAttributes([.accessibilityListItemLevel: 0,
                .accessibilityListItemPrefix: NSAttributedString(string: "checklist item, completed"),
                .accessibilityListItemIndex: 1], range: NSRange(location: 6, length: 7))
            let result = renderNativeAttributedText(input, context: &context,
                reportUnknownStyle: { _ in unexpectedFailure() }, makeElement: { _ in unexpectedFailure() })
            checkEqual(result.description, "# <u>Title</u>\n* [x] 😀 item")
            checkEqual(result.sourceRange(ofMarkdownSubstring: "😀 item"), NSRange(location: 6, length: 7))
            checkTrue(result.sourceRange(ofMarkdownSubstring: "* [x]") == nil)
            let ax = AXUIElementCreateApplication(12521)
            let url = URL(string: "https://example.invalid/path")!
            let node = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [
                UIElementAttribute("AXRole"): partial("AXLink" as NSString),
                UIElementAttribute("AXURL"): partial(url as NSURL)], transactionAttributes: nil))
            context.urlShortener = UIElementURLShortener(configuration: .init(
                individualLimit: nil, totalLimit: nil, includeQuery: true, includeFragment: true, baseHost: nil))
            let linkText = NSAttributedString(string: " A ", attributes: [.accessibilityLink: ax, .accessibilityUnderline: 1])
            let linkResult = renderNativeAttributedText(linkText, context: &context,
                reportUnknownStyle: { _ in unexpectedFailure() }, makeElement: { _ in node })
            checkEqual(linkResult.description, "<u>[A](example.invalid/path)</u>")
            checkEqual(linkResult.sourceRange(ofMarkdownSubstring: "A"), NSRange(location: 1, length: 1))
            let combined = NSAttributedString(string: " A ", attributes: [.accessibilityLink: ax, .accessibilityAttachment: ax])
            let combinedResult = renderNativeAttributedText(combined, context: &context,
                reportUnknownStyle: { _ in unexpectedFailure() }, makeElement: { _ in node })
            checkEqual(combinedResult.description, "[attachment: [A](example.invalid/path)]")
            checkTrue(combinedResult.sourceRange(ofMarkdownSubstring: "A") == nil)
            var unknown: [String] = []
            let unknownText = NSAttributedString(string: "plain", attributes: [NSAttributedString.Key("AXStyleName"): "custom"])
            checkEqual(renderNativeAttributedText(unknownText, context: &context,
                reportUnknownStyle: { unknown.append($0) }).description, "plain")
            checkEqual(unknown, ["custom"])
            checkEqual(renderNativeAttributedText(NSAttributedString(string: ""), context: &context,
                reportUnknownStyle: { _ in unexpectedFailure() }).description, "")
        }

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
        let windowConformers: [any WindowUIElementProtocol] = [
            WindowUIElement(axElement: targetAX, cache: target.cache),
            SheetUIElement(axElement: targetAX, cache: target.cache),
            MenuUIElement(axElement: targetAX, cache: target.cache),
        ]
        for wrapped in windowConformers {
            checkTrue(CFEqual(wrapped.id, targetAX))
            checkEqual(wrapped.role, .window) // instance cache, not static type role
            checkTrue(wrapped.isEnabled)
            checkTrue(wrapped.presentationActions.isEmpty)
            try wrapped.perform(action: .press)
        }
        checkEqual(targetMock.performed, Array(repeating: .press, count: 6))
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
        do {
            let roles: [UIElementRole] = [.button, .checkBox, .menu, .menuBar, .menuBarItem,
                .menuButton, .menuItem, .radioGroup, .row, .generic, .group, .image]
            let present = ["custom", "custom", "custom", "custom", "", "custom", "", "", "row", "custom", "container", "custom"]
            let empty = ["", "", "", "", "", "", "", "", "row", "element", "container", ""]
            let missing = ["unknown", "unknown", "menu", "menu bar", "", "unknown", "", "", "unknown", "unknown", "unknown", "unknown"]
            for (index, role) in roles.enumerated() {
                for type in UIElementContextType.allCases {
                    checkEqual(accessibilityRoleDescription(role: role, roleDescription: "custom", contextType: type), present[index])
                    checkEqual(accessibilityRoleDescription(role: role, roleDescription: "", contextType: type), empty[index])
                    let fallback = type == .informationalContext && missing[index] == "unknown" ? "" : missing[index]
                    checkEqual(accessibilityRoleDescription(role: role, roleDescription: nil, contextType: type), fallback)
                }
            }
            checkEqual(accessibilityRoleDescription(role: UIElementRole.generic, roleDescription: "  ", contextType: .fullUIContext), "  ")
        }
        do {
            let button = UIElementRole.button
            checkEqual(accessibilityStateDescription(role: button, contextType: .fullUIContext), "")
            for type in UIElementContextType.allCases {
                checkEqual(accessibilityStateDescription(role: button, contextType: type, isSelectable: true), type == .fullUIContext ? "(selectable)" : "")
                checkEqual(accessibilityStateDescription(role: button, contextType: type, isSelectable: true, isSelected: true), "(selected)")
                checkEqual(accessibilityStateDescription(role: button, contextType: type, isEnabled: false), type == .informationalContext ? "" : "(disabled)")
                for role in [UIElementRole.group, .staticText] {
                    checkEqual(accessibilityStateDescription(role: role, contextType: type, isEnabled: false), "")
                }
            }
            checkEqual(accessibilityStateDescription(role: button, contextType: .fullUIContext,
                isSelectable: true, isEnabled: false, isDisclosable: true, valueTypeName: "number",
                isValueSettable: true, isSentByCurrentUser: true), "(selectable, disabled, collapsed, settable, number, sent by me)")
            checkEqual(accessibilityStateDescription(role: button, contextType: .informationalContext,
                isSelected: true, isEnabled: false, isDisclosable: true, isDisclosing: true,
                valueTypeName: "string", isValueSettable: true), "(selected, expanded, settable)")
            checkEqual(accessibilityStateDescription(role: button, contextType: .fullUIContext,
                isDisclosing: true, isValueSettable: true), "")
            checkEqual(accessibilityStateDescription(role: button, contextType: .fullUIContext,
                valueTypeName: "", isValueSettable: true), "(settable, )")
            checkEqual(accessibilityStateDescription(role: button, contextType: .fullUIContext,
                valueTypeName: "number", isValueSettable: false), "")
        }
        do {
            checkTrue(accessibilityIndexRangeText(nil) == nil)
            checkTrue(accessibilityIndexRangeText(0...0) == nil)
            checkTrue(accessibilityIndexRangeText(3...3) == nil)
            checkTrue(accessibilityIndexRangeText(-1...5) == nil)
            checkTrue(accessibilityIndexRangeText(Int.min ... -1) == nil)
            checkEqual(accessibilityIndexRangeText(0...1), "0-1")
            checkEqual(accessibilityIndexRangeText(3...8), "3-8")
            checkEqual(accessibilityIndexRangeText(0...Int.max), "0-" + String(Int.max))
        }
        do {
            for count in [0, 1, 100, 101, 102] {
                for character in ["a", "👩‍💻", "e\u{301}"] {
                    let text = String(repeating: character, count: count)
                    let entry = AccessibilityContentEntry(label: nil, text: text)
                    checkTrue(entry.label == nil)
                    checkEqual(entry.text, text)
                    checkEqual(entry.isLongOrMultiline, count >= 101)
                }
            }
            for text in ["\n", "a\nb"] {
                checkTrue(AccessibilityContentEntry(label: "", text: text).isLongOrMultiline)
            }
            for text in ["a\r\nb", "\r", "\u{85}", "\u{2028}", "\u{2029}"] {
                checkFalse(AccessibilityContentEntry(label: "Description", text: text).isLongOrMultiline)
            }
            let range = AccessibilityContentEntry.indexRange(label: "Rows", range: 2...9)!
            checkEqual(range.label, "Rows")
            checkEqual(range.text, "2-9")
            checkFalse(range.isLongOrMultiline)
            checkTrue(AccessibilityContentEntry.indexRange(label: "Columns", range: 2...2) == nil)
        }
        do {
            var content = AccessibilityContentAccumulator()
            content.appendUnique(.init(label: nil, text: "same"))
            content.appendUnique(.init(label: "Description", text: "same"))
            content.appendUnique(.init(label: "Value", text: " same "))
            content.appendUnique(.init(label: "Value", text: "Same"))
            content.appendUnique(.init(label: "first", text: "é"))
            content.appendUnique(.init(label: "second", text: "e\u{301}"))
            checkEqual(content.entries.map(\.text), ["same", " same ", "Same", "é"])
            checkTrue(content.entries[0].label == nil)
            checkEqual(content.entries[3].label, "first")
            content.appendUnique(.init(label: "Empty", text: ""))
            checkTrue(content.contains(text: "")) // no helper-level trimming/filtering
            content.appendIndexRange(label: "Rows", range: 0...2)
            content.appendIndexRange(label: "Columns", range: 0...2)
            checkFalse(content.contains(text: "0-2"))
            content.appendUnique(.init(label: "Value", text: "0-2"))
            content.appendIndexRange(label: "Rows", range: 0...2)
            checkEqual(content.entries.suffix(4).map(\.label), ["Rows", "Columns", "Value", "Rows"])
            checkTrue(content.contains(text: "0-2"))
        }
        do {
            var roleReads = 0
            var descriptionReads = 0
            func readRole(_ value: UIElementRole) -> UIElementRole { roleReads += 1; return value }
            func readDescription(_ value: Bool) -> Bool { descriptionReads += 1; return value }
            for context in UIElementContextType.allCases {
                for role: UIElementRole in [.button, .checkBox, .menuButton, .menu, .menuBar,
                                           .menuBarItem, .menuItem, .radioGroup, .row, .generic, .group] {
                    for descriptive in [false, true] {
                        roleReads = 0; descriptionReads = 0
                        let result = shouldCollectAccessibilityContent(contextType: context,
                            role: readRole(role), hasDescriptiveAttributes: readDescription(descriptive))
                        let conditional = [UIElementRole.button, .checkBox, .menuButton].contains(role)
                        let suppressed = [UIElementRole.menu, .menuBar].contains(role)
                        checkEqual(result, context != .informationalContext || (!suppressed && (!conditional || descriptive)))
                        checkEqual(roleReads, context == .informationalContext ? 1 : 0)
                        checkEqual(descriptionReads, context == .informationalContext && conditional ? 1 : 0)
                    }
                }
            }
        }
        do {
            var content = AccessibilityContentAccumulator()
            content.appendSecondaryActions([
                .init(kind: .press, description: "Open"),
                .init(kind: .showMenu, description: "Menu"),
                .init(kind: .scrollToVisible, description: "Reveal"),
                .init(kind: .other, description: "Add comment"),
                .init(kind: .other, description: "Remove unused rows"),
                .init(kind: .other, description: "Remove unused columns"),
                .init(kind: .other, description: "Remove unused rows and columns"),
            ])
            checkTrue(content.entries.isEmpty)
            content.appendUnique(.init(label: nil, text: "Open"))
            content.appendSecondaryActions([
                .init(kind: .other, description: "Open"),
                .init(kind: .other, description: "Open"),
                .init(kind: .other, description: "add comment"),
                .init(kind: .other, description: ""),
            ])
            checkEqual(content.entries.last?.text, "Open, Open, add comment, ")
            checkEqual(content.entries.last?.label, "Secondary Actions")
            // Only the joined payload is deduplicated against prior content.
            content.appendSecondaryActions([.init(kind: .other, description: "Open")])
            checkEqual(content.entries.count, 2)
            var empty = AccessibilityContentAccumulator()
            empty.appendSecondaryActions([.init(kind: .other, description: "")])
            checkEqual(formatAccessibilityContent(empty.entries), "Secondary Actions: ")
        }
        do {
            var content = AccessibilityContentAccumulator()
            for identifier: String? in [nil, "", "_", "_private", "NS", "NSInternal"] {
                content.appendIdentifier(identifier)
            }
            checkTrue(content.entries.isEmpty)
            content.appendUnique(.init(label: "Description", text: "existing"))
            content.appendIdentifier("existing")
            checkEqual(content.entries.count, 1)
            for identifier in ["nsInternal", " NSInternal", "_\u{301}private", "some_NS", " "] {
                content.appendIdentifier(identifier)
            }
            // Swift hasPrefix matches Characters, not bytes; underscore plus
            // combining acute is not the standalone underscore Character.
            checkEqual(content.entries.dropFirst().map(\.text), ["nsInternal", " NSInternal", "_\u{301}private", "some_NS", " "])
            checkTrue(content.entries.dropFirst().allSatisfy { $0.label == "ID" })
        }
        do {
            var node = capturedOwner
            node.element = UIElement(axElement: ownerAX, cache: UIElementCache(
                supportedAttributes: [], attributes: [:], transactionAttributes: nil))
            node.role = .group
            node.title = "Title"; node.description = "Title"
            node.url = nil; node.help = "Help text"; node.value = "false"
            node.valueDescription = "Details text"; node.placeholderValue = "Placeholder text"
            node.identifier = "public-id"
            node.actionDescriptions = [.init(.expand, description: "Expand")]
            var context = ownerContext(.fullUIContext)
            checkEqual(node.accessibilityContentDescription(context: &context),
                "Title, Help: Help text, Value: false, Details: Details text, Placeholder: Placeholder text, ID: public-id, Secondary Actions: Expand")
            node.title = nil; node.description = ""; node.help = nil; node.value = nil
            node.valueDescription = nil; node.placeholderValue = nil; node.identifier = nil
            node.actionDescriptions = []
            checkEqual(node.accessibilityContentDescription(context: &context), "")
            node.value = " "
            checkEqual(node.accessibilityContentDescription(context: &context), " ")
            node.value = nil
            node.url = URL(string: "https://example.com/path?q=1#part")!
            var expectedShortener = context.urlShortener
            let expectedURL = expectedShortener.trim(url: node.url!, isImage: false)!
            checkEqual(node.accessibilityContentDescription(context: &context), expectedURL)
            node.role = .menu
            context.type = .informationalContext
            checkEqual(node.accessibilityContentDescription(context: &context), "")
            node.url = nil; node.role = .button; node.roleDescription = "button"
            node.title = "Save"; node.isEnabled = false; node.isSelectable = false
            node.isSelected = false; node.isDisclosable = false; node.valueTypeName = nil
            context.type = .fullUIContext
            checkEqual(node.accessibilityDescription(context: &context), "button (disabled) Save")
            let readable: any LMReadableElement = node
            checkEqual(try readable.lmReadableDescription(for: &context), "button (disabled) Save")
            let empty = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
            let tree = UIElementTree(items: [.init(element: node, subtree: empty)], focusedElement: nil)
            let rendered = try tree.render(with: &context)
            checkTrue(rendered.roots[0].elementID == nil)
            checkEqual(rendered.roots[0].sourcePath, IndexPath(index: 0))
            rendered.setElementIDs()
            checkEqual(rendered.lines(indent: " ", options: []), ["0 button (disabled) Save"])
            node.role = .menu; node.roleDescription = nil
            context.type = .informationalContext
            checkEqual(node.accessibilityDescription(context: &context), "menu")
            node.role = .group; node.roleDescription = nil; node.title = " "
            node.isEnabled = true
            checkEqual(node.accessibilityDescription(context: &context), " ")
        }
        do {
            var reads: [String] = []
            func flag(_ key: String, _ value: Bool) -> Bool { reads.append(key); return value }
            func role() -> UIElementRole { reads.append("role"); return .button }
            let rendered = accessibilityStateDescription(role: role(), contextType: .fullUIContext,
                isSelectable: flag("selectable", true), isSelected: flag("selected", false),
                isEnabled: flag("enabled", true), isDisclosable: flag("disclosable", false),
                isDisclosing: flag("disclosing", true), valueTypeName: nil,
                isValueSettable: flag("settable", true), isSentByCurrentUser: flag("sent", false))
            checkEqual(rendered, "(selectable)")
            checkEqual(reads, ["selectable", "selected", "selected", "enabled", "disclosable", "sent"])
        }
        do {
            checkEqual(formatAccessibilityContent([]), "")
            checkEqual(formatAccessibilityContent([.init(label: "Description", text: "only")]), "only")
            checkEqual(formatAccessibilityContent([.init(label: "", text: "only")]), "only")
            checkEqual(formatAccessibilityContent([.init(label: "Secondary Actions", text: "More")]), "Secondary Actions: More")
            checkEqual(formatAccessibilityContent([.init(label: "secondary actions", text: "More")]), "More")
            let long = String(repeating: "x", count: 101)
            let entries: [AccessibilityContentEntry] = [.init(label: "Long", text: long),
                .init(label: nil, text: "title"), .init(label: "Multiline", text: "a\nb"),
                .init(label: "", text: "empty label"), .init(label: "Last", text: "short")]
            checkEqual(formatAccessibilityContent(entries), "title, : empty label, Last: short, Long: " + long + ", Multiline: a\nb")
            checkEqual(entries[0].label, "Long") // no mutation of source accumulation
            var content = AccessibilityContentAccumulator()
            content.appendUnique(.init(label: nil, text: "table"))
            content.appendIndexRange(label: "Rows", range: 0...3)
            content.appendUnique(.init(label: "Description", text: "table"))
            checkEqual(formatAccessibilityContent(content.entries), "table, Rows: 0-3")
        }
        let leafTree = UIElementTree<UIElement>(items: [], focusedElement: nil)
        let childTree = UIElementTree(items: [UIElementTree.Item(element: cachedChildren, subtree: leafTree)], focusedElement: nil)
        var tree = UIElementTree(items: [UIElementTree.Item(element: target, subtree: childTree, availableSubset: subset),
            UIElementTree.Item(element: target, subtree: leafTree)], focusedElement: target)
        checkEqual(tree.items[0].children.count, 1)
        checkEqual(tree.items[0].availableSubsetDescription, "(showing 0-2 of 99 items)")
        do {
            typealias Item = UIElementTree<UIElement>.Item
            func item(_ children: [Item] = []) -> Item {
                Item(element: target, subtree: UIElementTree(items: children, focusedElement: nil))
            }
            // Empty root -> visible root -> two empty ancestors -> visible child.
            // Duplicate AX identity must not merge unrelated source paths.
            let input = UIElementTree(items: [item([item([item([item([item()])]), item()])]), item()], focusedElement: nil)
            var context = ownerContext(.fullUIContext)
            let texts = ["", "parent", "", "", "deep child", "sibling", "other root"]
            var visits = 0
            let output = input.render(with: &context) { _, _ in
                defer { visits += 1 }
                return texts[visits]
            }
            checkEqual(visits, texts.count)
            checkFalse(output.isFocus)
            checkEqual(output.roots.map(\.text), ["parent", "other root"])
            checkEqual(output.roots[0].children.map(\.text), ["deep child", "sibling"])
            checkEqual(output.roots[0].sourcePath, IndexPath(indexes: [0, 0]))
            checkEqual(output.roots[0].children[0].sourcePath, IndexPath(indexes: [0, 0, 0, 0, 0]))
            checkEqual(output.roots[0].children[1].sourcePath, IndexPath(indexes: [0, 0, 1]))
            checkEqual(output.roots[1].sourcePath, IndexPath(index: 1))
            checkTrue(output.roots[0].elementID == nil)
            checkEqual(output.lines(indent: "-", options: []), ["parent", "-deep child", "-sibling", "other root"])
            output.setElementIDs()
            checkEqual(output.lines(indent: "·", options: []), ["0 parent", "·1 deep child", "·2 sibling", "3 other root"])
            checkEqual(output.lines(indent: "·", options: [.withoutElementID]), ["parent", "·deep child", "·sibling", "other root"])
            output.roots[0].elementID = 99
            output.setElementIDs()
            checkEqual(output.roots[0].elementID, 0)
            let repeated = UIElementRenderTree(isFocus: false, roots: [output.roots[1], output.roots[1]])
            repeated.setElementIDs()
            checkEqual(repeated.lines(indent: " ", options: []), ["1 other root", "1 other root"])
            let empty = UIElementRenderTree<Int>(isFocus: false, roots: [])
            empty.setElementIDs()
            checkEqual(empty.lines(indent: " ", options: []), [])
            var emptyIDs = empty.nextAvailableElementIDIterator()
            checkEqual(emptyIDs.next(), 1)
            checkEqual(emptyIDs.next(), 2)
            let idChild = UIElementRender(id: 10, elementID: 9, text: "child", detailText: nil, sourcePath: nil, children: [])
            let idRoot = UIElementRender(id: 11, elementID: nil, text: "root", detailText: nil, sourcePath: nil, children: [idChild])
            let idTree = UIElementRenderTree(isFocus: false, roots: [idRoot])
            var ids = idTree.nextAvailableElementIDIterator()
            idChild.elementID = 20 // first scan is lazy and sees shared nodes
            checkEqual(ids.next(), 21)
            idChild.elementID = 100 // later scans must not happen
            checkEqual(ids.next(), 22)
            var copiedIDs = ids
            checkEqual(copiedIDs.next(), 23)
            checkEqual(ids.next(), 23) // cached counter has value semantics
            var freshIDs = idTree.nextAvailableElementIDIterator()
            checkEqual(freshIDs.next(), 101)
            idChild.elementID = -5
            var negativeIDs = idTree.nextAvailableElementIDIterator()
            checkEqual(negativeIDs.next(), -4) // no clamp of present maxima
            idChild.elementID = nil
            var missingIDs = idTree.nextAvailableElementIDIterator()
            checkEqual(missingIDs.next(), 1)


            checkTrue(input.render(with: &context) { _, _ in "" }.roots.isEmpty)
            let focus = UIElementTree(items: [item()], focusedElement: target)
            let emptyFocus = focus.render(with: &context) { _, _ in "" }
            checkTrue(emptyFocus.isFocus) // based on source, not retained roots
            checkTrue(emptyFocus.roots.isEmpty)
            enum TreeRenderFailure: Error { case expected }
            visits = 0
            do {
                _ = try input.render(with: &context) { _, _ in
                    visits += 1
                    if visits == 3 { throw TreeRenderFailure.expected }
                    return "node"
                }
                unexpectedFailure("tree render must stop on an error")
            } catch TreeRenderFailure.expected {}
            checkEqual(visits, 3)
        }
        do {
            var context = ownerContext(.fullUIContext)
            var visits = 0
            let path = IndexPath(indexes: [2, 0])
            let node = tree.items[0].renderNode(sourcePath: path, context: &context) { _, _ in
                visits += 1
                return "  "
            }!
            checkEqual(visits, 1)
            checkEqual(node.text, "  ") // no trimming of the renderer's result
            checkEqual(node.id, tree.items[0].element.id)
            checkTrue(node.elementID == nil)
            checkEqual(node.sourcePath, path)
            checkEqual(node.detailText, "(showing 0-2 of 99 items)")
            checkTrue(node.children.isEmpty) // assembly is a separate pass
            let alias = node
            alias.elementID = 7
            checkEqual(node.elementID, 7)
            let child = UIElementRender(id: node.id, elementID: nil, text: "child",
                detailText: nil, sourcePath: nil, children: [])
            node.append(child: child)
            node.append(child: child)
            checkEqual(node.children.count, 2)
            checkEqual(node.line(indent: "·", indentCount: 2, options: []), "··7    (showing 0-2 of 99 items)")
            checkEqual(node.line(indent: " ", indentCount: 0, options: [.withoutElementID, .withoutDetailText]), "  ")
            let multiline = UIElementRender(id: 1, elementID: -3, text: "a\nb", detailText: "", sourcePath: nil, children: [])
            checkEqual(multiline.line(indent: "👩‍💻", indentCount: 2, options: []), "👩‍💻👩‍💻-3 a\nb ")
            checkEqual(multiline.line(indent: " ", indentCount: 1, options: [.withoutDetailText]), " -3 a\nb")
            checkEqual(multiline.line(indent: " ", indentCount: 0, options: [.withoutElementID]), "a\nb ")
            checkEqual(multiline.line(indent: " ", indentCount: 0, options: [.withoutInsertionSubtree, .withoutRemovalSubtree]), "-3 a\nb ")
            checkEqual(child.line(indent: " ", indentCount: 0, options: []), "child")
            let selection = UIElementRenderTree(isFocus: true, roots: [node]).selectionSubtree()!
            checkFalse(selection.isFocus)
            checkEqual(selection.roots.count, 2)
            checkTrue(selection.roots[0] === child && selection.roots[1] === child)
            selection.roots[0].elementID = 12
            checkEqual(child.elementID, 12)
            checkTrue(UIElementRenderTree(isFocus: false, roots: [node]).selectionSubtree() == nil)
            checkTrue(UIElementRenderTree(isFocus: true, roots: [child]).selectionSubtree() == nil)
            checkTrue(UIElementRenderTree<Int>(isFocus: true, roots: []).selectionSubtree() == nil)
            checkTrue(node.children[0] === child && node.children[1] === child)
            let omitted = tree.items[0].renderNode(sourcePath: path, context: &context) { _, _ in "" }
            checkTrue(omitted == nil)
            enum ProjectionFailure: Error { case expected }
            do {
                _ = try tree.items[0].renderNode(sourcePath: path, context: &context) { _, _ in
                    visits += 1
                    throw ProjectionFailure.expected
                }
                unexpectedFailure("render errors must propagate")
            } catch ProjectionFailure.expected {}
            checkEqual(visits, 2)
        }
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
        do {
            var tree = UIElementTree<UIElement>(items: [
                .init(element: cachedChildren, subtree: UIElementTree(items: [], focusedElement: nil)),
                .init(element: titled, subtree: UIElementTree(items: [], focusedElement: nil))
            ], focusedElement: nil)
            let providerReference: any UIElementProtocol = UIElement(axElement: cachedChildren.axElement,
                cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
            checkEqual(tree.id(for: providerReference), 1)
            checkEqual(tree.element(for: providerReference)?.id, cachedChildren.id)
            // Return the captured tree element, not the lookup provider's empty cache.
            checkEqual(tree.setFocusedElement(providerReference)?.title, titled.title)
            checkEqual(tree.focusedElement?.id, cachedChildren.id)
            let missing: any UIElementProtocol = UIElement(axElement: AXUIElementCreateApplication(12522),
                cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
            checkTrue(tree.id(for: missing) == nil)
            checkTrue(tree.element(for: missing) == nil)
            checkTrue(tree.setFocusedElement(missing) == nil)
            checkTrue(tree.focusedElement == nil)
            tree.items.removeAll()
            checkTrue(tree.id(for: providerReference) == nil)
        }

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

private func checkEqual<T: Equatable>(_ lhs: T, _ rhs: T, file: StaticString = #filePath, line: UInt = #line) { precondition(lhs == rhs, "Values differ", file: file, line: line) }
private func checkTrue(_ value: Bool, file: StaticString = #filePath, line: UInt = #line) { precondition(value, "Expected true", file: file, line: line) }
private func checkFalse(_ value: Bool, file: StaticString = #filePath, line: UInt = #line) { precondition(!value, "Expected false", file: file, line: line) }
private func unexpectedFailure(_ message: String = "unexpected failure") -> Never { preconditionFailure(message) }

private func runApplicationClickActivationChecks() async throws {
    // Validate every gate combination, including nil-enforcer behavior.
    for bits in 0..<256 {
        let enforcer = bits & 1 != 0, focus = bits & 2 != 0, held = bits & 4 != 0
        let coordinate = bits & 8 != 0, web = bits & 16 != 0
        let selection = bits & 32 != 0, catalyst = bits & 64 != 0, role = bits & 128 != 0
        var enforced = 0, probed = 0, focusReads = 0
        let result = try await prepareApplicationForSyntheticClick(hasFocusEnforcer: enforcer,
            applicationBelievesItHasFocus: { focusReads += 1; return focus }, hasHeldKey: held,
            clickingByCoordinate: coordinate, isInsideWebView: web,
            clickingMayCauseSelection: { selection }, isCatalystApp: { catalyst },
            catalystRoleRequiresActivation: { role },
            applicationIsActive: { probed += 1; return true },
            safelyEnforceWindowActiveState: { enforced += 1 })
        let requiresEnforcement = enforcer && !focus && (held || (coordinate && (web || selection)) || (catalyst && (selection || role)))
        checkEqual(enforced, requiresEnforcement ? 1 : 0)
        checkEqual(result, !enforcer || focus || requiresEnforcement)
        checkEqual(probed, enforcer ? 0 : 1)
        checkEqual(focusReads, enforcer ? 1 : 0)
    }
    var reads: [String] = []
    let result = try await prepareApplicationForSyntheticClick(hasFocusEnforcer: true,
        applicationBelievesItHasFocus: { reads.append("focus"); return false }, hasHeldKey: false,
        clickingByCoordinate: true, isInsideWebView: false,
        clickingMayCauseSelection: { reads.append("selection"); return false },
        isCatalystApp: { reads.append("catalyst"); return true },
        catalystRoleRequiresActivation: { reads.append("role"); return false },
        applicationIsActive: { unexpectedFailure() }, safelyEnforceWindowActiveState: { unexpectedFailure() })
    checkFalse(result)
    checkEqual(reads, ["focus", "selection", "catalyst", "selection", "role"])
}

func runProviderClickChecks() async throws {
    try await ProviderClickChecks.run()
    try await runApplicationClickActivationChecks()
    try runSyntheticFocusDeactivationChecks()
    try runSyntheticFocusEnforcementChecks()
    try runSyntheticWindowActivationChecks()
    runSafeActivationCallbackChecks()
    runTargetActivationObservationChecks()
    runSafeActivationRestorationDecisionChecks()
    try await runSafeActivationScopeChecks()
    try runSyntheticFocusStateStoreChecks()
    try runSyntheticFocusActivationFilterChecks()
    runSyntheticFocusTargetMonitorChecks()
    runSyntheticFocusExternalClickChecks()
    try runSyntheticFocusMonitoringSessionChecks()
    try await runSyntheticFocusSessionRestorationChecks()
    runFrontmostApplicationObservationStoreChecks()
    runInclusiveFrontmostTrackerChecks()
    runSyntheticFocusInitialStateChecks()
    runKeyFocusOwnerSelectionChecks()
    runViewBridgeActualFocusPIDChecks()
    runViewBridgeFocusRetryChecks()
    runViewBridgeFocusFallbackChecks()
    runViewBridgeActivityCompositionChecks()
    runFocusOwnerMissingElementFallbackChecks()
    runFocusedElementOwnerSelectionChecks()
    runFocusOwnerWindowSelectionChecks()
    runRestrictedFocusOwnerSelectionChecks()
    runFocusOwnerApplicationMatchChecks()
    runKeyFocusRegistryQueryChecks()
    runFocusStealRegistrationStoreChecks()
    runFocusStealKeyboardMonitorChecks()
    runFocusStealTakenStateChecks()
    runFocusStealRegistrationTransitionChecks()
    await runFocusStealRegistrationCallbackChecks()
    await runFocusStealRegisteredDispatchChecks()
    runFocusStealOwnershipHistoryChecks()
    runFocusStealPhysicalFocusChecks()
    runSystemKeyFocusReleaseChecks()
    runViewBridgeFocusTransitionEligibilityChecks()
    try runViewBridgeKeyFocusRefreshChecks()
    runUIElementProcessTypeChecks()
    runViewBridgeFocusCompensationChecks()
    runViewBridgeReleaseMetadataChecks()
    runFocusStealNewFrontChecks()
    runSystemFocusNotificationRoutingChecks()
    runSystemFocusNotificationMonitorChecks()
    try await runViewBridgeRefreshTaskChecks()
    await runFocusStealCallbackResourceLifetimeChecks()
    runFocusStealRegistrationResourceChecks()
    runSystemFocusStealPreventerChecks()
    runMenuDismissalSuppressionChecks()
    try runSyntheticAppFocusEnforcerLifecycleChecks()
    try await runSyntheticFocusSafeActivationBranchChecks()
    runSafeActivationSavedWindowChecks()
    runUIElementBooleanValueChecks()
    runRunningApplicationPIDResolutionChecks()
    await runApplicationFrontmostWaitChecks()
    await runTargetFocusEnforcerOwnershipChecks()
    try runActivationPointValueChecks()
    try await runApplicationClickFocusCompositionChecks()
    try runApplicationClickEventFlagChecks()
    runInputSnapshotFocusComparisonChecks()
    try runMouseEventWindowSelectionChecks()
    runOutOfProcessMouseTargetChecks()
    try runOutOfProcessMouseWindowIDChecks()
    try runMouseEventRoutingSeedChecks()
    runMouseWindowAtPointChecks()
    runNativeWindowDescriptionChecks()
    try runMouseEventTargetChecks()
    runOrderedMouseWindowChecks()
    runMouseWindowRegistryChecks()
    runAXEnablementAssertionTrackerChecks()
    runElectronAccessibilityEnablementChecks()
    runAXEnablementAssertionReleaseChecks()
    runVoiceOverPreferenceReleaseChecks()
    runAXEnablementPolicyChecks()
    runAXEnablementAcquisitionChecks()
    runAXInitializedApplicationChecks()
    try runAXNotificationRemovalChecks()
    runAXNotificationCallbackContextChecks()
    runAXNotificationInfoBridgeChecks()
    runAppControllerMenuOpenChecks()
    runMouseWindowRegistryRemovalChecks()
    runAppControllerMenuStateChecks()
    runAppControllerInitialWindowsChecks()
    runResolvedWindowRegistrationChecks()
    try runMenuWindowIDChecks()
    runWindowWrapperStorageChecks()
    runAppControllerWindowEventDispatchChecks()
    precondition(AppControllerAXNotifications.root.map { $0.name as String } == ["AXWindowCreated", "AXMenuOpened", "AXMenuClosed", "AXSheetCreated", "AXWindowMoved", "AXWindowResized"])
    precondition(AppControllerAXNotifications.qualityOfService.rawValue == 25)
    try runAXNotificationRegistrationChecks()
    runMouseWindowRegistryOwnershipChecks()
    await runWindowOrderingObserverCompositionChecks()
    await runWindowOrderingMenuTaskChecks()
    runWindowOrderingMenuOpenChecks()
    await runWindowOrderingEventLoopChecks()
    try await runWindowOrderingRestorationChecks()
    try await runWindowOrderingRaiseScopeChecks()
    await runWindowOrderingRestorationContextChecks()
    await runCGWindowEventStreamChecks()
    runCGWindowNotificationChecks()
    runCGWindowCallbackRegistryChecks()
    runCGWindowObserverRegistrationChecks()
    runWindowServerEventChecks()
    runWindowOrderingObserverTaskStoreChecks()
    await runApplicationPrimaryWindowChecks()
    runAXEnablementApplicationGuardChecks()
    runUIElementDescendantChecks()
    try runSynchronousPollingChecks()
    runAXApplicationInitializationChecks()
    runEnhancedUserInterfaceEnablementChecks()
    try await runVoiceOverPreferenceEnablementChecks()
    try await runSafeActivationNativeResourceChecks()
    try await runSafeActivationRestorationLoopChecks()
    runRunLoopTaskChecks()
    runEventTapLifecycleChecks()
}

private func runSyntheticFocusDeactivationChecks() throws {
    for bits in 0..<8 {
        let initial = SyntheticApplicationFocusState(
            applicationBelievesItIsActive: bits & 1 != 0,
            applicationBelievesItHasFocus: bits & 2 != 0,
            applicationIsActive: bits & 4 != 0)
        let shouldSend = initial.applicationBelievesItIsActive && !initial.applicationIsActive
        var state = initial
        var sends = 0
        try state.deactivateFocusEnforcer { sends += 1 }
        checkEqual(sends, shouldSend ? 1 : 0)
        checkEqual(state.applicationIsActive, initial.applicationIsActive)
        checkEqual(state.applicationBelievesItIsActive, shouldSend ? false : initial.applicationBelievesItIsActive)
        checkEqual(state.applicationBelievesItHasFocus, shouldSend ? false : initial.applicationBelievesItHasFocus)
        try state.deactivateFocusEnforcer { sends += 1 }
        checkEqual(sends, shouldSend ? 1 : 0)
        state = initial
        do {
            try state.deactivateFocusEnforcer { throw UIElementError.axError(.failure) }
            checkFalse(shouldSend)
        } catch {
            checkTrue(shouldSend)
        }
        checkEqual(state, initial)
    }
}

private func runSyntheticFocusEnforcementChecks() throws {
    for bits in 0..<8 {
        let initial = SyntheticApplicationFocusState(
            applicationBelievesItIsActive: bits & 1 != 0,
            applicationBelievesItHasFocus: bits & 2 != 0,
            applicationIsActive: bits & 4 != 0)
        let expected = initial.applicationBelievesItHasFocus ? [] :
            [initial.applicationBelievesItIsActive ? "focus" : "activation"]
        var state = initial
        var events: [String] = []
        try state.enforceActiveState(sendKeyFocusReturned: { events.append("focus") },
            sendAppActivated: { events.append("activation") })
        checkEqual(events, expected)
        checkEqual(state.applicationIsActive, initial.applicationIsActive)
        checkTrue(state.applicationBelievesItHasFocus)
        checkEqual(state.applicationBelievesItIsActive,
            initial.applicationBelievesItIsActive || !initial.applicationBelievesItHasFocus)
        try state.enforceActiveState(sendKeyFocusReturned: { unexpectedFailure() },
            sendAppActivated: { unexpectedFailure() })
        state = initial
        do {
            try state.enforceActiveState(
                sendKeyFocusReturned: { throw UIElementError.axError(.failure) },
                sendAppActivated: { throw UIElementError.axError(.failure) })
            checkTrue(initial.applicationBelievesItHasFocus)
        } catch { checkFalse(initial.applicationBelievesItHasFocus) }
        checkEqual(state, initial)
    }
}

private func runSyntheticWindowActivationChecks() throws {
    var nilPointReads: [String] = []
    let decodedNilPoint = SyntheticActivationWindow(activationPoint: { nilPointReads.append("point"); return .some(nil) },
        windowID: { nilPointReads.append("id"); return 91 },
        frame: { nilPointReads.append("frame"); return CGRect(x: 0, y: 0, width: 100, height: 100) })
    let nilPointEvent = try syntheticWindowActivationEvent(decodedNilPoint)
    checkEqual(nilPointReads, ["point", "id", "frame"])
    checkEqual(nilPointEvent.cgEvents.count, 1)
    checkEqual(NSEvent(cgEvent: nilPointEvent.cgEvents[0])!.windowNumber, 91)
    let missingPoint = SyntheticActivationWindow(activationPoint: { nil },
        windowID: { unexpectedFailure() }, frame: { unexpectedFailure() })
    let missingPointEvent = try syntheticWindowActivationEvent(missingPoint)
    checkEqual(NSEvent(cgEvent: missingPointEvent.cgEvents[0])!.windowNumber, 0)
    for hasPoint in [false, true] {
        for idFails in [false, true] {
            for hasFrame in [false, true] {
                var reads: [String] = []
                let window = SyntheticActivationWindow(
                    activationPoint: { reads.append("point"); return hasPoint ? .some(.some(CGPoint(x: 20, y: 30))) : .none },
                    windowID: { reads.append("id"); if idFails { throw UIElementError.axError(.failure) }; return 91 },
                    frame: { reads.append("frame"); return hasFrame ? CGRect(x: 10, y: 10, width: 100, height: 100) : nil })
                var state = SyntheticApplicationFocusState(applicationBelievesItIsActive: false,
                    applicationBelievesItHasFocus: false, applicationIsActive: false)
                var counts: [Int] = []
                try state.enforceActiveState(for: window) { counts.append($0.cgEvents.count) }
                checkEqual(reads, !hasPoint ? ["point"] : idFails ? ["point", "id"] : ["point", "id", "frame"])
                checkEqual(counts, [hasPoint && !idFails && hasFrame ? 3 : 1])
                checkTrue(state.applicationBelievesItIsActive)
                checkTrue(state.applicationBelievesItHasFocus)
                reads = []
                try state.enforceActiveState(for: window) { _ in unexpectedFailure() }
                checkTrue(reads.isEmpty)
                state.applicationBelievesItHasFocus = false
                try state.enforceActiveState(for: window) { event in
                    checkEqual(event.cgEvents.count, 1)
                    let native = NSEvent(cgEvent: event.cgEvents[0])!
                    checkEqual(native.type.rawValue, 21)
                    checkEqual(native.subtype.rawValue, Int16.min)
                }
                checkTrue(reads.isEmpty)
            }
        }
    }
    checkEqual(try syntheticWindowActivationEvent(nil).cgEvents.count, 1)
}

private func runSafeActivationCallbackChecks() {
    var observed = SafeActivationObservedEvents()
    checkFalse(observed.observe(type: 19, subtypeValue: nil, time: 1))
    checkEqual(observed.transitionFlags, 1)
    checkFalse(observed.observe(type: 13, subtypeValue: 1, time: 2))
    checkEqual(observed.transitionFlags, 0x0101)
    checkFalse(observed.observe(type: 13, subtypeValue: 2, time: 3))
    checkEqual(observed.transitionFlags, 0x0101)
    for subtype: Int64 in [22, 23] {
        checkFalse(observed.observe(type: 13, subtypeValue: subtype, time: 4))
    }
    for subtype: Int64 in [0, 24, 65537, -65535, Int64.max] {
        checkTrue(observed.observe(type: 13, subtypeValue: subtype, time: 5))
    }
    checkTrue(observed.observe(type: 10, subtypeValue: 1, time: 6))
    checkEqual(observed.lastEventTime, 6)
    let notification = try! SynthesizedEvent.notifyAppDeactivated().cgEvents[0]
    notification.setIntegerValueField(CGEventField(rawValue: 83)!, value: 22)
    checkTrue(observed.filter(type: CGEventType(rawValue: 13)!, event: notification, time: 7) == nil)
    checkEqual(observed.lastEventTime, 7)
    for source: Int64 in [100, 101] {
        for target: Int64 in [200, 201] {
            let event = CGEvent(source: nil)!
            event.timestamp = 123
            event.setIntegerValueField(.eventSourceUnixProcessID, value: source)
            event.setIntegerValueField(.eventTargetUnixProcessID, value: target)
            var posts = 0, reads = 0
            let result = routeInputDuringSafeActivation(event, helperPID: 100, targetPID: 200,
                previousApplicationPID: { reads += 1; return 300 },
                post: { posted, pid in
                    posts += 1; checkTrue(posted === event)
                    checkEqual(pid, 300); checkEqual(posted.timestamp, 123)
                })
            let redirected = source != 100 && target == 200
            checkEqual(result == nil, redirected)
            checkEqual(posts, redirected ? 1 : 0)
            checkEqual(reads, posts)
        }
    }
}

private func runRunLoopTaskChecks() {
    let configured = DispatchSemaphore(value: 0)
    let ranBlock = DispatchSemaphore(value: 0)
    let releasedContext = DispatchSemaphore(value: 0)
    final class Context {
        let released: DispatchSemaphore
        init(_ released: DispatchSemaphore) { self.released = released }
        deinit { released.signal() }
    }
    var task: RunLoopTask? = RunLoopTask(name: "CUA RunLoop check", qualityOfService: .utility,
        contextObject: Context(releasedContext)) { loop in
            CFRunLoopPerformBlock(loop, CFRunLoopMode.defaultMode.rawValue) { ranBlock.signal() }
            configured.signal()
        }
    checkTrue(task != nil)
    checkEqual(configured.wait(timeout: .now() + 5), .success)
    checkEqual(ranBlock.wait(timeout: .now() + 5), .success)
    task = nil
    checkEqual(releasedContext.wait(timeout: .now() + 5), .success)
    // Cancellation before startup must not invoke configuration or hang.
    let thread = RunLoopTask.RunLoopThread()
    thread.configurationHandler = { _ in unexpectedFailure() }
    thread.cancel()
    thread.start()
    let deadline = Date().addingTimeInterval(5)
    while !thread.isFinished && Date() < deadline { Thread.sleep(forTimeInterval: 0.001) }
    checkTrue(thread.isFinished)
}

private func runEventTapLifecycleChecks() {
    var calls: [String] = []
    var shouldFail = true
    let driver = EventTap.Driver(create: { location, place, options, mask, _, _ in
        calls.append("create")
        guard case .process(345) = location else { unexpectedFailure() }
        checkEqual(place, .headInsertEventTap)
        checkEqual(options, .defaultTap)
        checkEqual(mask, 1 << 10)
        if shouldFail { return nil }
        // A local Mach port, not a system input tap. No TCC or interception.
        var context = CFMachPortContext(version: 0, info: nil, retain: nil,
            release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, enabled in calls.append(enabled ? "enable" : "disable") },
       invalidate: { port in calls.append("invalidate"); CFMachPortInvalidate(port) })
    var tap: EventTap? = EventTap(location: .process(345), placement: .headInsertEventTap,
        options: .defaultTap, eventsOfInterest: 1 << 10, driver: driver)
    tap!.startMonitoring { _, event in event }
    checkFalse(tap!.isMonitoring)
    checkEqual(calls, ["create"])
    shouldFail = false
    var handled = 0
    tap!.startMonitoring { _, _ in handled += 1; return nil }
    checkTrue(tap!.isMonitoring)
    checkEqual(calls, ["create", "create", "enable"])
    tap!.startMonitoring { _, _ in unexpectedFailure() }
    let event = CGEvent(source: nil)!
    checkTrue(tap!.handle(type: .keyDown, event: event) == nil)
    checkEqual(handled, 1)
    checkTrue(tap!.handle(type: .tapDisabledByTimeout, event: event) === event)
    checkEqual(calls.last, "enable")
    let count = calls.count
    tap!.shouldAutoreenable = false
    checkTrue(tap!.handle(type: .tapDisabledByTimeout, event: event) === event)
    tap!.shouldAutoreenable = true
    checkTrue(tap!.handle(type: .tapDisabledByUserInput, event: event) === event)
    checkEqual(calls.count, count)
    checkEqual(handled, 1)
    tap!.stopMonitoring()
    checkFalse(tap!.isMonitoring)
    checkEqual(Array(calls.suffix(2)), ["disable", "invalidate"])
    let stoppedCount = calls.count
    tap!.stopMonitoring()
    checkEqual(calls.count, stoppedCount)
    tap!.startMonitoring { _, event in event }
    tap = nil
    checkEqual(Array(calls.suffix(4)), ["create", "enable", "disable", "invalidate"])
}

private func runTargetActivationObservationChecks() {
    var state = SafeActivationObservedEvents()
    checkFalse(state.observe(type: 20, subtypeValue: nil, time: 1))
    checkTrue(state.targetRequestsSuppression(type: 19, subtypeValue: nil, time: 2))
    checkEqual(state.transitionFlags, 0x0101)
    checkTrue(state.targetResignObserved)
    state.beginForegroundRestoration(time: 3)
    checkEqual(state.transitionFlags, 1)
    checkFalse(state.targetResignObserved)
    checkEqual(state.lastEventTime, 3)
    checkFalse(state.targetRequestsSuppression(type: 20, subtypeValue: nil, time: 4))
    checkFalse(state.targetResignObserved)
    checkFalse(state.targetRequestsSuppression(type: 13, subtypeValue: 1, time: 5))
    for subtype: Int64 in [22, 23] {
        checkTrue(state.targetRequestsSuppression(type: 13, subtypeValue: subtype, time: 6))
        checkFalse(state.targetResignObserved)
    }
    checkFalse(state.targetRequestsSuppression(type: 13, subtypeValue: 65538, time: 7))
    checkTrue(state.targetRequestsSuppression(type: 13, subtypeValue: 2, time: 8))
    checkTrue(state.targetResignObserved)
    // Foreground tap writes only bytes 0/1, preserving target observation.
    checkFalse(state.observe(type: 20, subtypeValue: nil, time: 9))
    checkTrue(state.targetResignObserved)
}

private func runSafeActivationRestorationDecisionChecks() {
    var observation = SafeActivationObservedEvents()
    _ = observation.observe(type: 20, subtypeValue: nil, time: 0)
    // The target side has not acknowledged resignation yet.
    checkEqual(safeActivationRestorationDecision(savedApplicationIsFrontmost: true,
        requiresPairedNotifications: true, requiresQuietPeriod: false,
        observation: observation, elapsed: 1.999, now: { unexpectedFailure() }), .pollAgain)
    checkEqual(safeActivationRestorationDecision(savedApplicationIsFrontmost: true,
        requiresPairedNotifications: true, requiresQuietPeriod: false,
        observation: observation, elapsed: 2, now: { unexpectedFailure() }), .timedOut)
    _ = observation.targetRequestsSuppression(type: 19, subtypeValue: nil, time: 0)
    for elapsed in [0.0, 1.999, 2.0, 3.0] {
        for now in [0.099, 0.1, 0.101] {
            let result = safeActivationRestorationDecision(savedApplicationIsFrontmost: true,
                requiresPairedNotifications: true, requiresQuietPeriod: true,
                observation: observation, elapsed: elapsed, now: { now })
            checkEqual(result, now >= 0.1 ? .complete : elapsed >= 2 ? .timedOut : .pollAgain)
        }
    }
    checkEqual(safeActivationRestorationDecision(savedApplicationIsFrontmost: false,
        requiresPairedNotifications: false, requiresQuietPeriod: false,
        observation: observation, elapsed: 2, now: { unexpectedFailure() }), .timedOut)
    checkEqual(safeActivationRestorationDecision(savedApplicationIsFrontmost: true,
        requiresPairedNotifications: false, requiresQuietPeriod: false,
        observation: observation, elapsed: 3, now: { unexpectedFailure() }), .complete)
}

private func runSafeActivationScopeChecks() async throws {
    enum TestFailure: Error, Equatable { case enforce, restore }
    for enforceFails in [false, true] {
        for restoreFails in [false, true] {
            var trace: [String] = []
            let operations = SafeActivationScopeOperations(
                startForegroundMonitoring: { trace.append("startForeground") },
                startTargetMonitoring: { trace.append("startTarget") },
                installTargetObserver: { trace.append("installObserver") },
                disableUpdates: { trace.append("disableUpdates") },
                reenableUpdates: { trace.append("reenableUpdates") },
                clearTargetObserver: { trace.append("clearObserver") },
                stopTargetMonitoring: { trace.append("stopTarget") },
                stopForegroundMonitoring: { trace.append("stopForeground") })
            var caught: TestFailure?
            do {
                try await withSafeActivationRestoration(operations: operations,
                    enforce: {
                        trace.append("enforce")
                        if enforceFails { throw TestFailure.enforce }
                    }, restore: { originalError in
                        trace.append("restore")
                        checkEqual(originalError as? TestFailure, enforceFails ? .enforce : nil)
                        await Task.yield()
                        if restoreFails { throw TestFailure.restore }
                    })
            } catch { caught = error as? TestFailure; checkTrue(caught != nil) }
            checkEqual(caught, enforceFails ? .enforce : restoreFails ? .restore : nil)
            checkEqual(trace, ["startForeground", "startTarget", "installObserver", "disableUpdates",
                "enforce", "restore", "reenableUpdates", "clearObserver", "stopTarget", "stopForeground"])
        }
    }
    var cleaned: [String] = []
    let operations = SafeActivationScopeOperations(startForegroundMonitoring: {},
        startTargetMonitoring: {}, installTargetObserver: {}, disableUpdates: {},
        reenableUpdates: { cleaned.append("updates") }, clearTargetObserver: { cleaned.append("observer") },
        stopTargetMonitoring: { cleaned.append("target") }, stopForegroundMonitoring: { cleaned.append("foreground") })
    do {
        try await withSafeActivationRestoration(operations: operations, enforce: {},
            restore: { _ in throw CancellationError() })
        unexpectedFailure()
    } catch is CancellationError {} catch { unexpectedFailure() }
    checkEqual(cleaned, ["updates", "observer", "target", "foreground"])
}

private func runSafeActivationNativeResourceChecks() async throws {
    var observer: SafeActivationNativeResources.TargetObserver?
    var trace: [String] = []
    let connection = OpaquePointer(bitPattern: 123)!
    var masks: [CGEventMask] = []
    let taps = EventTap.Driver(create: { location, _, _, mask, _, _ in
        guard case .process(let pid) = location else { unexpectedFailure() }
        trace.append("tap:\(pid)"); masks.append(mask)
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0) })
    var resources: SafeActivationNativeResources? = SafeActivationNativeResources(
        savedPID: { 77 }, targetPID: 88, helperPID: 99,
        setTargetObserver: { observer = $0; trace.append($0 == nil ? "clear" : "install") },
        clock: { 10 }, tapDriver: taps,
        updates: WindowUpdateDriver(mainConnection: { trace.append("connection"); return connection },
            disable: { checkTrue($0 == connection); trace.append("disable"); return .failure },
            reenable: { checkTrue($0 == connection); trace.append("reenable"); return .success }),
        post: { _, _ in unexpectedFailure() })
    weak var lifetime = resources
    try await withSafeActivationRestoration(operations: resources!.operations, enforce: {
        let event = try SynthesizedEvent.notifyAppDeactivated().cgEvents[0]
        checkTrue(observer!(CGEventType(rawValue: 13)!, event))
    }, restore: { error in
        checkTrue(error == nil)
        checkTrue(resources!.observations.snapshot.targetResignObserved)
        checkEqual(resources!.observations.snapshot.lastEventTime, 10)
    })
    checkEqual(masks, [SafeActivationNativeResources.foregroundMask, SafeActivationNativeResources.targetInputMask])
    checkEqual(trace, ["tap:77", "tap:88", "install", "connection", "disable", "reenable", "clear"])
    checkTrue(observer == nil)
    // Exercise concrete resources + full loop: failure still tears everything
    // down, and the original enforcement error wins over foreground mismatch.
    trace.removeAll()
    do {
        try await resources!.enforceAndRestore(enforce: { throw SafeActivationRestoreError.activationFailed },
            driver: SafeActivationRestorationDriver(now: { 10 }, frontmostPID: { 99 },
                activateSavedApplication: { unexpectedFailure() },
                targetBelievesItIsFrontmost: { unexpectedFailure() },
                restoreSavedWindowIfObscured: { unexpectedFailure() }))
        fatalError("Expected original enforcement error")
    } catch { checkEqual(error as? SafeActivationRestoreError, .activationFailed) }
    checkEqual(trace, ["tap:77", "tap:88", "install", "connection", "disable", "reenable", "clear"])
    checkTrue(observer == nil)
    resources = nil
    checkTrue(lifetime == nil)
}


private func runSafeActivationRestorationLoopChecks() async throws {
    var raises = 0, windowReads = 0
    let windows = [SafeActivationOrderedWindow(id: 1, ownerPID: 88, layer: 0),
                   SafeActivationOrderedWindow(id: 2, ownerPID: 77, layer: 0)]
    let readWindows = { windowReads += 1; return windows }
    checkTrue(try restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
        windows: readWindows, raiseSavedWindow: { raises += 1 }))
    checkEqual(raises, 1)
    checkTrue(!(try restoreSafeActivationWindowOrder(savedWindowID: nil, targetPID: 88,
        windows: readWindows, raiseSavedWindow: { raises += 1 })))
    checkEqual(windowReads, 1)
    checkTrue(!(try restoreSafeActivationWindowOrder(savedWindowID: 1, targetPID: 88,
        windows: readWindows, raiseSavedWindow: nil)))
    checkTrue(try restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
        windows: readWindows, raiseSavedWindow: nil))
    checkTrue(!(try restoreSafeActivationWindowOrder(savedWindowID: 2, targetPID: 88,
        windows: { [SafeActivationOrderedWindow(id: 1, ownerPID: 88, layer: 1), windows[1]] },
        raiseSavedWindow: nil)))
    // No real system input, foreground changes, or screen suppression.
    var time = 10.0
    var pid: Int32? = 77
    var activations = 0, reads = 0, sleeps = 0
    let store = SafeActivationObservationStore(time: time)
    var driver = SafeActivationRestorationDriver(now: { time }, frontmostPID: { pid },
        activateSavedApplication: { activations += 1; pid = 77; return true },
        targetBelievesItIsFrontmost: { reads += 1; return true },
        restoreSavedWindowIfObscured: { false },
        sleep: { _ in sleeps += 1; time += 0.01 })
    try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
        enforcementFailed: false, observations: store, driver: driver)
    checkEqual(sleeps, 0); checkEqual(activations, 0); checkEqual(reads, 1)

    // Reactivation waits for both acknowledgments and a quiet period.
    pid = 88; reads = 0
    driver.sleep = { _ in
        sleeps += 1; time += 0.01
        if sleeps == 1 {
            store.access { value in
                _ = value.observe(type: 20, subtypeValue: 0, time: time)
                _ = value.targetRequestsSuppression(type: 19, subtypeValue: 0, time: time)
            }
        }
    }
    try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
        enforcementFailed: false, observations: store, driver: driver)
    checkEqual(activations, 1); checkTrue(sleeps >= 11)

    // A third application is never activated over; fail instead.
    pid = 99
    do {
        try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
            enforcementFailed: false, observations: store, driver: driver)
        fatalError("Expected foreground-change error")
    } catch { checkEqual(error as? SafeActivationRestoreError, .foregroundApplicationChanged) }

    pid = 88; driver.activateSavedApplication = { false }
    do {
        try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
            enforcementFailed: false, observations: store, driver: driver)
        fatalError("Expected activation error")
    } catch { checkEqual(error as? SafeActivationRestoreError, .activationFailed) }

    // Failure skips the AX read, but still waits for quiet before cleanup.
    pid = 77; reads = 0; sleeps = 0
    driver.sleep = { _ in sleeps += 1; time += 0.01 }
    try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
        enforcementFailed: true, observations: store, driver: driver)
    checkEqual(reads, 0); checkTrue(sleeps >= 10)

    // No notification acknowledgment: bounded timeout rather than success.
    pid = 88
    driver.activateSavedApplication = { pid = 77; return true }
    do {
        try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
            enforcementFailed: false, observations: store, driver: driver)
        fatalError("Expected timeout")
    } catch { checkEqual(error as? SafeActivationRestoreError, .timedOut) }
    // A still-obscuring window delays completion through the one-second branch,
    // even when AX already reports frontmost. Quiet time then bounds restoration.
    pid = 77; sleeps = 0
    var obstructionReads = 0
    let obstructionStart = time
    driver.restoreSavedWindowIfObscured = {
        obstructionReads += 1
        return time - obstructionStart < 0.03
    }
    try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
        enforcementFailed: false, observations: store, driver: driver)
    checkTrue(obstructionReads >= 4); checkTrue(sleeps >= 3)
    driver.checkCancellation = { throw CancellationError() }
    do {
        try await restoreSafeActivationForeground(targetPID: 88, savedPID: 77,
            enforcementFailed: false, observations: store, driver: driver)
        fatalError("Expected cancellation")
    } catch { checkTrue(error is CancellationError) }
}


private func runSyntheticFocusStateStoreChecks() throws {
    var lifecycle: [String] = []
    let store = SyntheticFocusStateStore(
        state: SyntheticApplicationFocusState(applicationIsActive: false, applicationHasKeyFocus: false),
        startClickMonitoring: { lifecycle.append("start") },
        stopClickMonitoring: { lifecycle.append("stop") })
    store.mutate { $0.observeApplicationActivation(true) }
    checkEqual(lifecycle, ["start"])
    store.mutate { $0.applicationBelievesItHasFocus = false }
    checkEqual(lifecycle, ["start"])
    store.mutate { $0.observeFrontmostPID(88, targetPID: 88) }
    checkEqual(lifecycle, ["start", "stop"])
    store.mutate { $0.observeFrontmostPID(77, targetPID: 88) }
    checkEqual(lifecycle, ["start", "stop", "start"])
    store.mutate { $0.observeApplicationActivation(false) }
    checkEqual(lifecycle, ["start", "stop", "start", "stop"])
    do {
        try store.mutate { state in
            state.applicationBelievesItIsActive = true
            throw SafeActivationRestoreError.activationFailed
        }
        fatalError("Expected mutation error")
    } catch { checkEqual(error as? SafeActivationRestoreError, .activationFailed) }
    checkTrue(store.snapshot.applicationBelievesItIsActive)
    checkEqual(lifecycle, ["start", "stop", "start", "stop"])
}


private func runSyntheticFocusActivationFilterChecks() throws {
    var starts = 0, stops = 0
    let state = SyntheticFocusStateStore(
        state: SyntheticApplicationFocusState(applicationIsActive: false, applicationHasKeyFocus: false),
        startClickMonitoring: { starts += 1 }, stopClickMonitoring: { stops += 1 })
    let filter = SyntheticFocusActivationFilter(state: state)
    let activation = try SynthesizedEvent.notifyAppActivated(windowID: 0,
        windowBounds: nil, activationPoint: nil).cgEvents[0]
    checkTrue(filter.filter(type: CGEventType(rawValue: 13)!, event: activation) === activation)
    checkTrue(state.snapshot.applicationBelievesItHasFocus); checkEqual(starts, 1)
    filter.setSuppression { _, _ in true }
    let deactivation = try SynthesizedEvent.notifyAppDeactivated().cgEvents[0]
    checkTrue(filter.filter(type: CGEventType(rawValue: 13)!, event: deactivation) == nil)
    checkTrue(state.snapshot.applicationBelievesItIsActive); checkEqual(stops, 0)
    filter.setSuppression(nil)
    checkTrue(filter.filter(type: CGEventType(rawValue: 13)!, event: deactivation) === deactivation)
    checkTrue(!state.snapshot.applicationBelievesItHasFocus); checkEqual(stops, 1)
    _ = filter.filter(type: CGEventType(rawValue: 20)!, event: activation)
    checkTrue(state.snapshot.applicationBelievesItIsActive); checkEqual(starts, 2)
}


private func runSyntheticFocusTargetMonitorChecks() {
    var trace: [String] = []
    let driver = EventTap.Driver(create: { location, placement, options, mask, _, _ in
        guard case .process(88) = location else { unexpectedFailure() }
        checkEqual(placement.rawValue, 0); checkEqual(options.rawValue, 0)
        checkEqual(mask, SafeActivationNativeResources.foregroundMask)
        trace.append("create")
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, enabled in trace.append(enabled ? "enable" : "disable") },
        invalidate: { CFMachPortInvalidate($0); trace.append("invalidate") })
    var monitor: SyntheticFocusTargetMonitor? = SyntheticFocusTargetMonitor(pid: 88,
        initialState: SyntheticApplicationFocusState(applicationIsActive: false, applicationHasKeyFocus: false),
        startClickMonitoring: { trace.append("click-start") },
        stopClickMonitoring: { trace.append("click-stop") }, driver: driver)
    weak var lifetime = monitor
    monitor!.state.mutate { $0.observeApplicationActivation(true) }
    monitor!.observeFrontmostPID(88, targetPID: 88)
    checkEqual(trace, ["create", "enable", "click-start", "click-stop"])
    monitor = nil
    checkTrue(lifetime == nil)
    checkEqual(trace, ["create", "enable", "click-start", "click-stop", "disable", "invalidate"])
}


private func runSyntheticFocusExternalClickChecks() {
    let event = CGEvent(source: nil)!
    var reads = 0, activations: [Int32] = []
    func observe(source: Int64, destination: Int64, owner: Int32?) {
        event.setIntegerValueField(.eventSourceUnixProcessID, value: source)
        event.setIntegerValueField(.eventTargetUnixProcessID, value: destination)
        let result = observeSyntheticFocusExternalClick(event, helperPID: 99, targetPID: 88,
            eventWindowID: { reads += 1; return 123 },
            windowOwnerPID: { checkEqual($0, 123); return owner },
            activateApplication: { activations.append($0) })
        checkTrue(result === event)
    }
    observe(source: 99, destination: 77, owner: 88)
    observe(source: 77, destination: 88, owner: 88)
    checkEqual(reads, 0)
    observe(source: 77, destination: 77, owner: nil)
    observe(source: 77, destination: 77, owner: 66)
    checkTrue(activations.isEmpty)
    observe(source: 77, destination: 77, owner: 88)
    checkEqual(activations, [88]); checkEqual(reads, 3)
}


private func runSyntheticFocusMonitoringSessionChecks() throws {
    var locations: [String] = [], invalidations = 0
    let driver = EventTap.Driver(create: { location, _, options, mask, _, _ in
        switch location {
        case .process(let pid): checkEqual(pid, 88); locations.append("target")
        case .session(let tap):
            checkEqual(tap.rawValue, 2); checkEqual(options.rawValue, 1)
            checkEqual(mask, 2); locations.append("click")
        }
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0); invalidations += 1 })
    var session: SyntheticFocusMonitoringSession? = SyntheticFocusMonitoringSession(pid: 88,
        initialState: SyntheticApplicationFocusState(applicationIsActive: false, applicationHasKeyFocus: false),
        tapDriver: driver, windowOwnerPID: { _ in unexpectedFailure() },
        activateApplication: { _ in unexpectedFailure() })
    weak var lifetime = session
    checkEqual(locations, ["target"])
    var sent = 0
    try session!.enforceActiveState(for: nil, send: { _ in sent += 1 })
    checkEqual(sent, 1)
    try session!.enforceActiveState(for: nil, send: { _ in unexpectedFailure() })
    checkEqual(locations, ["target", "click"])
    session!.target.observeFrontmostPID(88, targetPID: 88)
    checkEqual(invalidations, 1)
    session!.target.observeFrontmostPID(77, targetPID: 88)
    checkEqual(locations, ["target", "click", "click"])
    try session!.deactivateFocusEnforcer(send: { _ in sent += 1 })
    checkEqual(sent, 2); checkEqual(invalidations, 2)
    checkTrue(!session!.target.state.snapshot.applicationBelievesItIsActive)
    session = nil
    checkTrue(lifetime == nil); checkEqual(invalidations, 3)
}


private func runSyntheticFocusSessionRestorationChecks() async throws {
    // No OS taps or screen-update changes: exercise the real filter/store/scope
    // composition with controlled time and injected native boundaries.
    let tapDriver = EventTap.Driver(create: { _, _, _, _, _, _ in nil },
        enable: { _, _ in unexpectedFailure() }, invalidate: { _ in unexpectedFailure() })
    let session = SyntheticFocusMonitoringSession(pid: 88,
        initialState: SyntheticApplicationFocusState(applicationIsActive: false, applicationHasKeyFocus: false),
        tapDriver: tapDriver)
    let resign = try SynthesizedEvent.notifyAppDeactivated().cgEvents[0]
    var time = 10.0, sends = 0
    var observedResign = false
    var updates: [String] = []
    let restoration = SafeActivationRestorationDriver(now: { time }, frontmostPID: { 77 },
        activateSavedApplication: { unexpectedFailure() },
        targetBelievesItIsFrontmost: {
            if !observedResign {
                observedResign = true
                checkTrue(session.target.activationFilter.filter(type: CGEventType(rawValue: 19)!, event: resign) == nil)
            }
            checkTrue(session.target.state.snapshot.applicationBelievesItIsActive)
            return true
        }, restoreSavedWindowIfObscured: { false }, sleep: { _ in time += 0.01 })
    try await session.safelyEnforceWhileRestoring(savedPID: 77, window: nil,
        send: { _ in sends += 1 }, restoration: restoration, tapDriver: tapDriver,
        updates: WindowUpdateDriver(mainConnection: { nil },
            disable: { _ in updates.append("disable"); return .success },
            reenable: { _ in updates.append("reenable"); return .success }))
    checkEqual(sends, 1); checkEqual(updates, ["disable", "reenable"])
    checkTrue(session.target.state.snapshot.applicationBelievesItIsActive)
    // Temporary suppression was removed by cleanup.
    checkTrue(session.target.activationFilter.filter(type: CGEventType(rawValue: 19)!, event: resign) === resign)
    checkTrue(!session.target.state.snapshot.applicationBelievesItIsActive)
}


private func runFrontmostApplicationObservationStoreChecks() {
    let store = FrontmostApplicationObservationStore<Int32>()
    var delivered: [Int32] = []
    var second: FrontmostApplicationObservationStore<Int32>.Observer?
    let first = store.addObserver { value in
        checkEqual(store.frontmostApplication, value)
        delivered.append(value)
        if let second { store.removeObserver(second) }
    }
    second = store.addObserver { delivered.append($0 + 100) }
    store.observe(88); store.observe(88); store.observe(77)
    // Snapshot delivery survives observer removal within another callback.
    checkEqual(delivered, [88, 188, 77])
    store.removeObserver(first); store.observe(99)
    checkEqual(store.frontmostApplication, 99)
    checkEqual(delivered, [88, 188, 77])
}


private func runInclusiveFrontmostTrackerChecks() {
    let center = NotificationCenter()
    let app = NSRunningApplication.current
    var tracker: InclusiveFrontmostApplicationTracker? = InclusiveFrontmostApplicationTracker(
        center: center, initialApplication: { nil })
    weak var lifetime = tracker
    let store = tracker!.observations
    var delivered = 0
    let observer = store.addObserver { checkTrue($0 == app); delivered += 1 }
    center.post(name: NSWorkspace.didActivateApplicationNotification, object: nil)
    center.post(name: NSWorkspace.didActivateApplicationNotification, object: nil,
        userInfo: [NSWorkspace.applicationUserInfoKey: "invalid"])
    checkEqual(delivered, 0)
    center.post(name: NSWorkspace.didActivateApplicationNotification, object: nil,
        userInfo: [NSWorkspace.applicationUserInfoKey: app])
    center.post(name: NSWorkspace.didActivateApplicationNotification, object: nil,
        userInfo: [NSWorkspace.applicationUserInfoKey: app])
    checkEqual(delivered, 1); checkTrue(store.frontmostApplication == app)
    tracker = nil; checkTrue(lifetime == nil)
    store.removeObserver(observer)
}


private func runSyntheticFocusInitialStateChecks() {
    let cached = initialSyntheticFocusState(targetIsActive: false, targetPID: 88,
        preventerFocusPID: { 88 }, queryKeyFocusPID: { unexpectedFailure() },
        resolveFocusOwnerPID: { _ in unexpectedFailure() }, workspaceFrontmostPID: { unexpectedFailure() })
    checkTrue(cached.applicationBelievesItHasFocus && !cached.applicationIsActive)
    let resolved = initialSyntheticFocusState(targetIsActive: true, targetPID: 88,
        preventerFocusPID: { nil }, queryKeyFocusPID: { 99 },
        resolveFocusOwnerPID: { checkEqual($0, 99); return 88 }, workspaceFrontmostPID: { unexpectedFailure() })
    checkTrue(resolved.applicationBelievesItHasFocus && resolved.applicationBelievesItIsActive)
    let fallback = initialSyntheticFocusState(targetIsActive: false, targetPID: 88,
        preventerFocusPID: { nil }, queryKeyFocusPID: { nil },
        resolveFocusOwnerPID: { _ in unexpectedFailure() }, workspaceFrontmostPID: { nil })
    checkTrue(!fallback.applicationBelievesItHasFocus)
}


private func runKeyFocusOwnerSelectionChecks() {
    checkEqual(selectKeyFocusOwnerPID(88, viewBridgePID: { 88 },
        resolveViewBridge: { checkEqual($0, 88); return 77 },
        activationPolicy: { _ in unexpectedFailure() },
        resolveProhibitedApplication: { _ in unexpectedFailure() }), 77)
    for policy: Int? in [nil, 0, 1] {
        checkEqual(selectKeyFocusOwnerPID(88, viewBridgePID: { 99 },
            resolveViewBridge: { _ in unexpectedFailure() },
            activationPolicy: { checkEqual($0, 88); return policy },
            resolveProhibitedApplication: { _ in unexpectedFailure() }), 88)
    }
    checkEqual(selectKeyFocusOwnerPID(88, viewBridgePID: { nil },
        resolveViewBridge: { _ in unexpectedFailure() }, activationPolicy: { _ in 2 },
        resolveProhibitedApplication: { checkEqual($0, 88); return 77 }), 77)
}


private func runViewBridgeActualFocusPIDChecks() {
    let absent: Int32? = viewBridgeActualFocusPID(focusedElement: { Optional<Int>.none },
        actualPID: { _ in unexpectedFailure() }, activationPolicy: { _ in unexpectedFailure() },
        reportError: { _ in unexpectedFailure() })
    checkTrue(absent == nil)
    for policy: Int? in [nil, 0, 1, 2] {
        let result = viewBridgeActualFocusPID(focusedElement: { 123 },
            actualPID: { checkEqual($0, 123); return 88 }, activationPolicy: { checkEqual($0, 88); return policy },
            reportError: { _ in unexpectedFailure() })
        checkEqual(result, policy == nil || policy == 2 ? 88 : nil)
    }
    var reports = 0
    let failed = viewBridgeActualFocusPID(focusedElement: { 123 },
        actualPID: { _ in throw SafeActivationRestoreError.activationFailed },
        activationPolicy: { _ in unexpectedFailure() }, reportError: { _ in reports += 1 })
    checkTrue(failed == nil); checkEqual(reports, 1)
}


private func runViewBridgeFocusRetryChecks() {
    let immediate: Int? = acquireViewBridgeFocusedElement(initialRead: { 88 },
        recentActivityElapsed: { unexpectedFailure() }, sleepMicroseconds: { _ in unexpectedFailure() },
        retryRead: { unexpectedFailure() })
    checkEqual(immediate, 88)
    var sleeps = 0, reads = 0
    let retry: Int? = acquireViewBridgeFocusedElement(initialRead: { nil }, recentActivityElapsed: { 0.2 },
        sleepMicroseconds: { checkEqual($0, 15000); sleeps += 1 },
        retryRead: { reads += 1; return reads == 3 ? 77 : nil })
    checkEqual(retry, 77); checkEqual(sleeps, 3)
    sleeps = 0
    let exhausted: Int? = acquireViewBridgeFocusedElement(initialRead: { nil }, recentActivityElapsed: { 0 },
        sleepMicroseconds: { _ in sleeps += 1 }, retryRead: { nil })
    checkTrue(exhausted == nil); checkEqual(sleeps, 12)
    for elapsed in [1.0, Double.nan] {
        let skipped: Int? = acquireViewBridgeFocusedElement(initialRead: { nil }, recentActivityElapsed: { elapsed },
            sleepMicroseconds: { _ in unexpectedFailure() }, retryRead: { unexpectedFailure() })
        checkTrue(skipped == nil)
    }
}


private func runViewBridgeFocusFallbackChecks() {
    checkEqual(resolveAcquiredViewBridgeFocusPID(ViewBridgeFocusAcquisition.element(123),
        cachedPID: { unexpectedFailure() }, resolveElement: { checkEqual($0, 123); return 88 }), 88)
    checkEqual(resolveAcquiredViewBridgeFocusPID(ViewBridgeFocusAcquisition<Int>.activityTooOld,
        cachedPID: { unexpectedFailure() }, resolveElement: { checkTrue($0 == nil); return 77 }), 77)
    checkEqual(resolveAcquiredViewBridgeFocusPID(ViewBridgeFocusAcquisition<Int>.retriesExhausted,
        cachedPID: { 66 }, resolveElement: { _ in unexpectedFailure() }), 66)
    checkEqual(resolveAcquiredViewBridgeFocusPID(ViewBridgeFocusAcquisition<Int>.retriesExhausted,
        cachedPID: { nil }, resolveElement: { checkTrue($0 == nil); return 55 }), 55)
}


private func runViewBridgeActivityCompositionChecks() {
    let activity = SyntheticFocusActivity()
    checkEqual(activity.snapshot().time, 0); checkTrue(activity.snapshot().pid == nil)
    activity.record(pid: 88, time: 10)
    var sleeps = 0
    let result = resolveViewBridgePrimaryFocusPIDUsingReads(initialRead: { Optional<Int>.none }, retryRead: { nil },
        resolveElement: { _ in unexpectedFailure() }, activity: activity, now: { 10.2 },
        sleepMicroseconds: { _ in
            sleeps += 1
            if sleeps == 6 { activity.record(pid: 77, time: 10.3) }
        })
    checkEqual(result, 77); checkEqual(sleeps, 12)
    let stale = resolveViewBridgePrimaryFocusPIDUsingReads(initialRead: { Optional<Int>.none },
        retryRead: { unexpectedFailure() }, resolveElement: { checkTrue($0 == nil); return 66 },
        activity: activity, now: { 20 }, sleepMicroseconds: { _ in unexpectedFailure() })
    checkEqual(stale, 66)
    let immediate = resolveViewBridgePrimaryFocusPIDUsingReads(initialRead: { 123 }, retryRead: { unexpectedFailure() },
        resolveElement: { checkEqual($0, 123); return 55 }, activity: activity,
        now: { unexpectedFailure() }, sleepMicroseconds: { _ in unexpectedFailure() })
    checkEqual(immediate, 55)
}


private func runFocusOwnerMissingElementFallbackChecks() {
    checkEqual(focusOwnerPIDWithoutElement(skipApplicationOwner: true,
        applicationOwnerPID: { unexpectedFailure() }, workspaceFrontmostPID: { 88 }), 88)
    checkEqual(focusOwnerPIDWithoutElement(skipApplicationOwner: false,
        applicationOwnerPID: { 77 }, workspaceFrontmostPID: { unexpectedFailure() }), 77)
    checkEqual(focusOwnerPIDWithoutElement(skipApplicationOwner: false,
        applicationOwnerPID: { nil }, workspaceFrontmostPID: { 66 }), 66)
    checkEqual(focusOwnerPIDWithoutElement(skipApplicationOwner: true,
        applicationOwnerPID: { unexpectedFailure() }, workspaceFrontmostPID: { nil }), 0)
}


private func runFocusedElementOwnerSelectionChecks() {
    for policy: Int? in [nil, 0, 1, 2] {
        var restricted = 0
        let result = focusedElementOwnerPID(element: 123,
            readPID: { checkEqual($0, 123); return 88 }, activationPolicy: { _ in policy },
            resolveRestrictedPID: { checkEqual($0, 88); restricted += 1; return 77 },
            missingElementFallback: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
        checkEqual(result, policy == nil || policy == 2 ? 77 : 88)
        checkEqual(restricted, policy == nil || policy == 2 ? 1 : 0)
    }
    var reports = 0
    checkEqual(focusedElementOwnerPID(element: 123,
        readPID: { _ in throw SafeActivationRestoreError.activationFailed },
        activationPolicy: { _ in unexpectedFailure() }, resolveRestrictedPID: { _ in unexpectedFailure() },
        missingElementFallback: { 66 }, reportError: { _ in reports += 1 }), 66)
    checkEqual(reports, 1)
}


private func runFocusOwnerWindowSelectionChecks() {
    checkEqual(focusOwnerWindowPID(focusedWindow: { 1 }, mainWindow: { unexpectedFailure() },
        readPID: { checkEqual($0, 1); return 88 }, reportError: { _ in unexpectedFailure() }), 88)
    checkEqual(focusOwnerWindowPID(focusedWindow: { nil }, mainWindow: { 2 },
        readPID: { checkEqual($0, 2); return 77 }, reportError: { _ in unexpectedFailure() }), 77)
    var errors = 0
    let failed = focusOwnerWindowPID(focusedWindow: { 1 }, mainWindow: { unexpectedFailure() },
        readPID: { _ in throw SafeActivationRestoreError.activationFailed }, reportError: { _ in errors += 1 })
    checkTrue(failed == nil); checkEqual(errors, 1)
    let missing: Int32? = focusOwnerWindowPID(focusedWindow: { Optional<Int>.none }, mainWindow: { nil },
        readPID: { _ in unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
    checkTrue(missing == nil)
}


private func runRestrictedFocusOwnerSelectionChecks() {
    checkEqual(restrictedFocusOwnerPID(applicationPID: { 88 }, windowPID: { unexpectedFailure() },
        activationPolicy: { _ in 0 }, fallback: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }), 88)
    checkEqual(restrictedFocusOwnerPID(applicationPID: { 88 }, windowPID: { 77 },
        activationPolicy: { $0 == 88 ? 2 : 1 }, fallback: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }), 77)
    checkEqual(restrictedFocusOwnerPID(applicationPID: { 88 }, windowPID: { 77 },
        activationPolicy: { _ in nil }, fallback: { 66 }, reportError: { _ in unexpectedFailure() }), 66)
    var reports = 0
    checkEqual(restrictedFocusOwnerPID(applicationPID: { throw SafeActivationRestoreError.activationFailed },
        windowPID: { nil }, activationPolicy: { _ in unexpectedFailure() }, fallback: { 55 },
        reportError: { _ in reports += 1 }), 55)
    checkEqual(reports, 1)
}


private func runFocusOwnerApplicationMatchChecks() {
    struct App { let name: String?; let policy: Int }
    func match(_ apps: [App]) -> App? {
        matchingFocusOwnerApplication(ownerName: "Target", runningApplications: { apps },
            localizedName: { $0.name }, activationPolicy: { $0.policy })
    }
    checkTrue(match([]) == nil)
    checkTrue(match([App(name: "Target", policy: 2)]) == nil)
    checkEqual(match([App(name: "Other", policy: 0), App(name: "Target", policy: 1)])?.policy, 1)
    checkTrue(match([App(name: "Target", policy: 0), App(name: "Target", policy: 1)]) == nil)
    let absent: App? = matchingFocusOwnerApplication(ownerName: nil,
        runningApplications: { unexpectedFailure() }, localizedName: { $0.name }, activationPolicy: { $0.policy })
    checkTrue(absent == nil)
    checkEqual(focusOwnerNameFromLocalizedName("Helper (Target)"), "Target")
    checkEqual(focusOwnerNameFromLocalizedName("Helper ( Target )"), " Target ")
    checkTrue(focusOwnerNameFromLocalizedName("Target") == nil)
}


private func runKeyFocusRegistryQueryChecks() {
    for focusStatus: Int32 in [0, -1] {
        for pidStatus: Int32 in [0, -600, -1] {
            for flag in [false, true] {
                var trace: [String] = [], reports = 0
                let value = queryRegistryKeyFocusPID(getFocus: { process, outFlag in
                    checkEqual(process.pointee.highLongOfPSN, 0)
                    checkEqual(process.pointee.lowLongOfPSN, 0)
                    trace.append("focus"); process.pointee.lowLongOfPSN = 123
                    outFlag.pointee = DarwinBoolean(flag); return focusStatus
                }, getPID: { process, outPID in
                    checkEqual(process.pointee.lowLongOfPSN, 123)
                    trace.append("pid"); outPID.pointee = 88; return pidStatus
                }, viewBridgePID: { trace.append("bridge"); return 77 },
                    applicationExists: { checkEqual($0, 77); trace.append("app"); return false },
                    reportFailure: { checkEqual($0, focusStatus); checkEqual($1, pidStatus); reports += 1 })
                checkEqual(Array(trace.prefix(2)), ["focus", "pid"])
                let special = focusStatus == 0 && pidStatus == -600 && !flag
                checkEqual(value, special ? 77 : (focusStatus == 0 && pidStatus == 0 ? 88 : nil))
                checkEqual(reports, special || (focusStatus == 0 && pidStatus == 0) ? 0 : 1)
                checkEqual(trace.count, special ? 4 : 2)
            }
        }
    }
    // kCurrentProcess serial number: read-only call verifies the actual C ABI.
    var process = ProcessSerialNumber(highLongOfPSN: 0, lowLongOfPSN: UInt32(kCurrentProcess))
    var pid: Int32 = 0
    checkEqual(ApplicationRegistrySPI.getProcessPID(&process, pid: &pid), 0)
    checkEqual(pid, ProcessInfo.processInfo.processIdentifier)
}


private func runFocusStealRegistrationStoreChecks() {
    struct Registration { let pid: Int32; let token: Int }
    var emptyTransitions = 0
    let store = FocusStealRegistrationStore<Registration>(pid: { $0.pid }, becameEmpty: { emptyTransitions += 1 })
    store.append(Registration(pid: 88, token: 1)); store.append(Registration(pid: 88, token: 2))
    store.append(Registration(pid: 77, token: 3))
    checkTrue(!store.removeFirst(pid: 99)); checkEqual(emptyTransitions, 0)
    checkTrue(store.removeFirst(pid: 88)); checkEqual(store.snapshot.map { $0.token }, [2, 3])
    checkTrue(store.removeFirst(pid: 77)); checkEqual(emptyTransitions, 0)
    checkTrue(store.removeFirst(pid: 88)); checkEqual(emptyTransitions, 1)
    checkTrue(!store.removeFirst(pid: 88)); checkEqual(emptyTransitions, 1)
}

private func runFocusStealKeyboardMonitorChecks() {
    var callback: CGEventTapCallBack?
    var info: UnsafeMutableRawPointer?
    var invalidations = 0
    let driver = EventTap.Driver(create: { location, placement, options, mask, cb, context in
        guard case .process(88) = location else { unexpectedFailure() }
        checkEqual(placement.rawValue, 1); checkEqual(options.rawValue, 0)
        checkEqual(mask, CGEventMask(0x1c00))
        callback = cb; info = context
        var portContext = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &portContext, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0); invalidations += 1 })
    var state: FocusStealKeyboardRoutingState? = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    weak var weakState = state
    var recipients: [Int32] = []
    let event = CGEvent(source: nil)!
    event.timestamp = 123456
    var monitor: FocusStealKeyboardMonitor? = FocusStealKeyboardMonitor(pid: 88, helperPID: 99,
        state: state!, post: { sent, pid in
            checkTrue(sent === event); checkEqual(sent.timestamp, 123456)
            recipients.append(pid)
        }, driver: driver)
    func invoke(source: Int64, target: Int64, type: CGEventType) -> CGEvent? {
        event.setIntegerValueField(.eventSourceUnixProcessID, value: source)
        event.setIntegerValueField(.eventTargetUnixProcessID, value: target)
        return callback!(OpaquePointer(bitPattern: 1)!, type, event, info)?.takeUnretainedValue()
    }
    checkTrue(invoke(source: 77, target: 88, type: .keyDown) === event)
    state!.update(FocusStealKeyboardRoute(interceptedPID: 88, recipientPID: 66))
    checkTrue(invoke(source: 99, target: 88, type: .keyDown) === event)
    checkTrue(invoke(source: 77, target: 44, type: .keyDown) === event)
    checkTrue(recipients.isEmpty)
    for type in [CGEventType.keyDown, .keyUp, .flagsChanged] {
        checkTrue(invoke(source: 77, target: 88, type: type) == nil)
    }
    checkEqual(recipients, [66, 66, 66])
    checkTrue(state!.filterKeyFocusReturned(event, destinationPID: 44) === event)
    checkTrue(state!.filterKeyFocusReturned(event, destinationPID: 66) == nil)
    checkTrue(state!.filterKeyFocusReturned(event, destinationPID: 66) === event)
    // One-shot notification suppression must leave keyboard routing active.
    checkTrue(invoke(source: 77, target: 88, type: .keyDown) == nil)
    checkEqual(recipients.count, 4)
    state!.update(FocusStealKeyboardRoute(interceptedPID: 88, recipientPID: 55))
    checkTrue(invoke(source: 77, target: 88, type: .keyDown) == nil)
    checkEqual(recipients.last, 55)
    checkTrue(state!.filterKeyFocusReturned(event, destinationPID: 55) == nil)
    state!.update(nil)
    checkTrue(state!.filterKeyFocusReturned(event, destinationPID: 55) === event)
    checkTrue(invoke(source: 77, target: 88, type: .keyDown) === event)
    state = nil; checkTrue(weakState == nil)
    checkTrue(invoke(source: 77, target: 88, type: .keyDown) === event)
    checkTrue(monitor != nil); monitor = nil
    checkEqual(invalidations, 1)
}

private func runFocusStealTakenStateChecks() {
    let event = CGEvent(source: nil)!
    let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    var trace: [String] = []
    func taken(previous: Int32, registered: Bool) -> CGEvent? {
        state.recordOwnerAndSchedule(.ordinary(pid: previous), physicalFocusPID: previous, takeRegistrationSnapshot: { [] }, releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
        return state.filterKeyFocusTaken(event,
            incomingFocusPID: 88, destinationPID: 77,
            resolveOwnerPID: { checkEqual($0, 88); trace.append("resolve"); return 66 },
            isRegistered: { checkEqual($0, 66); trace.append("registered"); return registered })
    }
    event.setIntegerValueField(.eventTargetUnixProcessID, value: 88)
    checkTrue(taken(previous: 77, registered: true) == nil)
    checkEqual(trace, ["resolve", "registered"])
    var posts: [Int32] = []
    checkTrue(state.filter(event, post: { sent, pid in checkTrue(sent === event); posts.append(pid) }) == nil)
    checkEqual(posts, [77])
    checkTrue(state.filterKeyFocusReturned(event, destinationPID: 77) == nil)
    // A new taken notification resets the returned-focus one-shot flag.
    checkTrue(taken(previous: 77, registered: true) == nil)
    checkTrue(state.filterKeyFocusReturned(event, destinationPID: 77) == nil)
    // Same logical owner is allowed, even if the physical PID differs.
    checkTrue(taken(previous: 66, registered: true) === event)
    checkTrue(state.filter(event, post: { _, _ in unexpectedFailure() }) === event)
    checkTrue(taken(previous: 77, registered: false) === event)
    checkTrue(state.filterKeyFocusReturned(event, destinationPID: 77) === event)
    checkEqual(trace.count, 8)
}

private func runFocusStealRegistrationTransitionChecks() {
    // Cover all owner relations, including unchanged focus and interception of
    // either side. Physical focus PID need not equal the logical owner.
    for previous: Int32 in [66, 77] {
        for current: Int32 in [66, 77] {
            for suppressed: Int32? in [nil, 66, 77] {
                let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77), route: FocusStealKeyboardRoute(
                    interceptedPID: 88, recipientPID: 99, interceptedOwnerPID: suppressed))
                for pid: Int32 in [66, 77, 55] {
                    let actual = state.registrationTransition(pid: pid, previousOwnerPID: previous,
                        currentOwnerPID: current)
                    if previous == current || pid == suppressed || (pid != previous && pid != current) {
                        checkEqual(actual, .unchanged)
                    } else if pid == current { checkEqual(actual, .gained) }
                    else { checkEqual(actual, .lost) }
                }
            }
        }
    }
    let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    let event = CGEvent(source: nil)!
    _ = state.filterKeyFocusTaken(event, incomingFocusPID: 88,
        destinationPID: 77, resolveOwnerPID: { _ in 66 }, isRegistered: { _ in true })
    checkEqual(state.registrationTransition(pid: 66, previousOwnerPID: 77, currentOwnerPID: 66), .unchanged)
    checkEqual(state.registrationTransition(pid: 77, previousOwnerPID: 77, currentOwnerPID: 66), .lost)
    state.update(nil)
    checkEqual(state.registrationTransition(pid: 66, previousOwnerPID: 77, currentOwnerPID: 66), .gained)
}

private func runFocusStealRegistrationCallbackChecks() async {
    final class Recorder: @unchecked Sendable {
        private let lock = NSLock()
        private var values: [String] = []
        func append(_ value: String) { lock.lock(); defer { lock.unlock() }; values.append(value) }
        var snapshot: [String] { lock.lock(); defer { lock.unlock() }; return values }
    }
    let recorder = Recorder()
    let registration = FocusStealRegistrationCallbacks(pid: 88,
        lost: { recorder.append("lost") }, gained: { recorder.append("gained") })
    checkTrue(scheduleFocusStealRegistrationCallback(registration, transition: .unchanged) == nil)
    let gained = scheduleFocusStealRegistrationCallback(registration, transition: .gained)!
    checkFalse(await gained.value)
    let lost = scheduleFocusStealRegistrationCallback(registration, transition: .lost)!
    checkFalse(await lost.value)
    checkEqual(recorder.snapshot, ["gained", "lost"])
    let absent = FocusStealRegistrationCallbacks(pid: 77, lost: nil, gained: nil)
    let missing = scheduleFocusStealRegistrationCallback(absent, transition: .lost,
        reportMissingHandler: { pid, transition in
            checkEqual(pid, 77); checkEqual(transition, .lost); recorder.append("missing")
        })!
    checkTrue(await missing.value)
    checkEqual(recorder.snapshot, ["gained", "lost", "missing"])
}

private func runFocusStealRegisteredDispatchChecks() async {
    final class Recorder: @unchecked Sendable {
        private let lock = NSLock()
        private var values: [String] = []
        func append(_ value: String) { lock.lock(); defer { lock.unlock() }; values.append(value) }
        var snapshot: [String] { lock.lock(); defer { lock.unlock() }; return values }
    }
    let recorder = Recorder()
    let store = FocusStealRegistrationStore<FocusStealRegistrationCallbacks>(pid: { $0.pid }, becameEmpty: {})
    store.append(FocusStealRegistrationCallbacks(pid: 88, lost: nil, gained: { recorder.append("gained-1") }))
    store.append(FocusStealRegistrationCallbacks(pid: 88, lost: nil, gained: { recorder.append("gained-2") }))
    store.append(FocusStealRegistrationCallbacks(pid: 77, lost: { recorder.append("lost") }, gained: nil))
    store.append(FocusStealRegistrationCallbacks(pid: 55, lost: nil, gained: nil))
    let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    var snapshotReads = 0
    let tasks = state.recordOwnerAndSchedule(.ordinary(pid: 88), physicalFocusPID: 88,
        takeRegistrationSnapshot: {
            snapshotReads += 1
            let snapshot = store.snapshot
            _ = store.removeFirst(pid: 88)
            return snapshot
        }, releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() },
        reportMissingHandler: { _, _ in unexpectedFailure() })
    checkEqual(snapshotReads, 1); checkEqual(tasks.tasks.count, 3)
    for task in tasks.tasks { checkFalse(await task.value) }
    checkEqual(recorder.snapshot.sorted(), ["gained-1", "gained-2", "lost"])
    checkEqual(store.snapshot.map { $0.pid }, [88, 77, 55])
    checkEqual(state.ownershipSnapshot.current.ownerPID, 88)
    checkEqual(state.ownershipSnapshot.previous?.ownerPID, 77)
    // The intercepted logical owner does not receive a gained callback.
    state.recordOwnerAndSchedule(.ordinary(pid: 77), physicalFocusPID: 77, takeRegistrationSnapshot: { [] }, releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
    state.update(FocusStealKeyboardRoute(interceptedPID: 99, recipientPID: 77, interceptedOwnerPID: 88))
    let suppressed = state.recordOwnerAndSchedule(.ordinary(pid: 88), physicalFocusPID: 88,
        takeRegistrationSnapshot: { store.snapshot }, releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
    checkEqual(suppressed.tasks.count, 1)
    for task in suppressed.tasks { checkFalse(await task.value) }
    checkEqual(recorder.snapshot.filter { $0 == "lost" }.count, 2)
}

private func runFocusStealOwnershipHistoryChecks() {
    var trace: [String] = []
    let resolved = initialFocusStealOwnerIdentity(queryKeyFocusPID: { trace.append("query"); return 88 },
        resolveOwner: { checkEqual($0, 88); trace.append("resolve"); return .restricted(ownerPID: 77, sourcePID: 88) },
        workspaceFrontmostPID: { unexpectedFailure() })
    checkEqual(trace, ["query", "resolve"])
    var history = FocusStealOwnershipHistory(current: resolved)
    checkTrue(history.previous == nil)
    history.record(.viewBridge(ViewBridgeFocusIdentities(ownerPID: 77, actualFocusedPID: 66)))
    guard case .restricted(let previousOwner, let previousSource)? = history.previous else { unexpectedFailure() }
    checkEqual(previousOwner, 77); checkEqual(previousSource, 88)
    guard case .viewBridge(let bridge) = history.current else { unexpectedFailure() }
    checkEqual(bridge.ownerPID, 77); checkEqual(bridge.actualFocusedPID, 66)
    history.record(.ordinary(pid: 55))
    guard case .viewBridge(let oldBridge)? = history.previous else { unexpectedFailure() }
    checkEqual(oldBridge.actualFocusedPID, 66); checkEqual(history.current.ownerPID, 55)
    for workspace: Int32? in [nil, 44] {
        let fallback = initialFocusStealOwnerIdentity(queryKeyFocusPID: { nil },
            resolveOwner: { _ in unexpectedFailure() }, workspaceFrontmostPID: { workspace })
        guard case .ordinary(let pid) = fallback else { unexpectedFailure() }
        checkEqual(pid, workspace ?? 0)
    }
}

private func runFocusStealPhysicalFocusChecks() {
    let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    let event = CGEvent(source: nil)!
    checkEqual(state.observePhysicalFocusPID(88), .noRoute)
    _ = state.filterKeyFocusTaken(event, incomingFocusPID: 88, destinationPID: 77,
        resolveOwnerPID: { _ in 66 }, isRegistered: { _ in true })
    checkEqual(state.observePhysicalFocusPID(77), .recipientFocus)
    checkEqual(state.observePhysicalFocusPID(88), .firstInterceptedFocus)
    checkEqual(state.observePhysicalFocusPID(88), .repeatedInterceptedFocus)
    event.setIntegerValueField(.eventTargetUnixProcessID, value: 88)
    checkTrue(state.filter(event, post: { _, pid in checkEqual(pid, 77) }) == nil)
    checkTrue(state.filterKeyFocusReturned(event, destinationPID: 77) == nil)
    // Logical owner is not a physical endpoint: it must clear the route.
    checkEqual(state.observePhysicalFocusPID(66), .cleared)
    checkTrue(state.filter(event, post: { _, _ in unexpectedFailure() }) === event)
    state.update(FocusStealKeyboardRoute(interceptedPID: 88, recipientPID: 77))
    checkEqual(state.observePhysicalFocusPID(88), .firstInterceptedFocus)
    checkTrue(state.filterKeyFocusReturned(event, destinationPID: 77) == nil)
    let change = state.recordOwnerAndSchedule(.restricted(ownerPID: 66, sourcePID: 88),
        physicalFocusPID: 88, takeRegistrationSnapshot: { [] }, releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
    checkEqual(change.routeObservation, .repeatedInterceptedFocus)
    checkEqual(state.ownershipSnapshot.current.ownerPID, 66)
    checkTrue(change.firstInterceptedFocusReleaseSucceeded == nil)
    for succeeds in [false, true] {
        state.update(FocusStealKeyboardRoute(interceptedPID: 88, recipientPID: 77))
        var calls = 0
        let first = state.recordOwnerAndSchedule(.restricted(ownerPID: 66, sourcePID: 88),
            physicalFocusPID: 88, takeRegistrationSnapshot: { [] },
            releaseFirstInterceptedFocus: { calls += 1; return succeeds }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
        checkEqual(first.routeObservation, .firstInterceptedFocus)
        checkEqual(first.firstInterceptedFocusReleaseSucceeded, succeeds)
        let repeated = state.recordOwnerAndSchedule(.restricted(ownerPID: 66, sourcePID: 88),
            physicalFocusPID: 88, takeRegistrationSnapshot: { [] },
            releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
        checkTrue(repeated.firstInterceptedFocusReleaseSucceeded == nil)
        checkEqual(calls, 1)
    }
}

private func runSystemKeyFocusReleaseChecks() {
    let event = CGEvent(source: nil)!
    event.timestamp = 98765
    var reports: [SystemKeyFocusReleaseFailure] = []
    checkFalse(releaseSystemKeyFocus(for: event, idField: nil,
        readID: { _, _ in unexpectedFailure() }, release: { _ in unexpectedFailure() }, reportFailure: { reports.append($0) }))
    checkEqual(reports, [.unavailableIDField])
    for id: UInt32 in [0, 123, UInt32.max] {
        for status: Int32 in [0, -50, -600] {
            reports = []
            var releases: [UInt32] = []
            let success = releaseSystemKeyFocus(for: event,
                readID: { received, field in
                    checkTrue(received === event); checkEqual(field.rawValue, 71); return Int64(id)
                }, release: { releases.append($0); return status }, reportFailure: { reports.append($0) })
            checkEqual(success, status == 0); checkEqual(releases, [id])
            checkEqual(reports, status == 0 ? [] : [.status(status)])
            checkEqual(event.timestamp, 98765)
        }
    }
}

private func runViewBridgeFocusTransitionEligibilityChecks() {
    let ordinary = KeyFocusOwnerIdentity.ordinary(pid: 77)
    let restricted = KeyFocusOwnerIdentity.restricted(ownerPID: 77, sourcePID: 88)
    let previous = KeyFocusOwnerIdentity.viewBridge(ViewBridgeFocusIdentities(ownerPID: 77, actualFocusedPID: nil))
    for old in [ordinary, restricted, previous] {
        for owner: Int32 in [77, 66] {
            for actual: Int32? in [nil, 99] {
                let current = KeyFocusOwnerIdentity.viewBridge(ViewBridgeFocusIdentities(ownerPID: owner, actualFocusedPID: actual))
                for observation: FocusStealRouteObservation in [.noRoute, .firstInterceptedFocus, .repeatedInterceptedFocus, .recipientFocus, .cleared] {
                    for registered in [false, true] {
                        var reads = 0
                        let result = viewBridgeFocusTransitionNeedsInspection(previous: old,
                            current: current, routeObservation: observation, isRegistered: {
                                reads += 1; checkEqual($0, owner); return registered
                            })
                        let eligibleType: Bool
                        if case .viewBridge = old { eligibleType = true } else { eligibleType = false }
                        let eligibleRoute = observation != .firstInterceptedFocus && observation != .repeatedInterceptedFocus
                        checkEqual(reads, eligibleType && eligibleRoute ? 1 : 0)
                        checkEqual(result, eligibleType && eligibleRoute && registered && owner != 77)
                    }
                }
            }
        }
        checkFalse(viewBridgeFocusTransitionNeedsInspection(previous: old, current: ordinary,
            routeObservation: .noRoute, isRegistered: { _ in unexpectedFailure() }))
    }
    let state = FocusStealKeyboardRoutingState(initialOwner: previous)
    let changed = state.recordOwnerAndSchedule(.viewBridge(ViewBridgeFocusIdentities(ownerPID: 66, actualFocusedPID: 99)),
        physicalFocusPID: 99, takeRegistrationSnapshot: { [] },
        releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { checkEqual($0, 66); return true },
        compensateViewBridge: { checkEqual($0, 77); return false })
    checkTrue(changed.didAttemptViewBridgeCompensation)
    checkTrue(changed.firstInterceptedFocusReleaseSucceeded == nil)
}

private func runViewBridgeKeyFocusRefreshChecks() throws {
    var events: [CGEvent] = [], timestamps: [CGEventTimestamp] = []
    var clock: CGEventTimestamp = 100
    try refreshViewBridgeKeyFocus(for: 77, send: { event, pid in
        dispatchNativeEvent(event, to: pid, timestamp: { clock += 1; return clock }, post: { posted, destination in
            checkEqual(destination, 77); events.append(posted); timestamps.append(posted.timestamp)
        })
    })
    checkEqual(events.map { $0.type.rawValue }, [21, 21])
    let subtypes = events.map { UInt16(bitPattern: NSEvent(cgEvent: $0)!.subtype.rawValue) }
    checkEqual(subtypes, [0x4000, 0x8000]); checkEqual(timestamps, [101, 102])
    enum Failure: Error { case construction }
    var trace: [String] = []
    let event = CGEvent(source: nil)!
    do {
        try refreshViewBridgeKeyFocus(for: 77, makeTaken: { trace.append("taken"); return event },
            makeReturned: { trace.append("returned"); throw Failure.construction },
            send: { sent, pid in checkTrue(sent === event); checkEqual(pid, 77); trace.append("send") })
        unexpectedFailure()
    } catch Failure.construction {}
    checkEqual(trace, ["taken", "send", "returned"])
    do {
        try refreshViewBridgeKeyFocus(for: 77, makeTaken: { throw Failure.construction },
            makeReturned: { unexpectedFailure() }, send: { _, _ in unexpectedFailure() })
        unexpectedFailure()
    } catch Failure.construction {}
}

private func runUIElementProcessTypeChecks() {
    for policy in [0, 1, 2] {
        for finished in [false, true] {
            var trace: [String] = []
            let type = uiElementProcessType(application: { 88 }, activationPolicy: {
                checkEqual($0, 88); trace.append("policy"); return policy
            }, isFinishedLaunching: { checkEqual($0, 88); trace.append("finished"); return finished })
            checkEqual(trace, ["policy", "finished"])
            checkEqual(type, finished ? (policy == 2 ? .viewService : .regularApp) : .nonEventHandlingProcess)
        }
    }
    checkEqual(uiElementProcessType(application: { Optional<Int>.none },
        activationPolicy: { _ in unexpectedFailure() }, isFinishedLaunching: { _ in unexpectedFailure() }), .nonEventHandlingProcess)
    enum Failure: Error { case pid }
    var trace: [String] = []
    let found = containingProcessElement(for: 0, ofTypes: [.regularApp, .viewService],
        parent: { trace.append("parent-\($0)"); return $0 < 3 ? $0 + 1 : nil },
        actualPID: { trace.append("pid-\($0)"); if $0 == 1 { throw Failure.pid }; return Int32($0) },
        classify: { trace.append("type-\($0)"); return $0 == 2 ? .viewService : .nonEventHandlingProcess },
        reportError: { _ in trace.append("error") })
    checkEqual(found?.element, 2); checkEqual(found?.pid, 2); checkEqual(found?.processType, .viewService)
    checkEqual(trace, ["parent-0", "pid-0", "type-0", "parent-1", "pid-1", "error", "parent-2", "pid-2", "type-2"])
    var parents = 0, reads = 0, classifications = 0
    let empty = containingProcessElement(for: 0, ofTypes: [],
        parent: { node in parents += 1; return node + 1 },
        actualPID: { _ in reads += 1; return 88 },
        classify: { _ in classifications += 1; return .regularApp }, reportError: { _ in unexpectedFailure() })
    checkTrue(empty == nil)
    checkEqual(parents, 301); checkEqual(reads, 301); checkEqual(classifications, 301)
}

private func runViewBridgeFocusCompensationChecks() {
    for hasElement in [false, true] {
        for type: UIElement.ProcessType? in [nil, .regularApp, .viewService] {
            for registered in [false, true] {
                for released in [false, true] {
                    var trace: [String] = []
                    let result = compensateViewBridgeFocus(previousOwnerPID: 77,
                        focusedElement: { trace.append("focus"); return hasElement ? 123 : nil },
                        containingProcess: { element, types in
                            checkEqual(element, 123); checkEqual(types, [.regularApp, .viewService])
                            trace.append("contain"); return type
                        }, isRegisteredOwner: { checkEqual($0, 77); trace.append("registered"); return registered },
                        releaseFocus: { trace.append("release"); return released },
                        scheduleRefresh: { checkEqual($0, 77); trace.append("refresh") })
                    var expected = ["focus"]
                    if hasElement {
                        expected.append("contain")
                        if let type {
                            expected.append("registered")
                            if !registered { expected.append(type == .regularApp ? "release" : "refresh") }
                        }
                    }
                    checkEqual(trace, expected)
                    checkEqual(result, hasElement && type == .regularApp && !registered && released)
                }
            }
        }
    }
}

private func runViewBridgeReleaseMetadataChecks() {
    let bridge = KeyFocusOwnerIdentity.viewBridge(ViewBridgeFocusIdentities(ownerPID: 77, actualFocusedPID: nil))
    var history = FocusStealOwnershipHistory(current: bridge)
    checkFalse(history.lastViewBridgeFocusReleaseSucceeded)
    history.recordFocusReleaseResult(true)
    for identity in [KeyFocusOwnerIdentity.ordinary(pid: 77), .restricted(ownerPID: 77, sourcePID: 88)] {
        history.record(identity); history.recordFocusReleaseResult(false)
        checkTrue(history.lastViewBridgeFocusReleaseSucceeded)
    }
    for actual: Int32? in [nil, 88] {
        history.record(.viewBridge(ViewBridgeFocusIdentities(ownerPID: 77, actualFocusedPID: actual)))
        history.recordFocusReleaseResult(false); checkFalse(history.lastViewBridgeFocusReleaseSucceeded)
        history.recordFocusReleaseResult(true); checkTrue(history.lastViewBridgeFocusReleaseSucceeded)
    }
    let state = FocusStealKeyboardRoutingState(initialOwner: bridge)
    _ = state.recordOwnerAndSchedule(.viewBridge(ViewBridgeFocusIdentities(ownerPID: 66, actualFocusedPID: 99)),
        physicalFocusPID: 99, takeRegistrationSnapshot: { [] },
        releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in true },
        compensateViewBridge: { checkEqual($0, 77); return true })
    checkTrue(state.ownershipSnapshot.lastViewBridgeFocusReleaseSucceeded)
    _ = state.recordOwnerAndSchedule(.ordinary(pid: 55), physicalFocusPID: 55,
        takeRegistrationSnapshot: { [] }, releaseFirstInterceptedFocus: { unexpectedFailure() },
        isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
    checkTrue(state.ownershipSnapshot.lastViewBridgeFocusReleaseSucceeded)
    _ = state.recordOwnerAndSchedule(bridge, physicalFocusPID: 88,
        takeRegistrationSnapshot: { [] }, releaseFirstInterceptedFocus: { unexpectedFailure() },
        isRegisteredOwner: { _ in unexpectedFailure() }, compensateViewBridge: { _ in unexpectedFailure() })
    checkFalse(state.ownershipSnapshot.lastViewBridgeFocusReleaseSucceeded)
}

private func runFocusStealNewFrontChecks() {
    let event = CGEvent(source: nil)!
    event.setIntegerValueField(.eventTargetUnixProcessID, value: 88)
    let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    for pid: Int32? in [nil, 77, 66, 88] {
        state.update(FocusStealKeyboardRoute(interceptedPID: 88, recipientPID: 77, interceptedOwnerPID: 66))
        checkTrue(state.filterNewFront(event, readFocusPID: { received in checkTrue(received === event); return pid }) === event)
        var posts = 0
        let routed = state.filter(event, post: { _, recipient in checkEqual(recipient, 77); posts += 1 })
        checkEqual(posts, pid == 88 ? 0 : 1)
        checkTrue(pid == 88 ? routed === event : routed == nil)
    }
    let previous = KeyFocusOwnerIdentity.viewBridge(ViewBridgeFocusIdentities(ownerPID: 77, actualFocusedPID: nil))
    let suppressing = FocusStealKeyboardRoutingState(initialOwner: previous)
    _ = suppressing.recordOwnerAndSchedule(.viewBridge(ViewBridgeFocusIdentities(ownerPID: 66, actualFocusedPID: 99)),
        physicalFocusPID: 99, takeRegistrationSnapshot: { [] },
        releaseFirstInterceptedFocus: { unexpectedFailure() }, isRegisteredOwner: { _ in true },
        compensateViewBridge: { _ in true })
    suppressing.update(FocusStealKeyboardRoute(interceptedPID: 88, recipientPID: 77))
    checkTrue(suppressing.filterNewFront(event, readFocusPID: { _ in 88 }) == nil)
    checkTrue(suppressing.filter(event, post: { _, _ in unexpectedFailure() }) === event)
    // Missing focus field and subsequent new-front events still suppress;
    // this callback must not clear the release-result metadata.
    checkTrue(suppressing.filterNewFront(event, readFocusPID: { _ in nil }) == nil)
    checkTrue(suppressing.ownershipSnapshot.lastViewBridgeFocusReleaseSucceeded)
}

private func runSystemFocusNotificationRoutingChecks() {
    let event = CGEvent(source: nil)!
    func exercise(destination: Int32, bridge: Int32?, subtypes: [UInt16],
                  expectedHandler: String?, fields: [UInt32]) {
        var reads: [UInt32] = [], invoked: [String] = [], subtypeIndex = 0
        let result = routeSystemFocusNotification(event, viewBridgePID: bridge,
            readInteger: { received, field in
                checkTrue(received === event); reads.append(field.rawValue)
                switch field.rawValue {
                case 40: return Int64(destination)
                case 64:
                    let value = subtypes[subtypeIndex]; subtypeIndex += 1; return Int64(value)
                case 73: return 88
                default: unexpectedFailure()
                }
            }, taken: { received, pid, dest in
                checkTrue(received === event); checkEqual(pid, 88); checkEqual(dest, destination)
                invoked.append("taken"); return nil
            }, returned: { received, dest in
                checkTrue(received === event); checkEqual(dest, destination)
                invoked.append("returned"); return nil
            }, changed: { received, pid in
                checkTrue(received === event); checkEqual(pid, 88); invoked.append("changed")
            }, newFront: { received in checkTrue(received === event); invoked.append("front"); return nil })
        checkEqual(reads, fields)
        checkEqual(invoked, expectedHandler.map { [$0] } ?? [])
        if expectedHandler == nil || expectedHandler == "changed" { checkTrue(result === event) }
        else { checkTrue(result == nil) }
    }
    // Taken/returned are not restricted to ViewBridge destination.
    exercise(destination: 77, bridge: nil, subtypes: [0x4000], expectedHandler: "taken", fields: [40,64,73])
    exercise(destination: 77, bridge: 99, subtypes: [0x8000], expectedHandler: "returned", fields: [40,64])
    exercise(destination: 77, bridge: 99, subtypes: [0xf102], expectedHandler: nil, fields: [40,64])
    exercise(destination: 77, bridge: nil, subtypes: [2], expectedHandler: nil, fields: [40,64])
    exercise(destination: 77, bridge: 77, subtypes: [0xf102,0xf102], expectedHandler: "changed", fields: [40,64,64,73])
    exercise(destination: 77, bridge: 77, subtypes: [2,2], expectedHandler: "front", fields: [40,64,64])
    exercise(destination: 77, bridge: 77, subtypes: [0,0xf102], expectedHandler: "changed", fields: [40,64,64,73])
    exercise(destination: 77, bridge: 77, subtypes: [0,0], expectedHandler: nil, fields: [40,64,64])
    var constants = SystemFocusNotificationConstants()
    constants.subtypeField = nil; constants.taken = nil
    var trace: [UInt32] = []
    let missing = routeSystemFocusNotification(event, viewBridgePID: nil, constants: constants,
        readInteger: { _, field in trace.append(field.rawValue); return field.rawValue == 40 ? 77 : 88 },
        taken: { _, pid, destination in checkEqual(pid, 88); checkEqual(destination, 77); return nil },
        returned: { _, _ in unexpectedFailure() }, changed: { _, _ in unexpectedFailure() },
        newFront: { _ in unexpectedFailure() })
    checkTrue(missing == nil); checkEqual(trace, [40,73])
    constants.focusPIDField = nil
    let noFocusField = routeSystemFocusNotification(event, viewBridgePID: nil, constants: constants,
        readInteger: { _, field in checkEqual(field.rawValue, 40); return 77 },
        taken: { _, _, _ in unexpectedFailure() }, returned: { _, _ in unexpectedFailure() },
        changed: { _, _ in unexpectedFailure() }, newFront: { _ in unexpectedFailure() })
    checkTrue(noFocusField === event)
}

private func runSystemFocusNotificationMonitorChecks() {
    final class Owner: SystemFocusNotificationHandling {
        var calls = 0
        func filterSystemFocusNotification(_ event: CGEvent, viewBridgePID: Int32?) -> CGEvent? {
            calls += 1; checkEqual(viewBridgePID, 77); return nil
        }
    }
    var callback: CGEventTapCallBack?, info: UnsafeMutableRawPointer?
    var trace: [String] = []
    let driver = EventTap.Driver(create: { location, placement, options, mask, cb, context in
        guard case .session(.cgAnnotatedSessionEventTap) = location else { unexpectedFailure() }
        checkEqual(placement.rawValue, 1); checkEqual(options.rawValue, 0)
        checkEqual(mask, CGEventMask(1) << 21)
        callback = cb; info = context; trace.append("create")
        var portContext = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &portContext, nil)
    }, enable: { _, enabled in trace.append(enabled ? "enable" : "disable") },
        invalidate: { CFMachPortInvalidate($0); trace.append("invalidate") })
    var owner: Owner? = Owner()
    weak var weakOwner = owner
    var monitor: SystemFocusNotificationMonitor? = SystemFocusNotificationMonitor(viewBridgePID: 77,
        owner: owner!, driver: driver)
    let event = CGEvent(source: nil)!
    checkTrue(callback!(OpaquePointer(bitPattern: 1)!, CGEventType(rawValue: 21)!, event, info) == nil)
    checkEqual(owner!.calls, 1)
    owner = nil; checkTrue(weakOwner == nil)
    checkTrue(callback!(OpaquePointer(bitPattern: 1)!, CGEventType(rawValue: 21)!, event, info)?.takeUnretainedValue() === event)
    checkTrue(monitor != nil); monitor = nil
    checkEqual(trace, ["create", "enable", "disable", "invalidate"])
}

private enum ViewBridgeRefreshTaskTestContext {
    @TaskLocal static var value = 0
}
private func runViewBridgeRefreshTaskChecks() async throws {
    try await ViewBridgeRefreshTaskTestContext.$value.withValue(99) {
        let task = scheduleViewBridgeKeyFocusRefresh(for: 77, operation: { pid in
            checkEqual(pid, 77); checkEqual(ViewBridgeRefreshTaskTestContext.value, 99)
        })
        try await task.value
    }
    enum Failure: Error { case construction }
    final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        func increment() { lock.lock(); defer { lock.unlock() }; count += 1 }
        var value: Int { lock.lock(); defer { lock.unlock() }; return count }
    }
    let counter = Counter()
    let failed = scheduleViewBridgeKeyFocusRefresh(for: 77, operation: { pid in
        checkEqual(pid, 77); counter.increment(); throw Failure.construction
    })
    do { try await failed.value; unexpectedFailure() }
    catch Failure.construction {}
    checkEqual(counter.value, 1)
}

private func runFocusStealCallbackResourceLifetimeChecks() async {
    final class Resource {}
    final class Fixture: @unchecked Sendable {
        let store = FocusStealRegistrationStore<FocusStealRegistrationCallbacks>(pid: { $0.pid }, becameEmpty: {})
        private let lock = NSLock()
        private var resource: Resource? = Resource()
        weak var observed: Resource?
        init() { observed = resource }
        var retained: Resource { lock.lock(); defer { lock.unlock() }; return resource! }
        func unregisterAndDropOwner() {
            checkTrue(store.removeFirst(pid: 88))
            lock.lock(); resource = nil; lock.unlock()
            checkTrue(observed != nil)
        }
    }
    for missing in [false, true] {
        let fixture = Fixture()
        let lostHandler: (@Sendable () -> Void)?
        if missing { lostHandler = nil }
        else { lostHandler = { fixture.unregisterAndDropOwner() } }
        fixture.store.append(FocusStealRegistrationCallbacks(pid: 88,
            lost: lostHandler, gained: nil,
            retaining: [fixture.retained]))
        var task: Task<Bool, Never>? = {
            let registration = fixture.store.snapshot[0]
            return scheduleFocusStealRegistrationCallback(registration, transition: .lost,
                reportMissingHandler: { _, _ in fixture.unregisterAndDropOwner() })!
        }()
        checkEqual(await task!.value, missing)
        task = nil
        // Allow a resumed waiter to run before task-context ARC cleanup.
        for _ in 0..<1000 {
            if fixture.observed == nil { break }
            await Task.yield()
        }
        checkTrue(fixture.observed == nil)
        checkTrue(fixture.store.snapshot.isEmpty)
    }
}

private func runFocusStealRegistrationResourceChecks() {
    var creates = 0, invalidations = 0, emptyTransitions = 0
    let driver = EventTap.Driver(create: { location, placement, options, mask, _, _ in
        guard case .process(88) = location else { unexpectedFailure() }
        checkEqual(placement.rawValue, 1); checkEqual(options.rawValue, 0)
        checkEqual(mask, FocusStealKeyboardMonitor.mask); creates += 1
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0); invalidations += 1 })
    let state = FocusStealKeyboardRoutingState(initialOwner: .ordinary(pid: 77))
    let store = FocusStealRegistrationStore<FocusStealRegistration>(pid: { $0.pid }, becameEmpty: { emptyTransitions += 1 })
    var first: FocusStealRegistration? = FocusStealRegistration(pid: 88, helperPID: 99, state: state,
        targetLostFocusHandler: nil, targetGainedFocusHandler: nil, driver: driver)
    checkTrue(first!.mouseEventTaps == nil); checkFalse(first!.isMenuDismissalSuppressionEnabled)
    weak var firstMonitor = first!.keyboardMonitor
    var payload: FocusStealRegistrationCallbacks? = first!.callbackSnapshot
    store.append(first!); first = nil
    store.append(FocusStealRegistration(pid: 88, helperPID: 99, state: state,
        targetLostFocusHandler: nil, targetGainedFocusHandler: nil, driver: driver))
    checkEqual(creates, 2)
    checkFalse(store.removeFirst(pid: 55)); checkEqual(invalidations, 0)
    checkTrue(store.removeFirst(pid: 88))
    checkTrue(firstMonitor != nil); checkEqual(invalidations, 0)
    checkTrue(store.removeFirst(pid: 88)); checkEqual(emptyTransitions, 1)
    checkEqual(invalidations, 1)
    checkTrue(payload != nil); payload = nil
    checkTrue(firstMonitor == nil); checkEqual(invalidations, 2)
}

private func runSystemFocusStealPreventerChecks() {
    var transactionReads = 0
    let systemDependencies = SystemFocusStealPreventer.Dependencies.system(transaction: {
        transactionReads += 1; return nil
    }, reportAXError: { _ in unexpectedFailure() }, reportReleaseFailure: { _ in unexpectedFailure() })
    checkEqual(transactionReads, 0)
    // Guaranteed nonexistent PID: exercises only read-only owner discovery,
    // with no AX element construction, activation, release or event posting.
    checkEqual(systemDependencies.resolveOwner(Int32.max).ownerPID, Int32.max)
    checkEqual(systemDependencies.resolveOwner(Int32.max).ownerPID, Int32.max)
    checkEqual(transactionReads, 2)
    var taps: [(callback: CGEventTapCallBack, info: UnsafeMutableRawPointer)] = []
    var locations: [String] = [], trace: [String] = []
    var invalidations = 0, emptyTransitions = 0
    let driver = EventTap.Driver(create: { location, placement, options, mask, callback, info in
        checkEqual(placement.rawValue, 1); checkEqual(options.rawValue, 0)
        switch location {
        case .session(let kind):
            checkEqual(kind.rawValue, 2); checkEqual(mask, CGEventMask(1) << 21)
            locations.append("session")
        case .process(let pid):
            checkTrue(pid == 99 || pid == 88); checkEqual(mask, FocusStealKeyboardMonitor.mask)
            locations.append("process-\(pid)")
        }
        trace.append("tap-\(locations.last!)")
        taps.append((callback, info))
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0); invalidations += 1 })
    var destination: Int32 = 77, subtype: UInt16 = 0x4000
    var releases = 0, posts: [Int32] = []
    let keyboard = CGEvent(source: nil)!
    keyboard.setIntegerValueField(.eventSourceUnixProcessID, value: 44)
    keyboard.setIntegerValueField(.eventTargetUnixProcessID, value: 88)
    keyboard.timestamp = 123
    let dependencies = SystemFocusStealPreventer.Dependencies(readInteger: { _, field in
        switch field.rawValue {
        case 40: return Int64(destination)
        case 64: return Int64(subtype)
        case 73: return 88
        default: unexpectedFailure()
        }
    }, resolveOwner: { trace.append("resolve-\($0)"); return .ordinary(pid: $0) },
        releaseFocus: { _ in releases += 1; return true },
        compensateViewBridge: { _, _, _ in unexpectedFailure() },
        postKeyboard: { sent, pid in checkTrue(sent === keyboard); checkEqual(sent.timestamp, 123); posts.append(pid) })
    var owner: SystemFocusStealPreventer? = SystemFocusStealPreventer(
        initialOwner: { trace.append("owner"); return .ordinary(pid: 77) },
        viewBridgePID: { trace.append("bridge"); return 99 }, helperPID: 55,
        dependencies: dependencies, tapDriver: driver, becameEmpty: { emptyTransitions += 1 })
    weak var weakOwner = owner
    checkEqual(trace, ["owner", "bridge", "tap-session", "tap-process-99"])
    owner!.register(pid: 88, lost: nil, gained: nil)
    owner!.register(pid: 88, lost: nil, gained: nil)
    checkEqual(locations, ["session", "process-99", "process-88", "process-88"])
    let notification = CGEvent(source: nil)!
    func notify() -> CGEvent? {
        taps[0].callback(OpaquePointer(bitPattern: 1)!, CGEventType(rawValue: 21)!, notification, taps[0].info)?.takeUnretainedValue()
    }
    func key() -> CGEvent? {
        taps[2].callback(OpaquePointer(bitPattern: 1)!, .keyDown, keyboard, taps[2].info)?.takeUnretainedValue()
    }
    checkTrue(notify() == nil)
    checkTrue(key() == nil); checkEqual(posts, [77])
    subtype = 0x8000
    checkTrue(notify() == nil); checkTrue(notify() === notification)
    subtype = 0xf102; destination = 99
    checkTrue(notify() === notification); checkEqual(releases, 1)
    checkEqual(owner!.ownershipSnapshot.current.ownerPID, 88)
    checkEqual(owner!.ownershipSnapshot.previous?.ownerPID, 77)
    checkTrue(notify() === notification); checkEqual(releases, 1)
    subtype = 2
    checkTrue(notify() === notification)
    checkTrue(key() === keyboard); checkEqual(posts, [77])
    checkFalse(owner!.unregister(pid: 55))
    checkTrue(owner!.unregister(pid: 88)); checkEqual(invalidations, 1)
    checkTrue(owner!.isRegistered(pid: 88))
    checkTrue(owner!.unregister(pid: 88)); checkEqual(invalidations, 2)
    checkEqual(emptyTransitions, 1)
    owner = nil; checkTrue(weakOwner == nil); checkEqual(invalidations, 4)
    var noBridge: SystemFocusStealPreventer? = SystemFocusStealPreventer(
        initialOwner: { .ordinary(pid: 77) }, viewBridgePID: { nil },
        dependencies: dependencies, tapDriver: driver, becameEmpty: { unexpectedFailure() })
    checkTrue(noBridge != nil); checkEqual(locations.count, 5); checkEqual(locations.last, "session")
    noBridge = nil; checkEqual(invalidations, 5)
    var constructions = 0, initialQueries = 0
    weak var lifecycleOwner: SystemFocusStealPreventer?
    let lifecycle = FocusStealPreventerLifecycle(makeInstance: { empty in
        constructions += 1
        let created = SystemFocusStealPreventer(initialOwner: { .ordinary(pid: 77) },
            viewBridgePID: { nil }, dependencies: dependencies, tapDriver: driver, becameEmpty: empty)
        lifecycleOwner = created
        return created
    }, resolveInitialOwner: { initialQueries += 1; return .ordinary(pid: 66) })
    lifecycle.stopPreventingFocusStealing(for: 88)
    checkEqual(constructions, 0)
    checkTrue(lifecycle.isAppCurrentlyFocused(66)); checkEqual(initialQueries, 1)
    lifecycle.startPreventingFocusStealing(for: 88, targetLostFocusHandler: nil, targetGainedFocusHandler: nil)
    lifecycle.startPreventingFocusStealing(for: 88, targetLostFocusHandler: nil, targetGainedFocusHandler: nil)
    checkEqual(constructions, 1); checkTrue(lifecycleOwner != nil)
    checkTrue(lifecycle.isAppCurrentlyFocused(77)); checkFalse(lifecycle.isAppCurrentlyFocused(66))
    checkEqual(initialQueries, 1)
    lifecycle.stopPreventingFocusStealing(for: 55)
    lifecycle.stopPreventingFocusStealing(for: 88)
    checkTrue(lifecycleOwner != nil)
    lifecycle.stopPreventingFocusStealing(for: 88)
    checkTrue(lifecycleOwner == nil)
    checkTrue(lifecycle.isAppCurrentlyFocused(66)); checkEqual(initialQueries, 2)
    lifecycle.startPreventingFocusStealing(for: 88, targetLostFocusHandler: nil, targetGainedFocusHandler: nil)
    checkEqual(constructions, 2)
    lifecycle.stopPreventingFocusStealing(for: 88); checkTrue(lifecycleOwner == nil)
}

private func runMenuDismissalSuppressionChecks() {
    let event = CGEvent(source: nil)!
    var enabled = false, window: UInt32? = 123, owner: Int32? = 88
    var reads = 0
    func filter() -> CGEvent? {
        filterMenuDismissalEvent(event, targetPID: 88, menuPID: 99,
            suppressionEnabled: { enabled }, eventWindowID: { reads += 1; return window },
            windowOwnerPID: { checkEqual($0, 123); return owner })
    }
    checkTrue(filter() === event); checkEqual(reads, 0)
    enabled = true
    checkTrue(filter() === event)
    owner = 99; checkTrue(filter() === event)
    owner = 77; checkTrue(filter() == nil)
    owner = nil; checkTrue(filter() === event)
    window = nil; checkTrue(filter() === event)
    var pids: [Int32] = [], invalidations = 0
    var callbacks: [(CGEventTapCallBack, UnsafeMutableRawPointer)] = []
    let driver = EventTap.Driver(create: { location, place, options, mask, callback, info in
        guard case .process(let pid) = location else { unexpectedFailure() }
        pids.append(pid); checkEqual(place.rawValue, 0); checkEqual(options.rawValue, 0)
        checkEqual(mask, [1,2,6,3,4,7,25,26,27].reduce(CGEventMask(0)) { $0 | CGEventMask(1) << $1 })
        callbacks.append((callback, info))
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0); invalidations += 1 })
    var invoked = 0
    var taps: [EventTap]? = menuDismissalEventTaps(targetPID: 88, menuPID: 88, driver: driver) { _, sent in
        checkTrue(sent === event); invoked += 1; return nil
    }
    checkEqual(taps?.count, 2); checkEqual(pids, [88,88])
    for (callback, info) in callbacks {
        checkTrue(callback(OpaquePointer(bitPattern: 1)!, .leftMouseDown, event, info) == nil)
    }
    checkEqual(invoked, 2)
    taps = nil; checkEqual(invalidations, 2)
    taps = menuDismissalEventTaps(targetPID: 77, menuPID: nil, driver: driver) { _, event in event }
    checkEqual(taps?.count, 1); checkEqual(pids, [88,88,77])
    taps = nil; checkEqual(invalidations, 3)

    let menuMask = [1,2,6,3,4,7,25,26,27].reduce(CGEventMask(0)) { $0 | CGEventMask(1) << $1 }
    let combinedDriver = EventTap.Driver(create: { location, place, options, mask, callback, info in
        if mask == menuMask { return driver.create(location, place, options, mask, callback, info) }
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: driver.invalidate)
    let dependencies = SystemFocusStealPreventer.Dependencies(resolveOwner: { .ordinary(pid: $0) },
        releaseFocus: { _ in unexpectedFailure() }, compensateViewBridge: { _, _, _ in unexpectedFailure() })
    var preventer: SystemFocusStealPreventer? = SystemFocusStealPreventer(initialOwner: { .ordinary(pid: 77) },
        viewBridgePID: { nil }, dependencies: dependencies, tapDriver: combinedDriver, becameEmpty: {})
    preventer!.register(pid: 88, lost: nil, gained: nil)
    preventer!.register(pid: 88, lost: nil, gained: nil)
    var windowQueries = 0
    func start(_ pid: Int32, menuPID: Int32?) {
        preventer!.startSuppressingMenuDismissalEvents(for: pid, menuPID: menuPID,
            windowOwnerPID: { _ in windowQueries += 1; return 77 })
    }
    start(88, menuPID: 99)
    let firstCallback = callbacks[3]
    func invoke(_ value: (CGEventTapCallBack, UnsafeMutableRawPointer)) -> CGEvent? {
        value.0(OpaquePointer(bitPattern: 1)!, .leftMouseDown, event, value.1)?.takeUnretainedValue()
    }
    checkTrue(invoke(firstCallback) == nil); checkEqual(windowQueries, 1)
    let beforeStop = invalidations
    preventer!.stopSuppressingMenuDismissalEvents(for: 88)
    checkEqual(invalidations, beforeStop + 2)
    // Duplicate registration remains but is not enabled; restarting replaces
    // only the first record and removal must dispose just that record's taps.
    start(88, menuPID: nil)
    checkTrue(invoke(callbacks.last!) == nil)
    let beforeRemove = invalidations
    checkTrue(preventer!.unregister(pid: 88))
    checkEqual(invalidations, beforeRemove + 2) // mouse tap + first keyboard
    checkTrue(preventer!.isRegistered(pid: 88))
    let beforeMissing = invalidations
    start(77, menuPID: 99) // resources are created then discarded without a record
    checkEqual(invalidations, beforeMissing + 2)
    preventer!.stopSuppressingMenuDismissalEvents(for: 77)
    preventer = nil

    struct Record { let pid: Int32; var enabled: Bool }
    let store = FocusStealRegistrationStore<Record>(pid: { $0.pid }, becameEmpty: {})
    store.append(Record(pid: 88, enabled: false)); store.append(Record(pid: 88, enabled: false))
    checkFalse(store.mutateFirst(pid: 77) { _ in unexpectedFailure() })
    checkTrue(store.mutateFirst(pid: 88) { $0.enabled = true })
    checkEqual(store.snapshot.map { $0.enabled }, [true, false])
    checkTrue(store.mutateFirst(pid: 88) { $0.enabled = false })
    checkEqual(store.snapshot.map { $0.enabled }, [false, false])
}

private func runSyntheticAppFocusEnforcerLifecycleChecks() throws {
    let pid = NSRunningApplication.current.processIdentifier
    var trace: [String] = [], invalidations = 0
    let center = NotificationCenter()
    let driver = EventTap.Driver(create: { location, _, _, mask, _, _ in
        switch location {
        case .session:
            trace.append(mask == 2 ? "click-tap" : "system-tap")
        case .process(let target):
            checkEqual(target, pid)
            trace.append(mask == FocusStealKeyboardMonitor.mask ? "keyboard-tap" : "target-tap")
        }
        var context = CFMachPortContext(version: 0, info: nil, retain: nil, release: nil, copyDescription: nil)
        return CFMachPortCreate(nil, { _, _, _, _ in }, &context, nil)
    }, enable: { _, _ in }, invalidate: { CFMachPortInvalidate($0); invalidations += 1 })
    weak var preventionOwner: SystemFocusStealPreventer?
    let dependencies = SystemFocusStealPreventer.Dependencies(resolveOwner: { .ordinary(pid: $0) },
        releaseFocus: { _ in unexpectedFailure() }, compensateViewBridge: { _, _, _ in unexpectedFailure() })
    let prevention = FocusStealPreventerLifecycle(makeInstance: { empty in
        trace.append("prevention")
        let owner = SystemFocusStealPreventer(initialOwner: { .ordinary(pid: 77) }, viewBridgePID: { nil },
            dependencies: dependencies, tapDriver: driver, becameEmpty: empty)
        preventionOwner = owner; return owner
    }, resolveInitialOwner: { unexpectedFailure() })
    var enforcer: SyntheticAppFocusEnforcer? = SyntheticAppFocusEnforcer(pid: pid, prevention: prevention,
        makeTracker: {
            trace.append("tracker")
            return InclusiveFrontmostApplicationTracker(center: center, initialApplication: { .current })
        }, targetIsActive: { trace.append("active-query"); return false }, tapDriver: driver)
    checkEqual(trace, ["tracker","prevention","system-tap","keyboard-tap","active-query","target-tap"])
    checkFalse(enforcer!.state.applicationIsActive) // observer does not replay tracker initialization
    checkFalse(enforcer!.state.applicationBelievesItHasFocus)
    var sends = 0
    try enforcer!.enforceActiveState(for: nil) { _ in sends += 1 }
    checkEqual(sends, 1); checkEqual(trace.last, "click-tap")
    checkTrue(enforcer!.state.applicationBelievesItIsActive)
    center.post(name: NSWorkspace.didActivateApplicationNotification, object: nil,
        userInfo: [NSWorkspace.applicationUserInfoKey: NSRunningApplication.current])
    // Initial tracker already holds this app, so duplicate notification is suppressed.
    checkFalse(enforcer!.state.applicationIsActive)
    enforcer = nil
    checkTrue(preventionOwner == nil)
    checkEqual(invalidations, 4) // click, activation, process keyboard and system taps
}

private func runSyntheticFocusSafeActivationBranchChecks() async throws {
    struct Application { let pid: Int32; let capture: Int }
    enum Failure: Error { case direct, restoring }
    var captured: Application? = nil
    var trace: [String] = [], failDirect = false, failRestore = false
    func run() async throws {
        try await safelyEnforceSyntheticFocus(targetPID: 88,
            frontmostApplication: { trace.append("capture"); return captured },
            processIdentifier: { trace.append("pid"); return $0.pid }, enforce: {
                trace.append("enforce"); if failDirect { throw Failure.direct }
            }, waitAfterDirectEnforcement: { trace.append("wait") }, restoreOtherApplication: { saved in
                checkEqual(saved.capture, 123)
                trace.append("restore-\(saved.pid)")
                captured = Application(pid: 99, capture: 456)
                checkEqual(saved.capture, 123) // original capture survives later frontmost changes
                if failRestore { throw Failure.restoring }
            })
    }
    try await run(); checkEqual(trace, ["capture", "enforce", "wait"])
    trace = []; captured = Application(pid: 88, capture: 123)
    try await run(); checkEqual(trace, ["capture", "pid", "enforce", "wait"])
    trace = []; captured = Application(pid: 77, capture: 123)
    try await run(); checkEqual(trace, ["capture", "pid", "restore-77"])
    trace = []; captured = nil; failDirect = true
    do { try await run(); unexpectedFailure() } catch Failure.direct {} catch { unexpectedFailure() }
    checkEqual(trace, ["capture", "enforce"])
    trace = []; captured = Application(pid: 77, capture: 123); failRestore = true
    do { try await run(); unexpectedFailure() } catch Failure.restoring {} catch { unexpectedFailure() }
    checkEqual(trace, ["capture", "pid", "restore-77"])
}

private func runSafeActivationSavedWindowChecks() {
    final class Window {}
    enum Failure: Error { case missingID }
    var window: Window? = nil
    var reads = 0
    let absent: SafeActivationSavedWindow<Window> = captureSafeActivationSavedWindow(focusedWindow: {
        reads += 1; return nil
    }, windowID: { _ in unexpectedFailure() })
    checkEqual(reads, 1); checkTrue(absent.window == nil); checkTrue(absent.id == nil)
    window = Window()
    weak var lifetime = window
    var failed: SafeActivationSavedWindow<Window>? = captureSafeActivationSavedWindow(focusedWindow: {
        reads += 1; return window
    }, windowID: { seen in checkTrue(seen === window); throw Failure.missingID })
    window = nil
    checkTrue(failed?.window != nil); checkTrue(failed?.id == nil)
    checkTrue(lifetime != nil) // retained for possible later AXRaise, despite failed ID
    failed = nil; checkTrue(lifetime == nil)
    let valid = Window()
    for id in [UInt32(0), UInt32.max] {
        let saved = captureSafeActivationSavedWindow(focusedWindow: { valid }, windowID: { _ in id })
        checkTrue(saved.window === valid); checkEqual(saved.id, id)
    }
}

private func runUIElementBooleanValueChecks() {
    let attribute = UIElementAttribute("AXFrontmost")
    let ax = AXUIElementCreateApplication(Int32.max)
    func partial(_ value: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    func item(_ attributes: [UIElementAttribute: AXPartialValue], supported: Set<UIElementAttribute> = []) -> UIElement {
        UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: supported, attributes: attributes, transactionAttributes: nil))
    }
    for flag in [false, true] {
        let cached = item([attribute: partial(NSNumber(value: flag))])
        checkEqual(cached.booleanValue(for: attribute, ignoringTypeMismatch: false,
            read: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }), flag)
    }
    let uncached = item([:], supported: [attribute])
    var reads = 0, errors = 0
    func read(_ value: AXPartialValue?, _ error: AXError = .success, ignore: Bool = false) -> Bool? {
        uncached.booleanValue(for: attribute, ignoringTypeMismatch: ignore,
            read: { reads += 1; return (error, value) }, reportError: { _ in errors += 1 })
    }
    checkEqual(read(partial(NSNumber(value: false))), false)
    checkEqual(read(partial(NSNumber(value: true))), true)
    checkTrue(read(nil) == nil)
    checkTrue(read(nil, .cannotComplete) == nil); checkEqual(errors, 1)
    checkTrue(read(partial("bad" as NSString)) == nil); checkEqual(errors, 2)
    checkTrue(read(partial("bad" as NSString), ignore: true) == nil); checkEqual(errors, 2)
    checkEqual(reads, 6)
    var constructions = 0, frontmost = false
    let driver = systemSafeActivationRestorationDriver(savedApplication: .current,
        savedWindow: SafeActivationSavedWindow<UIElement>(window: nil, id: nil), targetPID: Int32.max,
        targetApplication: {
            constructions += 1; return item([attribute: partial(NSNumber(value: frontmost))])
        }, reportError: { _ in unexpectedFailure() })
    checkEqual(constructions, 0)
    checkFalse(driver.targetBelievesItIsFrontmost())
    frontmost = true
    checkTrue(driver.targetBelievesItIsFrontmost()); checkEqual(constructions, 2)
    do { checkFalse(try driver.restoreSavedWindowIfObscured()) } catch { unexpectedFailure() }
    // No saved ID: no WindowServer query, AXRaise or activation is performed.
    let unsupported = item([:], supported: [UIElementAttribute("AXTitle")])
    checkTrue(unsupported.booleanValue(for: attribute, ignoringTypeMismatch: false,
        read: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }) == nil)
}

private func runRunningApplicationPIDResolutionChecks() {
    var trace: [String] = [], terminated = false, path: String? = "/test/app"
    var matches: [Int32]? = [88]
    func resolve(_ raw: Int32) -> Int32 {
        resolvingApplicationProcessIdentifier(processIdentifier: { raw }, isTerminated: {
            trace.append("terminated"); return terminated
        }, executableURL: { trace.append("path"); return path.map { URL(fileURLWithPath: $0) } }, matchingProcessIdentifiers: {
            trace.append("matches"); checkEqual($0, "/test/app"); return matches
        })
    }
    checkEqual(resolve(77), 77); checkTrue(trace.isEmpty)
    terminated = true
    checkEqual(resolve(0), -1); checkEqual(trace, ["terminated"])
    trace = []; terminated = false; path = nil
    checkEqual(resolve(-1), -1); checkEqual(trace, ["terminated","path"])
    trace = []; path = "/test/app"
    checkEqual(resolve(0), 88); checkEqual(trace, ["terminated","path","matches"])
    matches = nil; checkEqual(resolve(-1), -1)
    matches = []; checkEqual(resolve(-1), -1)
    matches = [88,88]; checkEqual(resolve(-1), -1) // cardinality, not unique PID count
    matches = [88,99]; checkEqual(resolve(-1), -1)
    matches = [0]; checkEqual(resolve(-1), 0) // no extra validation of the sole result
    checkEqual(systemResolvedProcessIdentifier(.current), NSRunningApplication.current.processIdentifier)
}

private func runApplicationFrontmostWaitChecks() async {
    var time = 0.0, reads = 0, sleeps = 0
    var value: Bool? = nil
    func wait(timeout: Double = 0.25, failSleep: Bool = false) async {
        await waitUntilApplicationBelievesItIsFrontmost(timeout: timeout, elapsed: { time },
            readFrontmost: { reads += 1; return value }, sleep: { interval in
                checkEqual(interval, .milliseconds(100)); sleeps += 1
                if failSleep { throw CancellationError() }
                time += 0.1
            })
    }
    await wait(); checkEqual(reads, 3); checkEqual(sleeps, 3)
    time = 0; reads = 0; sleeps = 0; value = true
    await wait(); checkEqual(reads, 1); checkEqual(sleeps, 0)
    time = 0.25; reads = 0; sleeps = 0; value = false
    await wait(); checkEqual(reads, 1); checkEqual(sleeps, 1) // inclusive timeout boundary
    time = 0.251; reads = 0; sleeps = 0
    await wait(); checkEqual(reads, 0); checkEqual(sleeps, 0)
    time = 0; reads = 0; sleeps = 0
    await wait(failSleep: true); checkEqual(reads, 1); checkEqual(sleeps, 1)
}

@MainActor private func runTargetFocusEnforcerOwnershipChecks() {
    let pid = NSRunningApplication.current.processIdentifier
    let driver = EventTap.Driver(create: { _, _, _, _, _, _ in nil },
        enable: { _, _ in unexpectedFailure() }, invalidate: { _ in unexpectedFailure() })
    let dependencies = SystemFocusStealPreventer.Dependencies(resolveOwner: { .ordinary(pid: $0) },
        releaseFocus: { _ in unexpectedFailure() }, compensateViewBridge: { _, _, _ in unexpectedFailure() })
    weak var preventionOwner: SystemFocusStealPreventer?
    let prevention = FocusStealPreventerLifecycle(makeInstance: { empty in
        let owner = SystemFocusStealPreventer(initialOwner: { .ordinary(pid: pid) }, viewBridgePID: { nil },
            dependencies: dependencies, tapDriver: driver, becameEmpty: empty)
        preventionOwner = owner; return owner
    }, resolveInitialOwner: { unexpectedFailure() })
    var constructions = 0
    var target: Target? = Target(.current)
    checkTrue(target!.focusEnforcer == nil); checkEqual(constructions, 0)
    var first: SyntheticAppFocusEnforcer? = target!.activateFocusEnforcer { seenPID in
        checkEqual(seenPID, pid); constructions += 1
        return SyntheticAppFocusEnforcer(pid: pid, prevention: prevention,
            makeTracker: { InclusiveFrontmostApplicationTracker(center: NotificationCenter(), initialApplication: { nil }) },
            targetIsActive: { false }, tapDriver: driver)
    }
    weak var lifetime = first
    checkTrue(target!.activateFocusEnforcer(make: { _ in unexpectedFailure() }) === first)
    checkEqual(constructions, 1)
    first = nil; checkTrue(lifetime != nil); checkTrue(preventionOwner != nil)
    target = nil; checkTrue(lifetime == nil); checkTrue(preventionOwner == nil)
}

private func runActivationPointValueChecks() throws {
    let attribute = UIElementAttribute("AXActivationPoint")
    var point = CGPoint(x: 20, y: 30)
    let value = AXValueCreate(.cgPoint, &point)!
    let partial = AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    let ax = AXUIElementCreateApplication(Int32.max)
    let cached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
        attributes: [attribute: partial], transactionAttributes: nil))
    let decoded = cached.activationPointValue(read: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
    guard case .some(.some(let actual)) = decoded else { unexpectedFailure() }
    checkEqual(actual, point)
    let innerNil: CGPoint?? = try decodeUnpackedAXValue(throwingOnFailure: true, as: CGPoint?.self, unpack: { nil })
    guard case .some(.none) = innerNil else { unexpectedFailure() }
    let uncached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [attribute], attributes: [:], transactionAttributes: nil))
    var errors = 0
    let bad = AXPartialValue(value: AXEncodedValue(value: "bad" as NSString), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    let missing = uncached.activationPointValue(read: { (.success, bad) }, reportError: { _ in errors += 1 })
    guard case .none = missing else { unexpectedFailure() }
    checkEqual(errors, 1)
}

private func runApplicationClickFocusCompositionChecks() async throws {
    let attr = UIElementAttribute("_AXExhibitsMacCatalystBehavior")
    let ax = AXUIElementCreateApplication(Int32.max)
    func application(_ value: Bool) -> UIElement {
        let partial = AXPartialValue(value: AXEncodedValue(value: NSNumber(value: value)), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        return UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [attr: partial], transactionAttributes: nil))
    }
    for flag in [false, true] {
        checkEqual(application(flag).isCatalystApplication(reportError: { _ in unexpectedFailure() }), flag)
    }
    let app = application(false)
    var probes = 0
    let active = try await app.prepareSyntheticClickFocus(element: nil, insideWebView: false,
        clickingByCoordinate: true, hasHeldKey: false, window: nil, enforcer: nil,
        applicationIsActive: { probes += 1; return false }, reportError: { _ in unexpectedFailure() },
        send: { _ in unexpectedFailure() })
    checkFalse(active); checkEqual(probes, 1)
    try await app.prepareAccessibilityClickFocus(element: app, window: nil, enforcer: nil,
        probeApplicationIsActive: { probes += 1 }, reportError: { _ in unexpectedFailure() }, send: { _ in unexpectedFailure() })
    checkEqual(probes, 2)
    let driver = EventTap.Driver(create: { _, _, _, _, _, _ in nil }, enable: { _, _ in }, invalidate: { _ in })
    let deps = SystemFocusStealPreventer.Dependencies(resolveOwner: { .ordinary(pid: $0) },
        releaseFocus: { _ in unexpectedFailure() }, compensateViewBridge: { _, _, _ in unexpectedFailure() })
    let prevention = FocusStealPreventerLifecycle(makeInstance: { empty in
        SystemFocusStealPreventer(initialOwner: { .ordinary(pid: 88) }, viewBridgePID: { nil },
            dependencies: deps, tapDriver: driver, becameEmpty: empty)
    }, resolveInitialOwner: { unexpectedFailure() })
    let enforcer = SyntheticAppFocusEnforcer(pid: 88, prevention: prevention,
        makeTracker: { InclusiveFrontmostApplicationTracker(center: NotificationCenter(), initialApplication: { nil }) },
        targetIsActive: { false }, tapDriver: driver)
    let focused = try await app.prepareSyntheticClickFocus(element: nil, insideWebView: true,
        clickingByCoordinate: true, hasHeldKey: true, window: nil, enforcer: enforcer,
        applicationIsActive: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }, send: { _ in unexpectedFailure() })
    checkTrue(focused)
    try await app.prepareAccessibilityClickFocus(element: app, window: nil, enforcer: enforcer,
        probeApplicationIsActive: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }, send: { _ in unexpectedFailure() })
}

private func runApplicationClickEventFlagChecks() throws {
    for input in [CGEventFlags(), .maskShift, .maskCommand, [.maskAlternate, .maskControl]] {
        for prepared in [false, true] {
            let flags = applicationClickEventFlags(input, applicationBelievesItHasFocus: prepared)
            let expected = prepared ? input.rawValue : input.rawValue | 0x100000
            checkEqual(flags.rawValue, expected)
            let events = try mouseClickEvents(point: CGPoint(x: 12, y: 23), button: "left", count: 2, flags: flags)
            checkEqual(events.count, 4)
            for event in events { checkEqual(event.flags.rawValue, expected) }
        }
    }
}

private func runInputSnapshotFocusComparisonChecks() {
    let previous: [String: Any] = ["id": 1, "name": "button", "properties": [kAXFocusedAttribute: false, kAXEnabledAttribute: true]]
    var current: [String: Any] = ["id": 1, "name": "button", "properties": [kAXFocusedAttribute: true, kAXEnabledAttribute: true]]
    checkFalse(inputSnapshotDataEqual(previous, current, allowingFocusChange: false))
    checkTrue(inputSnapshotDataEqual(previous, current, allowingFocusChange: true))
    current["name"] = "different"
    checkFalse(inputSnapshotDataEqual(previous, current, allowingFocusChange: true))
    current["name"] = "button"
    current["properties"] = [kAXFocusedAttribute: true, kAXEnabledAttribute: false]
    checkFalse(inputSnapshotDataEqual(previous, current, allowingFocusChange: true))
    current["properties"] = [kAXFocusedAttribute: true, kAXEnabledAttribute: true, kAXSelectedAttribute: true]
    checkFalse(inputSnapshotDataEqual(previous, current, allowingFocusChange: true))
    current["properties"] = [kAXEnabledAttribute: true]
    checkTrue(inputSnapshotDataEqual(previous, current, allowingFocusChange: true))
    current["frame"] = ["x": 10, "y": 20]
    checkFalse(inputSnapshotDataEqual(previous, current, allowingFocusChange: true))
}

private func runMouseEventWindowSelectionChecks() throws {
    let point = CGPoint(x: 20, y: 30)
    var reads: [Int] = [], trace: [String] = []
    func frame(_ id: Int) -> CGRect? {
        reads.append(id)
        return id == 1 ? nil : CGRect(x: 0, y: 0, width: 100, height: 100)
    }
    let result = try resolveMouseEventWindowAndElement(point, windows: [1,2,3], frame: frame,
        hitTest: { trace.append("hit"); return Optional(99) }, makeTarget: { window, element in
            trace.append("target"); checkEqual(window, 2); checkEqual(element, 99); return window
        })
    checkEqual(result, 2); checkEqual(reads, [1,2]); checkEqual(trace, ["hit","target"])
    do {
        let _: Int = try resolveMouseEventWindowAndElement(point, windows: [Int](), frame: { _ in unexpectedFailure() },
            hitTest: { () -> Int? in unexpectedFailure() }, makeTarget: { _, _ in unexpectedFailure() })
        unexpectedFailure()
    } catch MouseEventWindowSelectionError.noWindows {} catch { unexpectedFailure() }
    do {
        let _: Int = try resolveMouseEventWindowAndElement(point, windows: [1], frame: { _ in nil },
            hitTest: { () -> Int? in unexpectedFailure() }, makeTarget: { _, _ in unexpectedFailure() })
        unexpectedFailure()
    } catch MouseEventWindowSelectionError.noWindowAtPoint(let seen) { checkEqual(seen, point) }
    catch { unexpectedFailure() }
    checkEqual(AXError.illegalArgument.rawValue, -25201)
    let suppressed: Int? = try mouseEventElementAtPoint { throw UIElementError.axError(.illegalArgument) }
    checkTrue(suppressed == nil)
    let absent: Int? = try mouseEventElementAtPoint { nil }
    checkTrue(absent == nil)
    do {
        let _: Int? = try mouseEventElementAtPoint { throw UIElementError.axError(.cannotComplete) }
        unexpectedFailure()
    } catch UIElementError.axError(let error) { checkEqual(error.rawValue, AXError.cannotComplete.rawValue) }
    catch { unexpectedFailure() }
    enum Failure: Error { case hit, target }
    do {
        let _: Int? = try mouseEventElementAtPoint { throw Failure.hit }
        unexpectedFailure()
    } catch Failure.hit {} catch { unexpectedFailure() }
    do {
        let _: Int = try resolveMouseEventWindowAndElement(point, windows: [1], frame: { _ in CGRect(x: 0,y: 0,width: 100,height: 100) },
            hitTest: { () -> Int? in nil }, makeTarget: { _, element in checkTrue(element == nil); throw Failure.target })
        unexpectedFailure()
    } catch Failure.target {} catch { unexpectedFailure() }
}

private func runOutOfProcessMouseTargetChecks() {
    var requested: Set<UIElement.ProcessType> = [], missing = 0
    var selected: (element: Int, processType: UIElement.ProcessType, pid: Int32)? = nil
    func resolve() -> (pid: Int32, effectiveElement: Int)? {
        selectOutOfProcessMouseTarget(for: 7, appPID: 88, containingElement: { element, types in
            checkEqual(element, 7); requested = types; return selected
        }, reportMissingContainer: { missing += 1 })
    }
    checkTrue(resolve() == nil)
    checkEqual(requested, [.regularApp, .viewService]); checkEqual(missing, 1)
    selected = (9, .regularApp, 99)
    checkTrue(resolve() == nil); checkEqual(missing, 1)
    selected = (9, .viewService, 88)
    checkTrue(resolve() == nil)
    selected = (9, .viewService, 99)
    let found = resolve()
    checkEqual(found?.pid, 99); checkEqual(found?.effectiveElement, 9); checkEqual(missing, 1)
    var classified: [Int32] = []
    let blockedByRegular = selectOutOfProcessMouseTarget(for: 0, appPID: 88, containingElement: { start, types in
        containingProcessElement(for: start, ofTypes: types, parent: { $0 < 2 ? $0 + 1 : nil },
            actualPID: { Int32($0 + 10) }, classify: { pid in
                classified.append(pid)
                return pid == 10 ? .regularApp : .viewService
            }, reportError: { _ in unexpectedFailure() })
    }, reportMissingContainer: { unexpectedFailure() })
    checkTrue(blockedByRegular == nil); checkEqual(classified, [10])
}

private func runOutOfProcessMouseWindowIDChecks() throws {
    var ids: [Int] = [], roles: [Int] = [], parents: [Int] = []
    let id = try outOfProcessMouseWindowID(for: 0, parent: { parents.append($0); return $0 < 3 ? $0 + 1 : nil },
        windowID: { node in ids.append(node); if node == 1 { return 0 }; throw UIElementError.axError(.illegalArgument) },
        role: { roles.append($0); return .group })
    checkEqual(id, 0); checkEqual(ids, [0,1]); checkEqual(roles, [0,0]); checkEqual(parents, [0,1])
    for boundary in [UIElementRole.window, .sheet] {
        ids = []; roles = []
        do {
            _ = try outOfProcessMouseWindowID(for: 0, parent: { $0 + 1 }, windowID: { node in
                ids.append(node); throw UIElementError.axError(.illegalArgument)
            }, role: { roles.append($0); return boundary })
            unexpectedFailure()
        } catch MouseEventWindowSelectionError.noWindows {} catch { unexpectedFailure() }
        checkEqual(ids, [0]); checkEqual(roles.count, boundary == .window ? 1 : 2)
    }
    do {
        _ = try outOfProcessMouseWindowID(for: 0, parent: { _ in nil }, windowID: { _ in throw UIElementError.axError(.cannotComplete) },
            role: { _ in unexpectedFailure() })
        unexpectedFailure()
    } catch UIElementError.axError(let error) { checkEqual(error.rawValue, AXError.cannotComplete.rawValue) }
    catch { unexpectedFailure() }
    var visited = 0
    do {
        _ = try outOfProcessMouseWindowID(for: 0, parent: { $0 + 1 }, windowID: { _ in
            visited += 1; throw UIElementError.axError(.illegalArgument)
        }, role: { _ in .group })
        unexpectedFailure()
    } catch MouseEventWindowSelectionError.noWindows {} catch { unexpectedFailure() }
    checkEqual(visited, 301)
}

private func runMouseEventRoutingSeedChecks() throws {
    var trace: [String] = [], windowPID: Int32 = 99, hit: Int? = 7, childValues: [Int] = [8,9]
    var bundle: String? = "com.openai.atlas"
    func seed() throws -> MouseEventRoutingSeed<Int> {
        try mouseEventRoutingSeed(applicationPID: { trace.append("app"); return 88 },
            windowActualPID: { trace.append("window-pid"); return windowPID },
            windowID: { trace.append("window-id"); return 123 }, hitElement: hit,
            children: { checkEqual($0, 7); trace.append("children"); return childValues },
            bundleIdentifier: { trace.append("bundle"); return bundle })
    }
    guard case .foreignWindow(let pid, let id) = try seed() else { unexpectedFailure() }
    checkEqual(pid, 99); checkEqual(id, 123); checkEqual(trace, ["app","window-pid","window-id"])
    trace = []; windowPID = 88
    guard case .hitElement(let app, let effective) = try seed() else { unexpectedFailure() }
    checkEqual(app, 88); checkEqual(effective, 8); checkEqual(trace, ["app","window-pid","children"])
    childValues = []
    guard case .hitElement(_, let leaf) = try seed() else { unexpectedFailure() }
    checkEqual(leaf, 7)
    hit = nil; trace = []
    guard case .noHit(let owner, let useAX) = try seed() else { unexpectedFailure() }
    checkEqual(owner, 88); checkTrue(useAX); checkEqual(trace, ["app","window-pid","bundle"])
    for (identifier, expected) in [("com.openai.atlas.beta", true), ("com.openai.atlasAnything", true),
        ("org.example.com.openai.atlas", false), ("COM.OPENAI.ATLAS", false), ("com.openai.atla", false)] {
        bundle = identifier
        guard case .noHit(_, let useAX) = try seed() else { unexpectedFailure() }
        checkEqual(useAX, expected)
    }
    bundle = nil
    guard case .noHit(_, let missingBundle) = try seed() else { unexpectedFailure() }
    checkFalse(missingBundle)
    bundle = "com.google.Chrome"
    guard case .noHit(_, let ordinary) = try seed() else { unexpectedFailure() }
    checkFalse(ordinary)
    enum Failure: Error { case pid }
    do {
        let _: MouseEventRoutingSeed<Int> = try mouseEventRoutingSeed(applicationPID: { throw Failure.pid },
            windowActualPID: { unexpectedFailure() }, windowID: { unexpectedFailure() }, hitElement: nil,
            children: { _ in unexpectedFailure() }, bundleIdentifier: { unexpectedFailure() })
        unexpectedFailure()
    } catch Failure.pid {} catch { unexpectedFailure() }
}

private func runMouseWindowAtPointChecks() {
    let point = CGPoint(x: 120, y: 120)
    var reads: [Int] = [], lookups: [UInt32] = []
    let result: String? = mouseWindowAtPoint(point, belowWindowID: UInt32.max, screens: [0,1,2], frame: { screen in
        reads.append(screen)
        return screen == 0 ? CGRect(x: 0, y: 0, width: 20, height: 20) : CGRect(x: 100, y: 100, width: 200, height: 300)
    }, windowNumber: { seen, below in
        checkEqual(seen, CGPoint(x: 120, y: 180)); checkEqual(below, Int(UInt32.max)); return 0
    }, lookupWindow: { id in lookups.append(id); return "selected" })
    checkEqual(result, "selected"); checkEqual(reads, [0,1,1]); checkEqual(lookups, [0])
    let absent: Int? = mouseWindowAtPoint(point, belowWindowID: 0, screens: [Int](),
        frame: { _ in unexpectedFailure() }, windowNumber: { _, _ in unexpectedFailure() }, lookupWindow: { _ in unexpectedFailure() })
    checkTrue(absent == nil)
    let outside: Int? = mouseWindowAtPoint(point, belowWindowID: 0, screens: [0],
        frame: { _ in .zero }, windowNumber: { _, _ in unexpectedFailure() }, lookupWindow: { _ in unexpectedFailure() })
    checkTrue(outside == nil)
    var selectedReads = 0
    let missing: UInt32? = mouseWindowAtPoint(point, belowWindowID: 91, screens: [0,1], frame: { screen in
        checkEqual(screen, 0); selectedReads += 1
        return CGRect(x: 100, y: 100, width: 200, height: selectedReads == 1 ? 300 : 400)
    }, windowNumber: { seen, below in
        checkEqual(seen, CGPoint(x: 120, y: 280)); checkEqual(below, 91); return Int(UInt32.max)
    }, lookupWindow: { id in checkEqual(id, UInt32.max); return nil })
    checkTrue(missing == nil); checkEqual(selectedReads, 2) // no retry on another screen after failed description
}

private func runNativeWindowDescriptionChecks() {
    let minimal = NativeWindowDescription([kCGWindowNumber as String: UInt32(91)])
    checkEqual(minimal.id, 91); checkEqual(minimal.ownerPID, -1); checkEqual(minimal.level, 0)
    checkEqual(minimal.bounds, .zero); checkTrue(minimal.name == nil); checkTrue(minimal.ownerName == nil)
    checkTrue(minimal.isOnscreen == nil)
    let frame = CGRect(x: 10, y: -20, width: 300, height: 400)
    let complete = NativeWindowDescription([kCGWindowNumber as String: NSNumber(value: UInt32(123)),
        kCGWindowOwnerPID as String: NSNumber(value: Int32(88)), kCGWindowLayer as String: NSNumber(value: Int32(3)),
        kCGWindowBounds as String: frame.dictionaryRepresentation, kCGWindowName as String: "window",
        kCGWindowOwnerName as String: "owner", kCGWindowIsOnscreen as String: NSNumber(value: false)])
    checkEqual(complete.id, 123); checkEqual(complete.ownerPID, 88); checkEqual(complete.level, 3)
    checkEqual(complete.bounds, frame); checkEqual(complete.name, "window"); checkEqual(complete.ownerName, "owner")
    checkEqual(complete.isOnscreen, false)
    let malformed = NativeWindowDescription([kCGWindowNumber as String: UInt32.max,
        kCGWindowOwnerPID as String: "bad", kCGWindowLayer as String: "bad",
        kCGWindowBounds as String: ["bad": "data"], kCGWindowName as String: 1,
        kCGWindowOwnerName as String: 1, kCGWindowIsOnscreen as String: "bad"])
    checkEqual(malformed.ownerPID, -1); checkEqual(malformed.level, 0); checkEqual(malformed.bounds, .zero)
    checkTrue(malformed.isOnscreen == nil); checkTrue(malformed.name == nil); checkTrue(malformed.ownerName == nil)
    checkTrue(nativeWindowDescription(0, descriptions: { _ in unexpectedFailure() }) == nil)
    var fetches = 0
    let first = nativeWindowDescription(123, descriptions: { ids in
        fetches += 1; checkEqual(CFArrayGetCount(ids), 1)
        checkEqual(UInt(bitPattern: CFArrayGetValueAtIndex(ids, 0)), 123)
        return [["which": "first"], ["which": "second"]]
    })
    checkEqual(first?["which"] as? String, "first"); checkEqual(fetches, 1)
    checkTrue(nativeWindowDescription(1, descriptions: { _ in [] }) == nil)
    checkTrue(nativeWindowDescription(1, descriptions: { _ in nil }) == nil)
}

private func runMouseEventTargetChecks() throws {
    enum Failure: Error { case id, hit, ancestor, foreign }
    struct Native { let id: UInt32; let bounds: CGRect }
    let axBounds = CGRect(x: 10, y: 20, width: 300, height: 200)
    let nativeBounds = CGRect(x: 100, y: 200, width: 400, height: 500)
    var calls: [String] = []
    var axPID: Int32 = 11, hit: Int? = 1, bundle: String? = nil
    var foreign: [Int: (pid: Int32, windowID: UInt32)] = [:]
    var nativeAtPoint: Native? = nil, systemHit: Int? = nil, nativeExists = true
    var elementIDThrows = false, windowIDThrows = false, systemHitThrows = false
    var systemHitIllegalArgument = false
    var elementPID: Int32? = 11, ancestorThrows = false, foreignThrows = false
    var frame: CGRect? = axBounds
    func resolve() throws -> MouseEventTarget<Int, String> {
        try resolveMouseEventTarget(at: CGPoint(x: 30, y: 40), accessibilityWindow: "original", hitElement: hit,
            applicationPID: { calls.append("appPID"); return 11 },
            windowActualPID: { calls.append("windowPID:\($0)"); return axPID },
            windowID: { calls.append("axID:\($0)"); if windowIDThrows { throw Failure.id }; return 70 },
            windowFrame: { calls.append("frame:\($0)"); return frame },
            children: { calls.append("children:\($0)"); return [2, 3] },
            bundleIdentifier: { calls.append("bundle"); return bundle },
            outOfProcessTargetWindow: { element, pid in
                calls.append("foreign:\(element):\(pid)")
                if foreignThrows { throw Failure.foreign }; return foreign[element]
            }, elementWindowID: { calls.append("elementID:\($0)"); if elementIDThrows { throw Failure.id }; return 80 },
            elementActualPID: { calls.append("elementPID:\($0)"); return elementPID },
            ancestorWindowID: { element, pid in
                calls.append("ancestor:\(element):\(pid)"); if ancestorThrows { throw Failure.ancestor }; return 90
            }, nativeWindowAtPoint: { _ in calls.append("nativeAtPoint"); return nativeAtPoint },
            nativeWindowID: { calls.append("nativeID"); return $0.id },
            nativeWindowForID: { id in calls.append("nativeForID:\(id)"); return nativeExists ? Native(id: id, bounds: nativeBounds) : nil },
            nativeWindowBounds: { calls.append("nativeBounds"); return $0.bounds },
            systemWideHitTest: { _ in calls.append("systemHit"); if systemHitThrows { throw Failure.hit }; if systemHitIllegalArgument { throw UIElementError.axError(.illegalArgument) }; return systemHit })
    }
    // Ordinary hit: child is used only for process discovery; final target
    // retains the original hit and AX bounds, without consulting WindowServer.
    let direct = try resolve()
    checkTrue(direct.pid == 11 && direct.element == 1 && direct.accessibilityWindow == "original" &&
        direct.windowID == 80 && direct.windowBounds == axBounds && !direct.windowUsesFlippedCoordinates)
    checkTrue(calls == ["appPID", "windowPID:original", "children:1", "foreign:2:11", "elementID:1", "elementPID:1", "frame:original"])
    let directWindow = direct.mouseWindow
    checkTrue(directWindow.id == 80 && directWindow.frame == axBounds && !directWindow.usesFlippedCoordinates)
    let events = try mouseClickEvents(point: CGPoint(x: 30, y: 40), button: "left", count: 1,
        flags: [], window: directWindow)
    checkTrue(events.count == 2 && events.allSatisfy {
        $0.getIntegerValueField(.mouseEventWindowUnderMousePointer) == 80 &&
        $0.getIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent) == 80
    })
    calls = []; elementPID = nil
    checkTrue(try resolve().windowID == 90)
    checkTrue(calls.contains("ancestor:1:11"))
    ancestorThrows = true
    do { _ = try resolve(); unexpectedFailure() } catch Failure.ancestor {}
    ancestorThrows = false; elementPID = 11; calls = []; elementIDThrows = true
    checkTrue(try resolve().windowID == 70)
    checkTrue(!calls.contains("elementPID:1") && calls.contains("axID:original"))
    elementIDThrows = false

    // Foreign-window fallback clears the AX hit, keeps original AX window,
    // and uses supplied destination PID/ID plus WindowServer bounds.
    calls = []; axPID = 22
    let fallback = try resolve()
    checkTrue(fallback.pid == 22 && fallback.element == nil && fallback.windowID == 70 &&
        fallback.accessibilityWindow == "original" && fallback.windowBounds == nativeBounds)
    checkTrue(calls == ["appPID", "windowPID:original", "axID:original", "nativeAtPoint", "axID:original", "nativeForID:70", "nativeBounds"])
    calls = []; nativeExists = false
    do { _ = try resolve(); unexpectedFailure() }
    catch MouseEventTargetError.unableToFindWindowID(let id) { checkTrue(id == 70) }
    nativeExists = true

    // Match triggers system-wide hit-test; mismatch does not. A hit is
    // rerouted afresh, without applying the initial first-child transformation.
    calls = []; nativeAtPoint = Native(id: 70, bounds: .zero); systemHit = 9
    let replacement = try resolve()
    checkTrue(replacement.element == 9 && replacement.pid == 11 && replacement.windowID == 80)
    checkTrue(calls.contains("foreign:9:11") && !calls.contains("children:9"))
    calls = []; foreign[9] = (33, 99)
    let replacementForeign = try resolve()
    checkTrue(replacementForeign.pid == 33 && replacementForeign.windowID == 99 &&
        replacementForeign.element == 9 && replacementForeign.windowBounds == nativeBounds)
    checkTrue(calls.contains("nativeForID:99") && !calls.contains("elementID:9"))
    calls = []; nativeAtPoint = Native(id: 71, bounds: .zero)
    checkTrue(try resolve().element == nil)
    checkTrue(!calls.contains("systemHit"))
    calls = []; nativeAtPoint = Native(id: 70, bounds: .zero); systemHitThrows = true
    do { _ = try resolve(); unexpectedFailure() } catch Failure.hit {}
    checkTrue(!calls.contains("nativeForID:70"))
    systemHitThrows = false; systemHitIllegalArgument = true
    do { _ = try resolve(); unexpectedFailure() }
    catch UIElementError.axError(let error) { checkTrue(error == .illegalArgument) }
    systemHitIllegalArgument = false; systemHit = nil

    // No hit outside Atlas has no invented screenshot/focused-window fallback.
    axPID = 11; hit = nil; nativeAtPoint = nil; calls = []
    do { _ = try resolve(); unexpectedFailure() } catch MouseEventWindowSelectionError.noWindows {}
    checkTrue(calls == ["appPID", "windowPID:original", "bundle", "nativeAtPoint", "axID:original"])
    windowIDThrows = true
    do { _ = try resolve(); unexpectedFailure() } catch Failure.id {}
    windowIDThrows = false; bundle = "com.openai.atlas"; frame = nil; calls = []
    let atlas = try resolve()
    checkTrue(atlas.windowID == 70 && atlas.element == nil && atlas.windowBounds == .zero)
    checkTrue(!calls.contains("nativeAtPoint"))
    bundle = "com.openai.atlas.beta"; calls = []
    checkTrue(try resolve().windowID == 70)
    checkTrue(!calls.contains("nativeAtPoint"))
    hit = 1; bundle = nil; foreign[2] = (44, 111); calls = []
    checkTrue(try resolve().pid == 44)
    checkTrue(calls.contains("nativeForID:111") && !calls.contains("elementID:1"))
    foreignThrows = true
    do { _ = try resolve(); unexpectedFailure() } catch Failure.foreign {}

    // Ancestor resolver skips missing/different PIDs, accepts ID zero, and
    // propagates the first matching ancestor's ID error without continuing.
    var visited: [Int] = [], ids: [Int] = []
    let ancestorID = try mouseEventWindowID(for: 0, appPID: 11,
        parent: { $0 < 4 ? $0 + 1 : nil }, actualPID: { visited.append($0); return $0 == 2 ? 11 : nil },
        windowID: { ids.append($0); return 0 })
    checkTrue(ancestorID == 0 && visited == [0, 1, 2] && ids == [2])
    do {
        _ = try mouseEventWindowID(for: 0, appPID: 11, parent: { $0 + 1 },
            actualPID: { _ in 11 }, windowID: { _ in throw Failure.id })
        unexpectedFailure()
    } catch Failure.id {}
    visited = []
    do {
        _ = try mouseEventWindowID(for: 0, appPID: 11, parent: { $0 + 1 },
            actualPID: { visited.append($0); return nil }, windowID: { _ in unexpectedFailure() })
        unexpectedFailure()
    } catch MouseEventWindowSelectionError.noWindows {}
    checkTrue(visited.count == 301 && visited.first == 0 && visited.last == 300)
}

private func runOrderedMouseWindowChecks() {
    var order: [String] = [], windows: [UInt32: String] = [10: "back", 20: "front", 30: "offscreen"]
    let ordered = orderedMouseWindows(windows: { order.append("windows"); return windows },
        orderedWindowIDs: {
            order.append("native")
            // Concurrent cache changes cannot change the captured map.
            windows[20] = "replaced"
            windows[40] = "added"
            return [20, 99, 10, 20, 40]
        })
    checkTrue(order == ["windows", "native"] && ordered == ["front", "back", "front"])
    let empty: [String] = orderedMouseWindows(windows: { windows }, orderedWindowIDs: { [] })
    checkTrue(empty.isEmpty)
    let unknown: [String] = orderedMouseWindows(windows: { [:] }, orderedWindowIDs: { [10] })
    checkTrue(unknown.isEmpty)
    var queries = 0
    checkTrue(onScreenMouseWindowIDs(createList: { options, relative in
        queries += 1
        checkTrue(options.rawValue == 0x11 && relative == 0)
        return nil
    }).isEmpty)
    var entries: [UnsafeRawPointer?] = [nil, UnsafeRawPointer(bitPattern: 12), UnsafeRawPointer(bitPattern: UInt(UInt32.max))]
    let list = entries.withUnsafeMutableBufferPointer { CFArrayCreate(nil, $0.baseAddress, $0.count, nil)! }
    checkTrue(onScreenMouseWindowIDs(createList: { options, relative in
        queries += 1; checkTrue(options.rawValue == 0x11 && relative == 0); return list
    }) == [0, 12, UInt32.max])
    checkTrue(queries == 2)
}

private func runMouseWindowRegistryChecks() {
    enum Failure: Error { case id }
    var windows: [UInt32: String] = [10: "valid", 20: "zero", 30: "error"]
    var reads: [String] = [], notifications: [[UInt32]] = []
    pruneMouseWindows(&windows, accessibilityWindowID: { value in
        reads.append(value)
        if value == "error" { throw Failure.id }
        return value == "zero" ? 0 : 99
    }, observedWindowIDsChanged: { notifications.append($0) })
    checkTrue(Set(reads) == ["valid", "zero", "error"] && reads.count == 3)
    checkTrue(windows == [10: "valid"] && notifications == [[10]])
    pruneMouseWindows(&windows, accessibilityWindowID: { _ in 99 },
        observedWindowIDsChanged: { _ in unexpectedFailure() })
    checkTrue(windows == [10: "valid"])
    registerMouseWindow("ignored", windows: &windows, windowID: { _ in throw Failure.id },
        observedWindowIDsChanged: { _ in unexpectedFailure() })
    checkTrue(windows == [10: "valid"])
    registerMouseWindow("new", windows: &windows, windowID: { _ in 10 },
        observedWindowIDsChanged: { notifications.append($0) })
    checkTrue(windows == [10: "new"] && notifications.count == 2)
    registerMouseWindow("zero", windows: &windows, windowID: { _ in 0 },
        observedWindowIDsChanged: { notifications.append($0) })
    checkTrue(windows[0] == "zero" && Set(notifications.last!) == [0, 10])
    pruneMouseWindows(&windows, accessibilityWindowID: { _ in 0 },
        observedWindowIDsChanged: { notifications.append($0) })
    checkTrue(windows.isEmpty && notifications.last! == [])
    pruneMouseWindows(&windows, accessibilityWindowID: { _ in unexpectedFailure() },
        observedWindowIDsChanged: { _ in unexpectedFailure() })
}

private func runAXEnablementAssertionTrackerChecks() {
    var first: [String] = [], missing: [String] = []
    let tracker = AXEnablementAssertionTracker<String>(
        reportFirstAcquisition: { first.append("\($0):\($1)") }, reportMissingRelease: { missing.append($0) })
    let electron = AXEnablementKind.enableElectronAccessibility
    let enhanced = AXEnablementKind.enableEnhancedUserInterface
    // Two independent owners of the same app/kind must not disable each other.
    checkTrue(tracker.acquire(for: "app-a", kind: electron))
    checkFalse(tracker.acquire(for: "app-a", kind: electron))
    checkFalse(tracker.release(for: "app-a", kind: electron))
    checkTrue(tracker.release(for: "app-a", kind: electron))
    checkTrue(first.count == 1 && missing.isEmpty)
    // Missing/duplicate cleanup reports a mismatch without creating debt that
    // would prevent the next owner from receiving its first-enable decision.
    checkFalse(tracker.release(for: "app-a", kind: electron))
    checkTrue(missing == ["app-a"])
    checkTrue(tracker.acquire(for: "app-a", kind: electron))
    // Other app and other kind are separate even while app-a/electron is held.
    checkTrue(tracker.acquire(for: "app-a", kind: enhanced))
    checkTrue(tracker.acquire(for: "app-b", kind: electron))
    checkTrue(tracker.release(for: "app-a", kind: electron))
    checkTrue(tracker.release(for: "app-a", kind: enhanced))
    checkTrue(tracker.release(for: "app-b", kind: electron))
    // Failure rollback for one kind cannot release another successful kind.
    checkTrue(tracker.acquire(for: "app-a", kind: electron))
    checkTrue(tracker.acquire(for: "app-a", kind: enhanced))
    checkTrue(tracker.release(for: "app-a", kind: enhanced))
    checkFalse(tracker.acquire(for: "app-a", kind: electron))
    checkFalse(tracker.release(for: "app-a", kind: electron))
    checkTrue(tracker.release(for: "app-a", kind: electron))
    for kind in AXEnablementKind.allCases {
        checkTrue(tracker.acquire(for: "app-a", kind: kind))
        checkFalse(tracker.acquire(for: "app-a", kind: kind))
    }
    for kind in AXEnablementKind.allCases {
        checkFalse(tracker.release(for: "app-a", kind: kind))
        checkTrue(tracker.release(for: "app-a", kind: kind))
    }

    final class Application: Hashable {
        static func == (lhs: Application, rhs: Application) -> Bool { lhs === rhs }
        func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
    }
    let lifetime = AXEnablementAssertionTracker<Application>(
        reportFirstAcquisition: { _, _ in }, reportMissingRelease: { _ in unexpectedFailure() })
    var app: Application? = Application()
    weak var weakApp = app
    checkTrue(lifetime.acquire(for: app!, kind: electron))
    checkTrue(lifetime.acquire(for: app!, kind: enhanced))
    app = nil
    checkTrue(weakApp != nil)
    func release(_ kind: AXEnablementKind) { checkTrue(lifetime.release(for: weakApp!, kind: kind)) }
    release(electron)
    checkTrue(weakApp != nil)
    release(enhanced)
    checkTrue(weakApp == nil)
}

private func runElectronAccessibilityEnablementChecks() {
    enum Failure: Error { case write }
    for originalChanged in [false, true] {
        for value: Bool? in [nil, false, true] {
            for writeFails in [false, true] {
                var changed = originalChanged, reads = 0, writes: [Bool] = []
                let attempted = performElectronAccessibilityEnablement(changed: &changed,
                    manualAccessibility: { reads += 1; return value },
                    setManualAccessibility: { value in
                        writes.append(value)
                        if writeFails { throw Failure.write }
                    })
                checkTrue(reads == 1)
                if value == false {
                    checkTrue(attempted && changed && writes == [true])
                } else {
                    checkFalse(attempted)
                    checkTrue(changed == originalChanged && writes.isEmpty)
                }
            }
        }
    }
}

private func runAXEnablementAssertionReleaseChecks() {
    enum Failure: Error { case write }
    let tracker = AXEnablementAssertionTracker<String>(reportFirstAcquisition: { _, _ in }, reportMissingRelease: { _ in })
    let electron = AXEnablementKind.enableElectronAccessibility
    let enhanced = AXEnablementKind.enableEnhancedUserInterface
    let voice = AXEnablementKind.enableVoiceOverOnPreference
    for kind in [electron, enhanced, voice, electron] { _ = tracker.acquire(for: "owned", kind: kind) }
    var events: [String] = []
    func release(_ kinds: [AXEnablementKind]) {
        releaseAXEnablementKinds(kinds, application: "owned", tracker: tracker,
            reportRelease: { events.append("release:\($0)") }, setManualAccessibility: {
                checkFalse($0); events.append("manual"); throw Failure.write
            }, setEnhancedUserInterface: {
                checkFalse($0); events.append("enhanced"); throw Failure.write
            }, releaseVoiceOverPreference: { events.append("voice") })
    }
    // First electron owner remains, so this traversal must not disable it.
    // Setter failures do not stop later releases, including a duplicate kind.
    release([electron, enhanced, voice, electron])
    checkTrue(events == ["release:enableEnhancedUserInterface", "enhanced",
        "release:enableVoiceOverOnPreference", "voice", "release:enableElectronAccessibility", "manual"])
    events = []; release([electron, enhanced, voice])
    checkTrue(events.isEmpty)

    var cleanups = 0
    weak var weakAssertion: AXEnablementAssertion?
    var assertion: AXEnablementAssertion? = AXEnablementAssertion(kinds: [voice, electron, voice]) { kinds in
        checkTrue(kinds == [voice, electron, voice])
        cleanups += 1
        weakAssertion?.disable()
    }
    weakAssertion = assertion
    assertion!.disable(); assertion!.disable()
    checkTrue(cleanups == 1)
    assertion = nil
    checkTrue(cleanups == 1 && weakAssertion == nil)

    final class Resource {}
    weak var resource: Resource?
    func makeAssertion() -> AXEnablementAssertion {
        let retained = Resource(); resource = retained
        return AXEnablementAssertion(kinds: []) { kinds in
            checkTrue(kinds.isEmpty && resource === retained)
            cleanups += 1
        }
    }
    assertion = makeAssertion()
    checkTrue(resource != nil)
    assertion = nil
    checkTrue(cleanups == 2 && resource == nil)
    assertion = makeAssertion()
    assertion!.disable()
    checkTrue(cleanups == 3 && resource != nil)
    assertion = nil
    checkTrue(cleanups == 3 && resource == nil)
}

private func runVoiceOverPreferenceReleaseChecks() {
    for voiceRunning in [false, true] {
        for suiteExists in [false, true] {
            var events: [String] = []
            releaseVoiceOverOnPreference(isVoiceOverRunning: { events.append("running"); return voiceRunning },
                makeDefaults: { name -> Int? in
                    checkTrue(name == "com.apple.universalaccess"); events.append("suite"); return suiteExists ? 17 : nil
                }, setBoolean: { defaults, value, key in
                    checkTrue(defaults == 17 && !value && key == "voiceOverOnOffKey"); events.append("write")
                }, postNotification: { name in
                    checkTrue(name == "com.apple.universalaccess.VoiceOverSettingsDidChange"); events.append("notify")
                })
            checkTrue(events == (voiceRunning ? ["running"] : suiteExists ? ["running", "suite", "write", "notify"] : ["running", "suite"]))
        }
    }
}

private func runAXEnablementPolicyChecks() {
    typealias Kind = AXEnablementKind
    let primaryCases: [(String, Kind?, Kind?, Kind?)] = [
        ("org.example.App", .enableElectronAccessibility, .enableEnhancedUserInterface, nil),
        ("com.apple.iWork.Pages", .enableElectronAccessibility, .enableEnhancedUserInterface, .enableEnhancedUserInterface),
        ("com.apple.iWorkAnything", .enableElectronAccessibility, .enableEnhancedUserInterface, .enableEnhancedUserInterface),
        ("com.spotify.client", .enableElectronAccessibility, .enableEnhancedUserInterface, .enableEnhancedUserInterface),
        ("com.spotify.client.beta", .enableElectronAccessibility, .enableEnhancedUserInterface, nil),
        ("org.example.com.apple.iWork", .enableElectronAccessibility, .enableEnhancedUserInterface, nil),
    ]
    for (bundle, fullSupported, fullUnsupported, other) in primaryCases {
        for context in UIElementContextType.allCases {
            for supported in [false, true] {
                var reads = 0
                let result = primaryAXEnablementKind(context: context, bundleIdentifier: bundle,
                    supportsManualAccessibility: { reads += 1; return supported })
                checkEqual(result, context == .fullUIContext ? (supported ? fullSupported : fullUnsupported) : other)
                checkEqual(reads, 1)
            }
        }
    }
    let voiceCases: [(String, [Bool])] = [
        ("com.microsoft.Excel", [true, true, true]), ("com.microsoft.Excel.beta", [false, false, false]),
        ("com.apple.Music", [true, true, true]), ("com.apple.Music.beta", [false, false, false]),
        ("company.thebrowser.Browser", [true, false, false]), ("company.thebrowser.dia", [true, false, false]),
        ("company.thebrowser.Browser.beta", [false, false, false]),
        ("com.openai.atlas", [true, true, true]), ("com.openai.atlas.beta", [true, true, true]),
        ("com.openai.atlasAnything", [true, true, true]), ("org.example.com.openai.atlas", [false, false, false]),
        ("COM.OPENAI.ATLAS", [false, false, false]), ("ai.multica.desktop", [false, false, false]),
    ]
    for (bundle, expected) in voiceCases {
        for (context, value) in zip(UIElementContextType.allCases, expected) {
            checkEqual(shouldEnableVoiceOverOnPreference(context: context, bundleIdentifier: bundle), value)
        }
    }
}

private func runAXEnablementAcquisitionChecks() {
    let manual = AXEnablementKind.enableElectronAccessibility
    let voice = AXEnablementKind.enableVoiceOverOnPreference
    do {
        var events: [String] = []
        let tracker = AXEnablementAssertionTracker<String>(reportFirstAcquisition: { _, kind in events.append("acquire:\(kind)") },
            reportMissingRelease: { _ in events.append("missing") })
        var owner = acquireAXEnablementAssertion(application: "Atlas", tracker: tracker, context: .fullUIContext,
            bundleIdentifier: "com.openai.atlas.beta", supportsManualAccessibility: { events.append("support"); return true },
            enableElectron: { changed in changed = true; events.append("manual"); return true },
            enableEnhancedUI: { _ in unexpectedFailure() }, enableVoiceOverPreference: { events.append("voice-failed"); return false },
            windowInitializationEligibility: { unexpectedFailure() }, initializeApplication: { events.append("initialize"); return true },
            reportInitialized: { app in checkFalse(tracker.hasInitialized(app)); events.append("mark") },
            makeAssertion: { kinds in
                checkTrue(kinds == [manual, voice] && tracker.hasInitialized("Atlas")); events.append("assertion")
                return AXEnablementAssertion(kinds: kinds) { kinds in
                    releaseAXEnablementKinds(kinds, application: "Atlas", tracker: tracker,
                        reportRelease: { events.append("release:\($0)") }, setManualAccessibility: { value in
                            checkFalse(value); events.append("disable-manual")
                        }, setEnhancedUserInterface: { _ in unexpectedFailure() }, releaseVoiceOverPreference: { unexpectedFailure() })
                }
            })
        checkTrue(owner != nil)
        checkTrue(events == ["support", "acquire:enableElectronAccessibility", "manual", "acquire:enableVoiceOverOnPreference",
            "voice-failed", "initialize", "mark", "assertion"])
        owner!.disable(); owner = nil
        checkTrue(Array(events.suffix(3)) == ["release:enableElectronAccessibility", "disable-manual", "missing"])
    }
    do {
        let tracker = AXEnablementAssertionTracker<String>(reportFirstAcquisition: { _, _ in }, reportMissingRelease: { _ in unexpectedFailure() })
        var enabled = 0, initialized = 0, marked = 0, disabled = 0, eligibleReads = 0
        func acquire() -> AXEnablementAssertion? {
            acquireAXEnablementAssertion(application: "Multica", tracker: tracker, context: .fullUIContext,
                bundleIdentifier: "ai.multica.desktop", supportsManualAccessibility: { true },
                enableElectron: { changed in enabled += 1; changed = true; return true },
                enableEnhancedUI: { _ in unexpectedFailure() }, enableVoiceOverPreference: { unexpectedFailure() },
                windowInitializationEligibility: { eligibleReads += 1; return true },
                initializeApplication: { initialized += 1; return true }, reportInitialized: { _ in marked += 1 },
                makeAssertion: { kinds in
                    AXEnablementAssertion(kinds: kinds) { kinds in
                        releaseAXEnablementKinds(kinds, application: "Multica", tracker: tracker,
                            reportRelease: { checkEqual($0, manual) }, setManualAccessibility: { value in checkFalse(value); disabled += 1 },
                            setEnhancedUserInterface: { _ in unexpectedFailure() }, releaseVoiceOverPreference: { unexpectedFailure() })
                    }
                })
        }
        let first = acquire()!, second = acquire()!
        checkTrue(enabled == 1 && initialized == 2 && marked == 2 && eligibleReads == 1)
        first.disable(); checkEqual(disabled, 0)
        second.disable(); checkEqual(disabled, 1)
    }
    do {
        let tracker = AXEnablementAssertionTracker<String>(reportFirstAcquisition: { _, _ in }, reportMissingRelease: { _ in })
        tracker.markInitialized("Pages", report: { _ in })
        let owner = acquireAXEnablementAssertion(application: "Pages", tracker: tracker, context: .eventStreamContext,
            bundleIdentifier: "com.apple.iWork.Pages", supportsManualAccessibility: { false },
            enableElectron: { _ in unexpectedFailure() }, enableEnhancedUI: { changed in changed = true; return true },
            enableVoiceOverPreference: { unexpectedFailure() }, windowInitializationEligibility: { unexpectedFailure() },
            initializeApplication: { unexpectedFailure() }, reportInitialized: { _ in unexpectedFailure() },
            makeAssertion: { AXEnablementAssertion(kinds: $0, release: { _ in }) })
        checkTrue(owner != nil)
    }
    do {
        let tracker = AXEnablementAssertionTracker<String>(reportFirstAcquisition: { _, _ in unexpectedFailure() }, reportMissingRelease: { _ in })
        var initializationSucceeds = false, initialized = 0, eligibility = 0, marked = 0
        func acquire() -> AXEnablementAssertion? {
            acquireAXEnablementAssertion(application: "Other", tracker: tracker, context: .eventStreamContext,
                bundleIdentifier: "org.example.App", supportsManualAccessibility: { false },
                enableElectron: { _ in unexpectedFailure() }, enableEnhancedUI: { _ in unexpectedFailure() },
                enableVoiceOverPreference: { unexpectedFailure() }, windowInitializationEligibility: { eligibility += 1; return true },
                initializeApplication: { initialized += 1; return initializationSucceeds }, reportInitialized: { _ in marked += 1 },
                makeAssertion: { _ in unexpectedFailure() })
        }
        checkTrue(acquire() == nil && !tracker.hasInitialized("Other"))
        initializationSucceeds = true
        checkTrue(acquire() == nil && tracker.hasInitialized("Other"))
        checkTrue(acquire() == nil && initialized == 2 && marked == 1 && eligibility == 3)
    }
    do {
        let tracker = AXEnablementAssertionTracker<String>(reportFirstAcquisition: { _, _ in }, reportMissingRelease: { _ in })
        var eligibility = 0
        let owner = acquireAXEnablementAssertion(application: "AlreadyEnabled", tracker: tracker, context: .fullUIContext,
            bundleIdentifier: "org.example.App", supportsManualAccessibility: { true },
            enableElectron: { _ in false }, enableEnhancedUI: { _ in unexpectedFailure() },
            enableVoiceOverPreference: { unexpectedFailure() }, windowInitializationEligibility: { eligibility += 1; return false },
            initializeApplication: { unexpectedFailure() }, reportInitialized: { _ in unexpectedFailure() },
            makeAssertion: { kinds in checkTrue(kinds == [manual]); return AXEnablementAssertion(kinds: kinds, release: { _ in }) })
        checkTrue(owner != nil && eligibility == 1)
        checkTrue(tracker.acquire(for: "AlreadyEnabled", kind: manual)) // Failed enable rolled back to zero.
        checkTrue(tracker.release(for: "AlreadyEnabled", kind: manual))
    }
}

private func runAXInitializedApplicationChecks() {
    final class Application: Hashable {
        static func == (lhs: Application, rhs: Application) -> Bool { lhs === rhs }
        func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
    }
    var tracker: AXEnablementAssertionTracker<Application>? = AXEnablementAssertionTracker(
        reportFirstAcquisition: { _, _ in }, reportMissingRelease: { _ in unexpectedFailure() })
    var app: Application? = Application()
    weak var weakApp = app
    checkFalse(tracker!.hasInitialized(app!))
    tracker!.markInitialized(app!, report: { checkFalse(tracker!.hasInitialized($0)) })
    tracker!.markInitialized(app!, report: { checkTrue(tracker!.hasInitialized($0)) })
    checkTrue(tracker!.acquire(for: app!, kind: .enableElectronAccessibility))
    checkTrue(tracker!.release(for: app!, kind: .enableElectronAccessibility))
    app = nil
    checkTrue(weakApp != nil) // Initialization history outlives active-count entries.
    tracker = nil
    checkTrue(weakApp == nil)
}

private func runEnhancedUserInterfaceEnablementChecks() {
    final class Resource {
        let released: () -> Void
        init(released: @escaping () -> Void = {}) { self.released = released }
        deinit { released() }
    }
    enum Failure: Error { case operation }
    // Nil/already-true reads skip all other work; ordinary apps do not probe
    // activation or mark changed, even when the write is attempted/fails.
    for originalChanged in [false, true] {
        for value: Bool? in [nil, false, true] {
            for writeFails in [false, true] {
                var changed = originalChanged, reads = 0, writes: [Bool] = []
                let result = performEnhancedUserInterfaceEnablement(changed: &changed,
                    enhancedUserInterface: { reads += 1; return value }, bundleIdentifier: "org.example.App",
                    applicationIsActive: { unexpectedFailure() }, makeEnforcer: { () -> Resource in unexpectedFailure() },
                    enforce: { _ in unexpectedFailure() }, deactivate: { _ in unexpectedFailure() },
                    makeStartDate: { unexpectedFailure() }, currentDate: { unexpectedFailure() }, sleep: { _ in unexpectedFailure() },
                    setEnhancedUserInterface: { value in writes.append(value); if writeFails { throw Failure.operation } })
                checkTrue(reads == 1 && changed == originalChanged)
                checkEqual(result, value == false)
                checkTrue(writes == (value == false ? [true] : []))
            }
        }
    }
    do {
        var changed = false, calls: [String] = []
        let result = performEnhancedUserInterfaceEnablement(changed: &changed,
            enhancedUserInterface: { false }, bundleIdentifier: "com.spotify.client",
            applicationIsActive: { calls.append("active"); return true }, makeEnforcer: { () -> Resource in unexpectedFailure() },
            enforce: { _ in unexpectedFailure() }, deactivate: { _ in unexpectedFailure() },
            makeStartDate: { unexpectedFailure() }, currentDate: { unexpectedFailure() }, sleep: { _ in unexpectedFailure() },
            setEnhancedUserInterface: { value in checkTrue(value); calls.append("write") })
        checkTrue(result && changed && calls == ["active", "write"])
    }
    // Inactive Spotify: create/enforce once, bounded polling, true write,
    // deactivate and release even when enforcement/write/deactivation fail.
    do {
        var changed = false, events: [String] = [], activeReads = 0
        weak var retained: Resource?
        var dates = [0.0, 1.0, 1.01]
        let result = performEnhancedUserInterfaceEnablement(changed: &changed,
            enhancedUserInterface: { events.append("read"); return false }, bundleIdentifier: "com.spotify.client",
            applicationIsActive: { activeReads += 1; events.append("active"); return false },
            makeEnforcer: {
                events.append("create")
                let resource = Resource { events.append("released") }; retained = resource; return resource
            }, enforce: { _ in events.append("enforce"); throw Failure.operation },
            deactivate: { resource in checkTrue(retained === resource); events.append("deactivate"); throw Failure.operation },
            makeStartDate: { events.append("start"); return Date(timeIntervalSinceReferenceDate: 0) },
            currentDate: { let value = dates.removeFirst(); events.append("time:\(value)"); return Date(timeIntervalSinceReferenceDate: value) },
            sleep: { interval in checkEqual(interval, 0.05); checkTrue(retained != nil); events.append("sleep") },
            setEnhancedUserInterface: { value in checkTrue(value && retained != nil); events.append("write"); throw Failure.operation })
        checkTrue(result && changed && activeReads == 3 && retained == nil && dates.isEmpty)
        checkTrue(events == ["read", "active", "create", "enforce", "start", "time:0.0", "active", "sleep",
            "time:1.0", "active", "sleep", "time:1.01", "write", "deactivate", "released"])
    }
    // A stale start time must bypass further active reads. A first-loop active
    // state must bypass sleeping. Exact Spotify matching excludes beta IDs.
    for elapsed in [1.01, 0.0] {
        var changed = false, activeReads = 0, sleeps = 0, writes = 0, deactivated = 0
        let result = performEnhancedUserInterfaceEnablement(changed: &changed,
            enhancedUserInterface: { false }, bundleIdentifier: "com.spotify.client",
            applicationIsActive: { activeReads += 1; return activeReads > 1 }, makeEnforcer: { Resource() },
            enforce: { _ in }, deactivate: { _ in deactivated += 1 }, makeStartDate: { Date(timeIntervalSinceReferenceDate: 0) },
            currentDate: { Date(timeIntervalSinceReferenceDate: elapsed) }, sleep: { _ in sleeps += 1 },
            setEnhancedUserInterface: { _ in writes += 1 })
        checkTrue(result && changed && writes == 1 && deactivated == 1 && sleeps == 0)
        checkEqual(activeReads, elapsed > 1 ? 1 : 2)
    }
    var changed = false
    checkTrue(performEnhancedUserInterfaceEnablement(changed: &changed, enhancedUserInterface: { false },
        bundleIdentifier: "com.spotify.client.beta", applicationIsActive: { unexpectedFailure() },
        makeEnforcer: { () -> Resource in unexpectedFailure() }, enforce: { _ in unexpectedFailure() },
        deactivate: { _ in unexpectedFailure() }, setEnhancedUserInterface: { checkTrue($0) }))
    checkFalse(changed)
}

private enum VoiceOverPreferenceTaskCheckContext {
    @TaskLocal static var value = 0
}

private func runVoiceOverPreferenceEnablementChecks() async throws {
    final class Defaults {}
    let defaults = Defaults()
    let bundles: [(String, Bool)] = [("com.microsoft.Excel", false), ("com.apple.Music", false),
        ("company.thebrowser.Browser", true), ("company.thebrowser.dia", true),
        ("company.thebrowser.Browser.beta", false), ("com.openai.atlas.beta", true),
        ("org.example.com.openai.atlas", false)]
    for (bundle, shouldReset) in bundles {
        for suiteExists in [false, true] {
            for alreadyEnabled in [false, true] {
                var events: [String] = []
                let acquired = enableVoiceOverOnPreference(bundleIdentifier: bundle,
                    makeDefaults: { suite -> Defaults? in
                        checkTrue(suite == "com.apple.universalaccess"); events.append("suite"); return suiteExists ? defaults : nil
                    }, readBoolean: { value, key in
                        checkTrue(value === defaults && key == "voiceOverOnOffKey"); events.append("read"); return alreadyEnabled
                    }, setBoolean: { value, enabled, key in
                        checkTrue(value === defaults && enabled && key == "voiceOverOnOffKey"); events.append("write-true")
                    }, postNotification: { name in
                        checkTrue(name == "com.apple.universalaccess.VoiceOverSettingsDidChange"); events.append("notify")
                    }, startReset: { checkTrue($0 === defaults); events.append("reset-task") })
                checkEqual(acquired, suiteExists && !alreadyEnabled)
                checkTrue(events == (!suiteExists ? ["suite"] : alreadyEnabled ? ["suite", "read"] :
                    shouldReset ? ["suite", "read", "write-true", "notify", "reset-task"] : ["suite", "read", "write-true", "notify"]))
            }
        }
    }
    var observedContext = 0, writes = 0
    let task = VoiceOverPreferenceTaskCheckContext.$value.withValue(41) {
        startVoiceOverPreferenceResetTask(sleep: { duration in
            checkEqual(duration, .milliseconds(100))
            observedContext = VoiceOverPreferenceTaskCheckContext.value
        }, setFalse: { writes += 1 })
    }
    try await task.value
    checkTrue(observedContext == 41 && writes == 1)
    let cancelled = startVoiceOverPreferenceResetTask(sleep: { _ in throw CancellationError() },
        setFalse: { unexpectedFailure() })
    do { try await cancelled.value; unexpectedFailure() } catch is CancellationError {}
}


private func runAXApplicationInitializationChecks() {
    final class Window {}
    enum Failure: Error { case timeout }
    let window = Window()
    var trace: [String] = []
    let absent: Window? = nil
    checkTrue(!initializeAXApplication(window: absent,
        initialDelay: { _ in preconditionFailure("absent window must not sleep") },
        poll: { _, _, _ in preconditionFailure("absent window must not poll") },
        hasWebAreaDescendant: { _ in preconditionFailure("absent window must not search") },
        reportError: { _ in preconditionFailure("absent window is not a poll error") }))
    let success = initializeAXApplication(window: window,
        initialDelay: { checkEqual($0, 100_000); trace.append("delay") },
        poll: { timeout, delay, condition in
            checkEqual(timeout, 1); checkEqual(delay, 0.05)
            trace.append("poll")
            checkTrue(!condition()); checkTrue(condition())
        }, hasWebAreaDescendant: {
            checkTrue($0 === window)
            let ready = trace.last == "search"
            trace.append("search"); return ready
        }, reportError: { _ in preconditionFailure("successful poll must not report") })
    checkTrue(success); checkEqual(trace, ["delay", "poll", "search", "search"])
    trace = []
    let failed = initializeAXApplication(window: window,
        initialDelay: { _ in trace.append("delay") },
        poll: { _, _, condition in
            trace.append("poll"); checkTrue(!condition()); throw Failure.timeout
        }, hasWebAreaDescendant: { _ in trace.append("search"); return false },
        reportError: { checkTrue($0 is Failure); trace.append("error") })
    checkTrue(!failed); checkEqual(trace, ["delay", "poll", "search", "error"])
}


private func runSynchronousPollingChecks() throws {
    let start = Date(timeIntervalSince1970: 100)
    var times = [0.0, 1.0, 1.01]
    var sleeps: [Double] = []
    var reads = 0
    do {
        try pollUntilTrueSync(timeout: 1, delay: 0.05, makeStartDate: { start },
            currentDate: { start.addingTimeInterval(times.removeFirst()) },
            sleep: { sleeps.append($0) }, condition: { reads += 1; return false })
        preconditionFailure("expected polling timeout")
    } catch { checkTrue(error as? PollError == .timeoutReached) }
    checkEqual(reads, 2); checkEqual(sleeps, [0.05, 0.05]); checkTrue(times.isEmpty)
    reads = 0
    try pollUntilTrueSync(timeout: 0, delay: 0.05, makeStartDate: { start },
        currentDate: { start }, sleep: { _ in preconditionFailure("success must not sleep") },
        condition: { reads += 1; return true })
    checkEqual(reads, 1)
    do {
        try pollUntilTrueSync(timeout: -1, delay: 0.05, makeStartDate: { start },
            currentDate: { start }, sleep: { _ in preconditionFailure("expired before first condition") },
            condition: { preconditionFailure("expired before first condition") })
        preconditionFailure("negative timeout must expire")
    } catch { checkTrue(error as? PollError == .timeoutReached) }
    // A backward wall-clock jump extends eligibility, matching Date semantics.
    times = [0, -2, 1]; reads = 0; sleeps = []
    try pollUntilTrueSync(timeout: 1, delay: 0.05, makeStartDate: { start },
        currentDate: { start.addingTimeInterval(times.removeFirst()) }, sleep: { sleeps.append($0) },
        condition: { reads += 1; return reads == 3 })
    checkEqual(reads, 3); checkEqual(sleeps, [0.05, 0.05])
}


private func runUIElementDescendantChecks() {
    let tree = [0: [1, 2], 1: [3], 2: [4], 3: [], 4: []]
    var expanded: [Int] = []; var tested: [Int] = []
    let result = uiElementDescendant(of: 0, children: { expanded.append($0); return tree[$0]! },
        matchesType: { tested.append($0); return $0 == 2 || $0 == 3 }, passingTest: { _ in true })
    checkEqual(result, 2); checkEqual(tested, [1, 2]); checkEqual(expanded, [0, 1])
    tested = []; expanded = []
    let predicateResult = uiElementDescendant(of: 0,
        children: { expanded.append($0); return tree[$0]! }, matchesType: { $0 >= 2 },
        passingTest: { tested.append($0); return $0 == 4 })
    checkEqual(predicateResult, 4); checkEqual(tested, [2, 3, 4]); checkEqual(expanded, [0, 1, 2, 3])
    var predicates = 0
    let duplicateResult = uiElementDescendant(of: 0, children: { $0 == 0 ? [1, 1] : [] },
        matchesType: { _ in true }, passingTest: { _ in predicates += 1; return predicates == 2 })
    checkEqual(duplicateResult, 1); checkEqual(predicates, 2)
    let empty = uiElementDescendant(of: 0, children: { _ in [] as [Int] },
        matchesType: { _ in preconditionFailure("root is not a descendant") }, passingTest: { _ in true })
    checkTrue(empty == nil)
}


private func runAXEnablementApplicationGuardChecks() {
    enum Failure: Error { case missingPID }
    for missing in 0...3 {
        var trace: [String] = []
        let result: String? = withAXEnablementApplication(pid: {
            trace.append("pid"); if missing == 0 { throw Failure.missingPID }; return 42
        }, runningApplication: { pid -> Int32? in
            checkEqual(pid, 42); trace.append("app"); return missing == 1 ? nil : pid
        }, bundleIdentifier: { app in
            checkEqual(app, 42); trace.append("bundle"); return missing == 2 ? nil : ""
        }, operation: { app, bundle in
            checkEqual(app, 42); checkEqual(bundle, ""); trace.append("operation"); return "ok"
        })
        checkEqual(trace, Array(["pid", "app", "bundle", "operation"].prefix(missing + 1)))
        checkEqual(result, missing == 3 ? "ok" : nil)
    }
}


@MainActor
private func runApplicationPrimaryWindowChecks() {
    checkEqual(applicationPrimaryWindow(focusedWindow: { 1 }, mainWindow: { unexpectedFailure() }, windows: { unexpectedFailure() }), 1)
    checkEqual(applicationPrimaryWindow(focusedWindow: { nil }, mainWindow: { 2 }, windows: { unexpectedFailure() }), 2)
    checkEqual(applicationPrimaryWindow(focusedWindow: { nil }, mainWindow: { nil }, windows: { [3, 4] }), 4)
    let missing: Int? = applicationPrimaryWindow(focusedWindow: { nil }, mainWindow: { nil }, windows: { [] })
    checkTrue(missing == nil)
    let target = Target(.current)
    var acquisitions = 0; var releases = 0
    func make() -> AXEnablementAssertion? {
        acquisitions += 1
        return AXEnablementAssertion(kinds: [.enableElectronAccessibility]) { _ in releases += 1 }
    }
    target.activateAccessibility(make: make); target.activateAccessibility(make: make)
    checkEqual(acquisitions, 1); checkEqual(releases, 0)
    target.deactivateAccessibility(); checkEqual(releases, 1); checkTrue(target.accessibilityAssertion == nil)
    target.deactivateAccessibility(); checkEqual(releases, 1)
    target.activateAccessibility(make: make); checkEqual(acquisitions, 2)
    target.deactivateAccessibility(); checkEqual(releases, 2)
    target.activateAccessibility(make: { acquisitions += 1; return nil })
    target.activateAccessibility(make: { acquisitions += 1; return nil })
    checkEqual(acquisitions, 4)
}


private func runWindowOrderingObserverTaskStoreChecks() {
    final class Handle {
        let name: String
        init(_ name: String) { self.name = name }
    }
    var trace: [String] = []
    var owner: WindowOrderingObserverTaskStore<Handle>? = .init(observedWindowIDs: [7, 7, 2],
        cancel: { trace.append("cancel-" + $0.name) })
    checkEqual(owner!.observedWindowIDs, [7, 7, 2])
    owner!.start { trace.append("make"); return Handle("main") }
    owner!.start { preconditionFailure("duplicate start must not replace task") }
    owner!.observedWindowIDs = [3, 0]
    checkEqual(owner!.observedWindowIDs, [3, 0]); checkEqual(trace, ["make"])
    weak var menuLifetime: Handle?
    owner!.withState { state in
        let handle = Handle("menu"); menuLifetime = handle; state.menuTask = handle
    }
    owner!.menuDidClose(); checkTrue(menuLifetime == nil)
    checkEqual(trace, ["make", "cancel-menu"])
    owner!.withState { checkTrue($0.task != nil); $0.menuTask = Handle("menu2") }
    owner!.stop(); checkEqual(trace, ["make", "cancel-menu", "cancel-main", "cancel-menu2"])
    owner!.withState { checkTrue($0.task == nil && $0.menuTask == nil) }
    owner!.stop(); owner!.menuDidClose(); checkEqual(trace.count, 4)
    owner!.start { Handle("restart") }
    owner!.withState { $0.menuTask = Handle("final-menu") }
    owner = nil
    checkEqual(Array(trace.suffix(2)), ["cancel-restart", "cancel-final-menu"])
}


private func runWindowServerEventChecks() {
    let expected: [UInt32] = Array(800...816) + Array(1325...1328)
    checkEqual(WindowServerEvent.allCases.map(\.rawValue), expected)
    for event in WindowServerEvent.allCases { checkEqual(WindowServerEvent(rawValue: event.rawValue), event) }
    for invalid: UInt32 in [0, 799, 817, 1324, 1329, .max] { checkTrue(WindowServerEvent(rawValue: invalid) == nil) }
}


private func runCGWindowObserverRegistrationChecks() {
    var trace: [String] = []
    let events: [WindowServerEvent] = [.didMove, .didMove, .didChangeOrder]
    var connectionReads = 0
    var owner: CGWindowObserverRegistration<Int>? = .init(windowIDs: [7, 0, 7], events: events,
        registerCallback: { trace.append("callback+"); return 42 },
        removeCallback: { checkEqual($0, 42); trace.append("callback-") },
        mainConnection: { connectionReads += 1; trace.append("connection"); return nil },
        registerNotification: { connection, event, id in
            checkTrue(connection == nil); checkEqual(id, 42)
            trace.append("register-\(event.rawValue)"); return .failure
        }, removeNotification: { connection, event, id in
            checkTrue(connection == nil); checkEqual(id, 42)
            trace.append("remove-\(event.rawValue)"); return .failure
        }, requestWindows: { connection, windows, count in
            checkTrue(connection == nil); checkEqual(windows, [7, 0, 7]); checkEqual(count, 3)
            trace.append("request")
        })
    checkTrue(owner != nil)
    checkEqual(trace, ["callback+", "connection", "register-806", "register-806", "register-808", "request"])
    owner = nil
    checkEqual(Array(trace.suffix(5)), ["callback-", "connection", "remove-806", "remove-806", "remove-808"])
    checkEqual(connectionReads, 2)
    trace = []
    var empty: CGWindowObserverRegistration<Int>? = .init(windowIDs: [], events: [],
        registerCallback: { trace.append("callback+"); return 0 },
        removeCallback: { checkEqual($0, 0); trace.append("callback-") },
        mainConnection: { trace.append("connection"); return nil },
        registerNotification: { _, _, _ in unexpectedFailure() },
        removeNotification: { _, _, _ in unexpectedFailure() },
        requestWindows: { _, ids, count in checkTrue(ids.isEmpty); checkEqual(count, 0); trace.append("request") })
    checkTrue(empty != nil); empty = nil
    checkEqual(trace, ["callback+", "connection", "request", "callback-", "connection"])
}


private func runCGWindowCallbackRegistryChecks() {
    final class Entry {
        let released: () -> Void
        init(_ released: @escaping () -> Void) { self.released = released }
        deinit { released() }
    }
    let registry = CGWindowCallbackRegistry<Entry>()
    var releases = 0
    weak var lifetime: Entry?
    var entry: Entry? = Entry { releases += 1 }
    lifetime = entry
    let first = registry.register(entry!)
    checkEqual(first, 1); entry = nil; checkTrue(lifetime != nil)
    let second = registry.register(Entry { releases += 1 })
    checkEqual(second, 2)
    registry.withState { state in checkEqual(state.lastID, 2); checkTrue(state.entries[first] === lifetime) }
    var removed = registry.remove(first)
    checkTrue(removed === lifetime); checkEqual(releases, 0)
    checkTrue(registry.remove(first) == nil); checkTrue(registry.remove(0) == nil)
    removed = nil; checkEqual(releases, 1); checkTrue(lifetime == nil)
    let third = registry.register(Entry { releases += 1 })
    checkEqual(third, 3)
    _ = registry.remove(second); _ = registry.remove(third); checkEqual(releases, 3)
    registry.withState { checkEqual($0.lastID, 3); checkTrue($0.entries.isEmpty) }
    // Removal returns ownership; destruction can safely acquire this same lock.
    let reentrant = registry.register(Entry { registry.withState { checkTrue($0.entries.isEmpty) } })
    var final = registry.remove(reentrant)
    checkTrue(final != nil); final = nil
}


private func runCGWindowNotificationChecks() {
    var rawID: UInt32 = 42
    let context = UnsafeMutableRawPointer(bitPattern: 7)!
    var trace: [String] = []
    withUnsafeMutablePointer(to: &rawID) { pointer in
        func send(_ event: UInt32 = 804, _ data: UnsafeMutableRawPointer? = nil,
            _ context: UnsafeMutableRawPointer? = context, fresh: String? = nil, cached: String? = nil) {
            dispatchCGWindowNotification(rawEvent: event, data: data, context: context,
                entry: { id in
                    checkEqual(id, 7); trace.append("entry")
                    return CGWindowNotificationEntry(handler: { window, event in
                        checkEqual(event, .isTerminated); trace.append(window)
                    }, initialWindows: cached.map { [42: $0] } ?? [:])
                }, window: { id in checkEqual(id, 42); trace.append("fresh"); return fresh })
        }
        send(799, UnsafeMutableRawPointer(bitPattern: 1)); checkTrue(trace.isEmpty)
        send(); checkTrue(trace.isEmpty)
        send(804, UnsafeMutableRawPointer(pointer), nil); checkTrue(trace.isEmpty)
        send(804, UnsafeMutableRawPointer(pointer), fresh: "current", cached: "initial")
        checkEqual(trace, ["entry", "fresh", "current"]); trace = []
        send(804, UnsafeMutableRawPointer(pointer), cached: "initial")
        checkEqual(trace, ["entry", "fresh", "initial"]); trace = []
        send(804, UnsafeMutableRawPointer(pointer)); checkEqual(trace, ["entry", "fresh"])
        let registry = CGWindowCallbackRegistry<CGWindowNotificationEntry<Int>>()
        let id = registry.register(.init(handler: { window, _ in
            checkEqual(window, 42); _ = registry.remove(1)
        }, initialWindows: [:]))
        dispatchCGWindowNotification(rawEvent: 804, data: UnsafeMutableRawPointer(pointer),
            context: UnsafeMutableRawPointer(bitPattern: id), entry: registry.entry, window: { Int($0) })
        checkTrue(registry.entry(id) == nil)
        dispatchCGWindowNotification(rawEvent: 804, data: UnsafeMutableRawPointer(pointer),
            context: context, entry: { _ -> CGWindowNotificationEntry<Int>? in nil },
            window: { _ in preconditionFailure("missing entry skips native lookup") })
    }
}


private func runCGWindowEventStreamChecks() async {
    final class Observer {
        let release: () -> Void
        init(_ release: @escaping () -> Void) { self.release = release }
        deinit { release() }
    }
    typealias Stream = CGWindowEventStream<Int, Observer>
    var made = 0; var released = 0
    var handlers: [(Int, WindowServerEvent) -> Void] = []
    var references: [WeakObserver] = []
    struct WeakObserver { weak var value: Observer? }
    let sequence = Stream(windowIDs: [7, 7], events: [.didMove], bufferingPolicy: .bufferingNewest(2),
        makeObserver: { windows, events, handler in
            checkEqual(windows, [7, 7]); checkEqual(events, [.didMove]); made += 1
            handlers.append(handler)
            let observer = Observer { released += 1 }
            references.append(WeakObserver(value: observer)); return observer
        })
    checkEqual(made, 0)
    var first: Stream.AsyncIterator? = sequence.makeAsyncIterator()
    checkEqual(made, 1); checkTrue(references[0].value != nil)
    handlers[0](1, .didMove); handlers[0](2, .didMove); handlers[0](3, .didMove)
    let two = await first!.next(); let three = await first!.next()
    checkEqual(two?.0, 2); checkEqual(three?.0, 3)
    var copy = first
    checkTrue(copy != nil)
    first = nil; checkEqual(released, 0)
    copy = nil; checkEqual(released, 1); checkTrue(references[0].value == nil)
    var second: Stream.AsyncIterator? = sequence.makeAsyncIterator()
    checkEqual(made, 2)
    handlers[1](4, .didMove)
    checkEqual(await second!.next()?.0, 4)
    second = nil; checkEqual(released, 2)
    // Cancel a task awaiting an empty standard AsyncStream. Subscription
    // resources are released when its iterator leaves task scope.
    let task = Task { () -> Bool in
        var iterator = sequence.makeAsyncIterator()
        return await iterator.next() == nil
    }
    task.cancel()
    checkTrue(await task.value); checkEqual(made, 3); checkEqual(released, 3)
}


private func runWindowOrderingRestorationContextChecks() async {
    for scenario in 0...4 {
        var trace: [String] = []
        let context = windowOrderingRestorationContext(windowID: 7, ownerPID: 42,
            observedWindowIDs: { trace.append("ids"); return scenario == 0 ? [] : [7, 7] },
            frontmostApplication: { () -> Int? in trace.append("app"); return scenario == 1 ? nil : 8 },
            processIdentifier: { app in checkEqual(app, 8); trace.append("pid"); return scenario == 2 ? 42 : 43 },
            focusedWindow: { app -> String? in checkEqual(app, 8); trace.append("focused"); return scenario == 3 ? nil : "focused" })
        checkEqual(trace, Array(["ids", "app", "pid", "focused"].prefix(min(scenario + 1, 4))))
        if scenario == 4 { checkEqual(context?.application, 8); checkEqual(context?.window, "focused") }
        else { checkTrue(context == nil) }
    }
    var handler: ((Int, WindowServerEvent) -> Void)?
    let stream = orderingWindowEventStream(observedWindowIDs: [3, 3], makeObserver: {
        windows, events, callback -> Int in
        checkEqual(windows, [3, 3]); checkEqual(events, [.didChangeOrder]); handler = callback; return 0
    })
    var iterator = stream.makeAsyncIterator()
    handler!(1, .didChangeOrder); handler!(2, .didChangeOrder)
    let result = await iterator.next()
    checkEqual(result?.0, 2); checkEqual(result?.1, .didChangeOrder)
}


private func runWindowOrderingRaiseScopeChecks() async throws {
    final class Observer {}
    enum Failure: Error { case raise, sleep }
    for scenario in 0...3 {
        var trace: [String] = []
        weak var lifetime: Observer?
        do {
            try await performWindowOrderingRaiseScope(onScreenWindowIDs: { trace.append("ids"); return [7, 7, 0] },
                makeObserver: { ids, events, notify in
                    checkEqual(ids, [7, 7, 0]); checkEqual(events, [.workspaceAddWindow]); trace.append("observe")
                    let observer = Observer(); lifetime = observer
                    if scenario == 1 { notify() }
                    return observer
                }, raise: {
                    checkTrue(lifetime != nil); trace.append("raise")
                    if scenario == 2 { throw Failure.raise }
                }, reportRaiseError: { checkTrue($0 is Failure); trace.append("error") },
                settle: { duration in
                    checkEqual(duration, .milliseconds(5)); checkTrue(lifetime != nil); trace.append("settle")
                    if scenario == 3 { throw Failure.sleep }
                })
            checkTrue(scenario != 3)
        } catch { checkTrue(scenario == 3); checkTrue(error is Failure) }
        checkTrue(lifetime == nil)
        let expected = scenario == 1 ? ["ids", "observe", "settle"] :
            scenario == 2 ? ["ids", "observe", "raise", "error", "settle"] : ["ids", "observe", "raise", "settle"]
        checkEqual(trace, expected)
    }
}


private func runWindowOrderingRestorationChecks() async throws {
    enum Failure: Error { case restore }
    var restored: [String] = []
    for selected in [false, true] {
        try await restoreWindowOrderingChange(windowID: 7, ownerPID: 42,
            observedWindowIDs: { selected ? [7] : [] }, frontmostApplication: { 8 },
            processIdentifier: { _ in 43 }, focusedWindow: { _ in "focused" },
            restore: { restored.append($0) })
    }
    checkEqual(restored, ["focused"])
    do {
        try await restoreWindowOrderingChange(windowID: 7, ownerPID: 42,
            observedWindowIDs: { [7] }, frontmostApplication: { 8 },
            processIdentifier: { _ in 43 }, focusedWindow: { _ in "focused" },
            restore: { _ in throw Failure.restore })
        preconditionFailure("restoration cancellation/error must propagate to event loop")
    } catch { checkTrue(error is Failure) }
}


private func runWindowOrderingEventLoopChecks() async {
    final class Owner { var ids: [UInt32] = [1, 1] }
    final class Observer {
        let release: () -> Void
        init(_ release: @escaping () -> Void) { self.release = release }
        deinit { release() }
    }
    enum Failure: Error { case action }
    let owner = Owner()
    var trace: [String] = []; var count = 0
    var latest: ((Int, WindowServerEvent) -> Void)?
    await runWindowOrderingEventLoop(weakOwner: { [weak owner] in owner }, observedWindowIDs: { $0.ids },
        makeObserver: { ids, events, callback in
            count += 1; checkEqual(events, [.didChangeOrder])
            checkEqual(ids, count == 1 ? [1, 1] : [2])
            let number = count; trace.append("make-\(number)")
            latest = callback; callback(number * 10, .didChangeOrder)
            return Observer { trace.append("drop-\(number)") }
        }, handle: { current, value, _ in
            trace.append("handle-\(value)")
            if value == 10 { current.ids = [2] }
            else if value == 20 { latest!(21, .didChangeOrder); throw Failure.action }
            else { throw CancellationError() }
        }, reportError: { checkTrue($0 is Failure); trace.append("error") })
    checkEqual(trace, ["make-1", "handle-10", "drop-1", "make-2", "handle-20", "error", "handle-21", "drop-2"])
    // Reordering/removing duplicates keeps the same subscription.
    count = 0; owner.ids = [1, 2, 1]
    await runWindowOrderingEventLoop(weakOwner: { [weak owner] in owner }, observedWindowIDs: { $0.ids },
        makeObserver: { _, _, callback in
            count += 1; latest = callback; callback(1, .didChangeOrder); return Observer {}
        }, handle: { current, value, _ in
            if value == 1 { current.ids = [2, 1]; latest!(2, .didChangeOrder) }
            else { throw CancellationError() }
        }, reportError: { _ in unexpectedFailure() })
    checkEqual(count, 1)
    await runWindowOrderingEventLoop(weakOwner: { () -> Owner? in nil }, observedWindowIDs: { _ in unexpectedFailure() },
        makeObserver: { _, _, _ -> Observer in unexpectedFailure() },
        handle: { (_: Owner, _: Int, _: WindowServerEvent) in unexpectedFailure() },
        reportError: { _ in unexpectedFailure() })
}


private func runWindowOrderingMenuOpenChecks() {
    var trace: [String] = []
    let store = WindowOrderingObserverTaskStore<Int>(observedWindowIDs: [7, 7, 8], cancel: { trace.append("cancel-\($0)") })
    store.start { 100 }
    for scenario in 0...3 {
        trace = []
        store.withState { $0.menuTask = 9 }
        openWindowOrderingMenu(store: store,
            windowOwnerPID: { id in trace.append("window-\(id)"); return scenario == 0 ? nil : 42 },
            frontmostApplication: { () -> Int? in trace.append("front"); return scenario == 1 ? nil : 3 },
            processIdentifier: { app in checkEqual(app, 3); trace.append("pid"); return scenario == 2 ? 42 : 43 },
            makeTask: { pid, ids in
                checkEqual(pid, 43); checkEqual(ids, [7, 7, 8]); trace.append("task"); return 10
            })
        let base = ["cancel-9", "window-7", "window-7", "window-8"]
        let extra = scenario == 0 ? [] : scenario == 1 ? ["front"] : scenario == 2 ? ["front", "pid"] : ["front", "pid", "pid", "task"]
        checkEqual(trace, base + extra)
        store.withState { state in checkEqual(state.task, 100); checkEqual(state.menuTask, scenario == 3 ? 10 : nil) }
    }
    // Lookups happen unlocked after capturing IDs: mutation does not replace
    // the captured task IDs, and no owner comparison filters an otherwise valid -1 PID.
    trace = []
    openWindowOrderingMenu(store: store, windowOwnerPID: { _ in -1 },
        frontmostApplication: { store.observedWindowIDs = [99]; return 3 },
        processIdentifier: { _ in 43 }, makeTask: { _, ids in checkEqual(ids, [7, 7, 8]); return 11 })
    checkEqual(trace, ["cancel-10"])
    store.stop()
}


private func runWindowOrderingMenuTaskChecks() async {
    enum Failure: Error { case native }
    var sleeps = 0; var reads = 0; var raises = 0; var focusReads = 0
    await runWindowOrderingMenuTask(observedWindowIDs: [7, 7],
        focusedWindow: { focusReads += 1; return "focused" }, windowID: { _ in 8 },
        onScreenWindowIDs: { reads += 1; return reads == 1 ? [99, 8, 7] : [7, 8] },
        raise: { checkEqual($0, "focused"); raises += 1; throw Failure.native },
        sleep: { checkEqual($0, .milliseconds(5)); sleeps += 1 })
    checkEqual(focusReads, 1); checkEqual(sleeps, 2); checkEqual(reads, 2); checkEqual(raises, 1)
    sleeps = 0; reads = 0
    await runWindowOrderingMenuTask(observedWindowIDs: [7], focusedWindow: { 1 }, windowID: { _ in 8 },
        onScreenWindowIDs: { reads += 1; return [7] }, raise: { _ in unexpectedFailure() },
        sleep: { _ in sleeps += 1 })
    checkEqual(sleeps, 20); checkEqual(reads, 20)
    await runWindowOrderingMenuTask(observedWindowIDs: [7], focusedWindow: { () -> Int? in nil },
        windowID: { _ in unexpectedFailure() }, onScreenWindowIDs: { unexpectedFailure() },
        raise: { _ in unexpectedFailure() }, sleep: { _ in unexpectedFailure() })
    await runWindowOrderingMenuTask(observedWindowIDs: [7], focusedWindow: { 1 },
        windowID: { _ in throw Failure.native }, onScreenWindowIDs: { unexpectedFailure() },
        raise: { _ in unexpectedFailure() }, sleep: { _ in unexpectedFailure() })
    await runWindowOrderingMenuTask(observedWindowIDs: [7], focusedWindow: { 1 }, windowID: { _ in 8 },
        onScreenWindowIDs: { unexpectedFailure() }, raise: { _ in unexpectedFailure() },
        sleep: { _ in throw CancellationError() })
}


private func runWindowOrderingObserverCompositionChecks() async {
    final class Observer {
        let release: () -> Void
        init(_ release: @escaping () -> Void) { self.release = release }
        deinit { release() }
    }
    typealias Callback = (Int, WindowServerEvent) -> Void
    let ready = AsyncStream<Callback>.makeStream()
    let seen = AsyncStream<Int>.makeStream()
    let disposed = AsyncStream<Bool>.makeStream()
    let deadline = Task {
        do { try await Task.sleep(for: .seconds(2)) } catch { return }
        ready.continuation.finish(); seen.continuation.finish(); disposed.continuation.finish()
    }
    defer { deadline.cancel() }
    var owner: WindowOrderingObserver<Int, Observer, Int>? = .init(observedWindowIDs: [7],
        makeObserver: { ids, events, callback in
            checkEqual(ids, [7]); checkEqual(events, [.didChangeOrder]); ready.continuation.yield(callback)
            return Observer { disposed.continuation.yield(true) }
        }, restore: { value, ids in checkEqual(ids(), [7]); seen.continuation.yield(value) },
        windowOwnerPID: { _ in nil }, frontmostApplication: { nil }, processIdentifier: { Int32($0) },
        runMenuTask: { _, _ in unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
    weak var lifetime = owner
    owner!.start(); owner!.start()
    var readyIterator = ready.stream.makeAsyncIterator()
    guard let callback = await readyIterator.next() else { unexpectedFailure() }
    callback(42, .didChangeOrder)
    var seenIterator = seen.stream.makeAsyncIterator()
    checkEqual(await seenIterator.next(), 42)
    // The idle main task's weak capture must permit owner deinit, which cancels
    // that task and disposes its native-observer equivalent.
    owner = nil
    var disposedIterator = disposed.stream.makeAsyncIterator()
    checkEqual(await disposedIterator.next(), true)
    checkTrue(lifetime == nil)
}


private func runMouseWindowRegistryOwnershipChecks() {
    final class Window { var id: UInt32; init(_ id: UInt32) { self.id = id } }
    var updates: [Set<UInt32>] = []
    let registry = MouseWindowRegistry<Window>(windowID: { $0.id }, observedWindowIDsChanged: { updates.append(Set($0)) })
    let first = Window(7), replacement = Window(7), zero = Window(0)
    registry.register(first); registry.register(replacement)
    checkEqual(updates, [Set([7]), Set([7])])
    registry.register(zero); checkEqual(updates.last, Set([7, 0]))
    let snapshot = registry.windows()
    checkTrue(snapshot[7] === replacement); checkTrue(snapshot[0] == nil)
    checkEqual(updates.last, Set([7])); let notifications = updates.count
    _ = registry.windows(); checkEqual(updates.count, notifications)
    // A changed but nonzero AX ID does not rewrite the stored map key.
    replacement.id = 8
    checkTrue(registry.windows()[7] === replacement)
    let later = Window(9)
    let firstOrdering = registry.orderedWindows(orderedWindowIDs: {
        registry.register(later) // occurs after the controller map snapshot
        return [9, 7, 7, 123]
    })
    checkEqual(firstOrdering.count, 2); checkTrue(firstOrdering.allSatisfy { $0 === replacement })
    let secondOrdering = registry.orderedWindows(orderedWindowIDs: { [9, 7] })
    checkTrue(secondOrdering[0] === later && secondOrdering[1] === replacement)
    replacement.id = 0
    checkTrue(registry.windows()[7] == nil); checkEqual(updates.last, Set([9]))
}


private func runAXNotificationRegistrationChecks() throws {
    checkEqual(AXNotification("AXMenuOpened"), .menuOpened)
    checkEqual(AXNotification("AXMenuClosed"), .menuClosed)
    checkEqual(AXNotification("AXWindowCreated"), .windowCreated)
    let targets = AXNotificationRegistrationTargets<Int>()
    var calls = 0
    for error in [AXError.success, .notificationAlreadyRegistered] {
        try targets.register(.windowCreated, ignoringErrors: [], for: 7,
            addNotification: { calls += 1; return error })
    }
    checkEqual(calls, 2); checkEqual(targets.targets[.windowCreated], Set([7]))
    try targets.register(.windowCreated, ignoringErrors: [], for: 8, addNotification: { .success })
    checkEqual(targets.targets[.windowCreated], Set([7, 8]))
    for error in [AXError.success, .notificationAlreadyRegistered, .notificationUnsupported] {
        try targets.register(.menuOpened, ignoringErrors: [error], for: 9, addNotification: { error })
    }
    checkTrue(targets.targets[.menuOpened] == nil)
    do {
        try targets.register(.menuClosed, ignoringErrors: [], for: 9, addNotification: { .failure })
        preconditionFailure("unexpected AX error must propagate")
    } catch UIElementError.axError(let error) { checkEqual(error, .failure) }
    checkTrue(targets.targets[.menuClosed] == nil)
}


private func runAXNotificationRemovalChecks() throws {
    let targets = AXNotificationRegistrationTargets<Int>()
    for id in [7, 8] { try targets.register(.windowCreated, ignoringErrors: [], for: id, addNotification: { .success }) }
    try targets.remove(.windowCreated, for: 7, removeNotification: { .notificationNotRegistered })
    checkEqual(targets.targets[.windowCreated], Set([8]))
    do {
        try targets.remove(.windowCreated, for: 8, removeNotification: { .failure })
        unexpectedFailure()
    } catch UIElementError.axError(let error) { checkEqual(error, .failure) }
    checkEqual(targets.targets[.windowCreated], Set([8]))
    try targets.remove(.windowCreated, for: 8, removeNotification: { .success })
    checkEqual(targets.targets[.windowCreated], Set<Int>())
    // A successful direct removal on an unrecorded notification creates the
    // source default empty Set; whole-notification removal does not call AX.
    try targets.remove(.menuClosed, for: 99, removeNotification: { .notificationNotRegistered })
    checkEqual(targets.targets[.menuClosed], Set<Int>())
    try targets.remove(.menuClosed, removeNotification: { _, _ in unexpectedFailure() })
    for notification in [AXNotification.windowCreated, .menuOpened] {
        try targets.register(notification, ignoringErrors: [], for: 99, addNotification: { .success })
    }
    var calls: [AXNotification] = []
    do {
        try targets.remove(notifications: [.windowCreated, .menuOpened, .menuClosed], for: 99,
            removeNotification: { notification, element in
                checkEqual(element, 99); calls.append(notification)
                return notification == .menuOpened ? .failure : .success
            })
        unexpectedFailure()
    } catch UIElementError.axError(let error) { checkEqual(error, .failure) }
    checkEqual(calls, [.windowCreated, .menuOpened])
    checkEqual(targets.targets[.windowCreated], Set<Int>())
    checkEqual(targets.targets[.menuOpened], Set([99]))
    try targets.remove(notifications: [.menuOpened, .menuOpened], removeNotification: { _, _ in .success })
    checkEqual(targets.targets[.menuOpened], Set<Int>())
}

private func runAXNotificationCallbackContextChecks() {
    final class Observer {}
    final class Owner {}
    typealias Context = AXNotificationCallbackContext<Observer, Owner>
    var observer: Observer? = Observer()
    var owner: Owner? = Owner()
    weak var weakObserver = observer
    weak var weakOwner = owner
    var context: Context? = Context(axObserver: observer!, owner: owner!)
    observer = nil
    precondition(weakObserver != nil)
    var deliveries = 0
    Context.deliver(context: nil, info: 1) { _, _ in deliveries += 1 }
    Context.deliver(context: context, info: Optional<Int>.none) { _, _ in deliveries += 1 }
    Context.deliver(context: context, info: 7) { receivedOwner, info in
        precondition(receivedOwner === owner && info == 7)
        deliveries += 1
    }
    precondition(deliveries == 1)
    owner = nil
    precondition(weakOwner == nil)
    Context.deliver(context: context, info: 8) { _, _ in deliveries += 1 }
    precondition(deliveries == 1)
    context = nil
    precondition(weakObserver == nil)
}

private func runAXNotificationInfoBridgeChecks() {
    precondition(bridgeAXNotificationInfo(nil) == nil)
    let empty = [:] as NSDictionary
    precondition(bridgeAXNotificationInfo(empty as CFDictionary)?.isEmpty == true)
    let valid = ["value": NSNumber(value: 7)] as NSDictionary
    precondition((bridgeAXNotificationInfo(valid as CFDictionary)?["value"] as? NSNumber)?.intValue == 7)
    let invalid = [NSNumber(value: 1): "value"] as NSDictionary
    precondition(bridgeAXNotificationInfo(invalid as CFDictionary) == nil)
}

private func runAppControllerMenuOpenChecks() {
    enum Failed: Error { case timeout, unavailable }
    var events: [String] = []
    prepareAppControllerMenuOpen(7, storeMenu: { _ in events.append("store") },
        windowID: { _ in events.append("id"); return 0 },
        wait: { timeout, delay, condition in
            precondition(timeout == 0.25 && delay == 0.01)
            events.append("wait")
            precondition(condition() == 0)
        }, registerMenu: { _ in events.append("register") }, menuDidOpen: { events.append("open") })
    precondition(events == ["store", "wait", "id", "register", "open"])
    events = []
    prepareAppControllerMenuOpen(7, storeMenu: { _ in events.append("store") },
        windowID: { _ in throw Failed.unavailable }, wait: { _, _, condition in
            precondition(condition() == nil)
            throw Failed.timeout
        }, registerMenu: { _ in events.append("register") }, menuDidOpen: { events.append("open") })
    precondition(events == ["store", "register", "open"])
}

private func runMouseWindowRegistryRemovalChecks() {
    final class Window {
        let identity: Int
        var id: UInt32
        init(_ identity: Int, _ id: UInt32) { self.identity = identity; self.id = id }
    }
    var updates: [Set<UInt32>] = []
    var idReads = 0
    let registry = MouseWindowRegistry<Window>(windowID: { idReads += 1; return $0.id },
        observedWindowIDsChanged: { updates.append(Set($0)) })
    let first = Window(7, 10), second = Window(7, 20), other = Window(8, 30)
    registry.register(first); registry.register(second); registry.register(other)
    updates = []; idReads = 0
    first.id = 99
    registry.republishObservedWindowIDs()
    precondition(updates == [[10, 20, 30]] && idReads == 0)
    updates = []
    var comparisons = 0
    registry.removeWindows { comparisons += 1; return $0.identity == 7 }
    precondition(comparisons == 3 && idReads == 0)
    precondition(updates.count == 2 && updates[0].count == 2 && updates[1] == [30])
    updates = []
    registry.removeWindows { _ in false }
    precondition(updates.isEmpty && idReads == 0)
    precondition(Set(registry.windows().keys) == [30])
}

private func runAppControllerMenuStateChecks() {
    let state = AppControllerMenuState<Int, String>()
    precondition(state.openedMenu == nil && state.focusedMenuBarItem == nil)
    state.setOpenedMenu(7); state.setFocusedMenuBarItem("File")
    var events: [String] = []
    state.menuDidClose(notifyOrdering: {
        precondition(state.openedMenu == 7 && state.focusedMenuBarItem == "File")
        events.append("ordering")
    }, removeWindows: {
        precondition(state.openedMenu == nil && state.focusedMenuBarItem == nil)
        events.append("remove")
        // The external callback runs outside both state locks.
        state.setOpenedMenu(8)
    })
    precondition(events == ["ordering", "remove"] && state.openedMenu == 8)
    state.setFocusedMenuBarItem("Edit")
    state.setOpenedMenu(nil)
    precondition(state.focusedMenuBarItem == "Edit")
    state.menuDidClose(notifyOrdering: {}, removeWindows: {})
    precondition(state.openedMenu == nil && state.focusedMenuBarItem == nil)
}

private func runAppControllerInitialWindowsChecks() {
    var events: [String] = []
    registerAppControllerInitialWindows(primaryWindow: { Optional<Int>.none },
        registerWindow: { _ in preconditionFailure() }, windowChildren: { _ -> [Int] in preconditionFailure() },
        isSheet: { _ in preconditionFailure() }, registerSheet: { _ in preconditionFailure() },
        children: { _ in preconditionFailure() })
    registerAppControllerInitialWindows(primaryWindow: { 9 },
        registerWindow: { events.append("window:\($0)") }, windowChildren: { _ in [1, 2, 1] },
        isSheet: { events.append("role:\($0)"); return $0 != 1 },
        registerSheet: { events.append("sheet:\($0)") }, children: { element in
            events.append("children:\(element)")
            return element == 2 ? [3] : []
        })
    precondition(events == ["window:9", "role:1", "children:1", "role:2", "sheet:2", "children:2", "role:1", "children:1", "role:3", "sheet:3", "children:3"])
}

private func runResolvedWindowRegistrationChecks() {
    var reads = 0
    var updates: [Set<UInt32>] = []
    let registry = MouseWindowRegistry<String>(windowID: { _ in reads += 1; return 99 },
        observedWindowIDsChanged: { updates.append(Set($0)) })
    registry.register("sheet", windowID: 7)
    registry.register("replacement", windowID: 7)
    registry.register("zero", windowID: 0)
    precondition(reads == 0 && updates == [[7], [7], [0, 7]])
    // Read through orderedWindows: the existing prune policy keeps nonzero
    // changed IDs under their stored key. Here the current IDs are all nonzero.
    let ordered = registry.orderedWindows { [7] }
    precondition(ordered == ["replacement"])
}

private func runMenuWindowIDChecks() throws {
    struct Window { let id: UInt32; let pid: Int32; let level: Int32 }
    var calls: [String] = []
    let result = try resolveMenuWindowID(actualPID: { calls.append("pid"); return 7 },
        accessibilityWindowID: { calls.append("axid"); return 0 }, allWindows: { options, relative in
            precondition(options.rawValue == 18 && relative == 0)
            calls.append("windows")
            return [Window(id: 1, pid: 8, level: 101), Window(id: 2, pid: 7, level: 0),
                Window(id: 3, pid: 7, level: 24), Window(id: 4, pid: 7, level: 101)]
        }, ownerPID: { $0.pid }, level: { $0.level }, windowID: { $0.id })
    precondition(result == 3 && calls == ["pid", "axid", "windows"])
    do {
        _ = try resolveMenuWindowID(actualPID: { 7 }, accessibilityWindowID: { 99 },
            allWindows: { _, _ in [Window]() }, ownerPID: { $0.pid }, level: { $0.level }, windowID: { $0.id })
        preconditionFailure("Missing native menu must not return the AX ID")
    } catch MenuWindowIDError.menuWindowNotFound {}
    enum Failed: Error { case pid }
    do {
        _ = try resolveMenuWindowID(actualPID: { throw Failed.pid },
            accessibilityWindowID: { preconditionFailure() }, allWindows: { _, _ in [Window]() },
            ownerPID: { $0.pid }, level: { $0.level }, windowID: { $0.id })
        preconditionFailure()
    } catch Failed.pid {}
}

private func runWindowWrapperStorageChecks() {
    let ax = AXUIElementCreateApplication(getpid())
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let root = UIElement(axElement: ax, cache: cache)
    let requested: Set<UIElementAttribute> = [.frame]
    let transaction = UIElementTreeTransaction(element: root,
        cache: UIElementTransactionCache(attributeTable: [ax: [:]], requestedAttributes: requested,
            fallbackElements: UIElementFallbackCache(initialState: [:])),
        roleFrequencyTable: FrequencyTable<UIElementRole>())
    transaction.perform { _ in
        let window = WindowUIElement(element: ax)
        let sheet = SheetUIElement(element: ax)
        let menu = MenuUIElement(element: ax)
        precondition(CFEqual(window.axElement, ax) && CFEqual(sheet.axElement, ax) && CFEqual(menu.axElement, ax))
        precondition(window.cache.transactionAttributes == requested)
        precondition(sheet.cache.transactionAttributes == requested)
        precondition(menu.cache.transactionAttributes == requested)
        precondition(WindowUIElement.role == .window && SheetUIElement.role == .sheet && MenuUIElement.role == .menu)
    }
    precondition(UIElementTreeTransaction.current == nil)
}

private func runAppControllerWindowEventDispatchChecks() {
    enum Failed: Error { case removal }
    var events: [String] = []
    func dispatch(_ name: AXNotification) {
        dispatchAppControllerWindowEvent(name, element: 7,
            registerWindow: { precondition($0 == 7); events.append("window") },
            registerSheet: { _ in events.append("sheet") },
            clearApplicationAttention: { events.append("attention") },
            windowCreatedFocusHandling: { _ in events.append("focus") },
            removeDestroyedSubscription: { _ in events.append("remove"); throw Failed.removal },
            menuOpened: { _ in events.append("menu-open") }, menuClosed: { _ in events.append("menu-close") },
            stopSuppressingMenuDismissal: { events.append("stop") },
            republishObservedWindowIDs: { events.append("ids") })
    }
    for (name, expected) in [(AXNotification.windowCreated, ["window", "attention", "focus"]),
        (.sheetCreated, ["sheet", "attention"]), (.uiElementDestroyed, ["remove", "stop"]),
        (.menuOpened, ["menu-open"]), (.menuClosed, ["menu-close", "stop"]),
        (.windowMoved, ["ids"]), (.windowResized, ["ids"]),
        (AXNotification("UnrecognizedNotification"), [])] {
        events = []; dispatch(name); precondition(events == expected)
    }
}
