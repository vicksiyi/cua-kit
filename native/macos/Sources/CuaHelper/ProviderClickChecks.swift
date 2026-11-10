import AccessibilitySupport
#if canImport(SystemSoftware)
import SystemSoftware
#endif
#if canImport(SlimCore)
import SlimCore
#endif
import Animation
import GraphicsSupport
import DequeModule
import Carbon
import ApplicationServices
import AppKit
import struct SwiftUI.Angle

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
        var readPID: (() throws -> Int32)?
        var readActualPID: (() throws -> Int32)?
        var readWindowID: (() throws -> UInt32)?
        var pid: Int32 { get throws { guard let readPID else { fatalError() }; return try readPID() } }
        var actualPID: Int32 { get throws { guard let readActualPID else { fatalError() }; return try readActualPID() } }
        var windowID: UInt32 { get throws { guard let readWindowID else { fatalError() }; return try readWindowID() } }
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
            runFocusItemResolutionChecks(source: source)
            runBuilderAppendChecks(source: source)
            runMacTransformationRenderChecks(source: source)
            runMacTreeTransformCompositionChecks(source: source)
            runExtractionURLRegistrationChecks(source: source)
            try runExtractionURLCompactionChecks(source: source)
            runTreeURLTrimmingChecks(source: source)
            try runExtractionRevisionChoiceChecks(source: source)
            try runAppendedRevisionChecks(source: source)
            try runIndexedTreeRefetchResolutionChecks(source: source)
            runSelectionTreeCapturePreparationChecks(source: source)
            try runSelectionExtractionTransactionChecks(source: source)
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
            let selectionCache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
            let selectionWindow = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
                axWindow: WindowUIElement(axElement: source.axElement, cache: selectionCache),
                axApplication: ApplicationUIElement(axElement: source.axElement, cache: selectionCache))
            let selection = SystemSelection(applicationWindow: selectionWindow, windowRevision: revision, invalidationMonitor: nil)
            checkEqual(selection.elementsMatching(source, ignoreValueChange: false).count, 1)
            checkTrue(selection.elementsMatching(focus, ignoreValueChange: false).isEmpty)
            let duplicates = UIElementTree(items: [.init(element: source, subtree: empty),
                .init(element: source, subtree: empty)], focusedElement: nil)
            let duplicateRevision = try UIElementTreeRevision.root(duplicates, focusTree: nil, lineageID: "duplicates") { _ in
                UIElementRenderTree(isFocus: false, roots: [])
            }
            let duplicateSelection = SystemSelection(applicationWindow: selectionWindow,
                windowRevision: duplicateRevision, invalidationMonitor: nil)
            checkEqual(duplicateSelection.elementsMatching(source, ignoreValueChange: false).count, 2)
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
        targetMock.readPID = { 7 }; targetMock.readActualPID = { 7 }; targetMock.readWindowID = { 42 }
        targetMock.testBundleIdentifier = "com.openai.atlas.owned-check"
        let preservedWindow: any WindowUIElementProtocol = MenuUIElement(axElement: targetAX, cache: target.cache)
        let resolved = try target.mouseEventTarget(at: CGPoint(x: 20, y: 30),
            accessibilityWindow: preservedWindow, hitElement: nil, reportError: { _ in unexpectedFailure() })
        checkTrue(resolved.accessibilityWindow is MenuUIElement)
        checkTrue(CFEqual(resolved.accessibilityWindow.axElement, targetAX))
        checkEqual(resolved.windowID, 42); checkEqual(resolved.windowBounds, rect)
        let routingRevision = try UIElementTreeRevision<TransformedUIElement>.root(
            .init(items: [], focusedElement: nil), focusTree: nil, lineageID: "protocol-routing") { _ in
                UIElementRenderTree(isFocus: false, roots: [])
            }
        let routingSelection = SystemSelection(applicationWindow: ApplicationWindow(
            cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(42)]),
            axWindow: WindowUIElement(axElement: targetAX, cache: target.cache),
            axApplication: ApplicationUIElement(axElement: targetAX, cache: target.cache)),
            windowRevision: routingRevision, invalidationMonitor: nil)
        let routingTree = try RefetchableSkyshotAXTree(systemSelection: routingSelection, isAXTreeDiffingEnabled: true)
        let routingWrapper = RefetchableUIElement(element: target, containingTree: routingTree)
        let protocolRouted = try target.mouseEventTarget(at: CGPoint(x: 20, y: 30),
            accessibilityWindow: preservedWindow, hitElement: routingWrapper,
            reportError: { _ in unexpectedFailure() })
        checkTrue((protocolRouted.element as? RefetchableUIElement) === routingWrapper)
        checkTrue(protocolRouted.accessibilityWindow is MenuUIElement)
        checkEqual(protocolRouted.pid, 7)
        checkEqual(protocolRouted.windowID, 42)
        targetMock.readPID = nil; targetMock.readActualPID = nil; targetMock.readWindowID = nil
        targetMock.testBundleIdentifier = nil
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
        enum MonitorUnavailable: Error { case expected }
        let cacheMonitor = UIElementTreeInvalidationMonitor(app: ApplicationUIElement(axElement: targetAX,
            cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)),
            processID: { _ in throw MonitorUnavailable.expected })
        let treeCache = TransformedUIElement.TreeCache(tree: UIElementTree(items: [], focusedElement: nil),
            transaction: prefetched, invalidationMonitor: cacheMonitor)
        checkTrue(treeCache.tree.items.isEmpty)
        checkTrue(treeCache.invalidationMonitor === cacheMonitor)
        // Reusing a cached tree must reuse its capture transaction too. The
        // normal element constructor consults it without another hierarchy read.
        treeCache.transaction.perform { root in
            checkEqual(UIElement(element: root.axElement).role, .button)
            checkEqual(UIElementTreeTransaction.current?.roleFrequencyTable[.button], 1)
            checkEqual(hierarchyCopies, 1)
        }
        checkTrue(UIElementTreeTransaction.current == nil)
        recordTreeInvalidation(.uiElementDestroyed, element: targetAX, state: cacheMonitor.state)
        checkTrue(treeCache.invalidationMonitor.invalidationStateSnapshot().destroyedElements.contains(targetAX))
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
    try requireUnlockedNativeDesktop(readSession: { [:] })
    try requireUnlockedNativeDesktop(readSession: { ["CGSSessionScreenIsLocked": false] })
    do {
        try requireUnlockedNativeDesktop(readSession: { ["CGSSessionScreenIsLocked": true] })
        unexpectedFailure()
    } catch let error as Failure {
        checkEqual(error.code, "SCREEN_LOCKED")
        checkEqual(SkyRPCFailure.hostFailure(code: error.code, message: error.message).code, -10020)
    }
    runObservedNodeLookupChecks()
    try await runNativeRefetchBindingChecks()
    try await runClickRoutingCursorChecks()
    try await runMouseDiagnosticBoundaryChecks()
    try runConcreteTreeRefetchResolutionChecks()
    try runConcreteElementRecoveryChecks()
    runRenderDifferenceIteratorSchedulingChecks()
    runRenderSiblingPrefixChecks()
    runRenderResidualIdentityMapChecks()
    runRenderResidualMatchChecks()
    runRenderRetentionPreflightChecks()
    runRenderRetentionSolverChecks()
    runDefaultRenderDifferenceChecks()
    runRenderDifferenceBufferChecks()
    runRenderDifferenceDepthOrderChecks()
    runOwningApplicationBundleResolutionChecks()
    runMenuBarProviderCompositionChecks()
    runSelectionScreenshotChecks()
    runImmediateMenuBarFilteringChecks()
    runFocusProviderCacheChecks()
    runFocusSelectionReadChecks()
    runFocusPositiveSelectionChecks()
    runFocusSelectionAttributeChecks()
    runRecursiveTreeBuildChecks()
    runPositionSubsetChecks()
    runPositionVisibilityChecks()
    runVisibleSubsetCompositionChecks()
    runVisibleRangeSelectionChecks()
    runVisibleRangeExpansionChecks()
    runVisibleIndexRangeChecks()
    runVisibleCollectionResolutionChecks()
    runCompleteCollectionChecks()
    runVisibleSubsetFallbackChecks()
    runMacProviderTitleTransactionChecks()
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
    runAppControllerAttentionChecks()
    runAppControllerWindowCreatedFocusChecks()
    runAppControllerWindowsCompositionChecks()
    runAppControllerAXEventHandlerChecks()
    await runDelayedAnimationRegistrationChecks()
    await runAnimationDriverHandlerOwnershipChecks()
    await runAnimationCoordinatorDriverCacheChecks()
    runAnimationTransactionStorageChecks()
    runSpringParameterConversionChecks()
    runVelocityVerletStiffnessChecks()
    runVelocityVerletDragChecks()
    runVelocityVerletConfigurationChecks()
    runVelocityVerletStateChecks()
    runVelocityVerletTimeChecks()
    runVelocityVerletHalfKickChecks()
    runVelocityVerletDriftChecks()
    runVelocityVerletIntegrationChecks()
    runSpringLogicalCompletionChecks()
    runVelocityVerletMotionThresholdChecks()
    runVelocityVerletIdleChecks()
    await runSpringAnimationOwnershipChecks()
    await runAnimationDescriptorFactoryChainChecks()
    await runCursorAnimationStorageResetChecks()
    await runCursorScootAnimationResetChecks()
    await runCursorScootResetFieldOrderChecks()
    await runCursorAppMonitorEventChecks()
    await runConcreteCursorPressChecks()
    await runCursorOrderOutChecks()
    await runAnimationTransactionExecutionChecks()
    await runAnimationCoordinatorRegistrationChecks()
    await runInterpolatableAnimationOwnershipChecks()
    await runBezierAnimationOwnershipChecks()
    runImmediateAnimationRegistrationChecks()
    await runAnimationDriverActivationChecks()
    runAnimationDriverFrameChecks()
    runBezierParameterResolutionChecks()
    runBezierKernelCompositionChecks()
    runBezierSolverChecks()
    runBezierPolynomialChecks()
    runBezierProjectionChecks()
    runAnimationInitialCaptureChecks()
    runAnimationTargetChangeChecks()
    try runCoreGraphicsRepresentationChecks()
    try runSIMDVectorRepresentationChecks()
    try runSIMDValueRoundTripChecks()
    runFloatingPointAlmostEqualChecks()
    runSIMD1StorageChecks()
    runFloatVectorLengthChecks()
    runDoubleVectorLengthChecks()
    await runAnimationDriverContractChecks()
    runInterpolatableAnimationValueChangeChecks()
    runInterpolatableAnimationFinishChecks()
    runInterpolatableAnimationTickChecks()
    runNativeAnimationProtocolCompositionChecks()
    runAnimationDriverStopAnimationsChecks()
    runAnimationDriverRemovalChecks()
    runAnimationTransactionCompletionChecks()
    runAnimationStateStopCompositionChecks()
    runInterpolatableAnimationStopChecks()
    runCursorWindowResetChecks()
    runCursorWindowOcclusionChecks()
    runCursorHotspotScreenPointChecks()
    runCursorMotionAngleChecks()
    runCursorCubicPathChecks()
    runCursorStraightPathChecks()
    runCursorPathSeedChecks()
    runCursorPathCandidateChecks()
    runCursorPathMetricChecks()
    runCursorPathScoreChecks()
    runCursorPathPlannerChecks()
    await runCursorProgressVelocityChecks()
    await runCursorProgressMotionFrameChecks()
    await runCursorProgressAnimationPreparationChecks()
    runCursorSpringResponseChecks()
    await runCursorProgressEventBindingChecks()
    await runCursorDrivenProgressChecks()
    await runCursorInitialMotionAngleChecks()
    await runCursorScootGeometryChecks()
    await runCursorScootPreparationChecks()
    await runCursorScootFinishChecks()
    runCursorScootAxisGeometryChecks()
    runCursorScootShapeTargetChecks()
    await runCursorScootStretchAnimationChecks()
    await runCursorScootTiltAnimationChecks()
    await runCursorScootAngleSpringChecks()
    await runCursorScootFrameChecks()
    await runCursorDrivenScootChecks()
    await runCursorMotionStartupChecks()
    await runHostedPetLocationChecks()
    await runCursorImmediateMoveChecks()
    runCursorMoveWindowHitTestChecks()
    runCursorMoveAnimationDecisionChecks()
    await runCursorAnimatedAppearanceChecks()
    await runCursorWindowMoveGeometryChecks()
    await runCursorWindowMoveChecks()
    await runCursorOwnerWindowMoveChecks()
    await runCursorOwnerMoveChecks()
    await runAppControllerVirtualCursorChecks()
    try await runElementCursorPositionPreparationChecks()
    try runUIElementScrollPlanChecks()
    runScrollVisibilityConditionChecks()
    runScrollBarPositionChecks()
    try runScrollBarValueWritingChecks()
    try runScrollBarPositionApplicationChecks()
    runScrollContentFrameChecks()
    try runScrollFrameAdjustmentChecks()
    try runAXNumberValueChecks()
    try await runScrollingClickablePointCompositionChecks()
    try await runElementPositionCompositionChecks()
    runApplicationWindowStorageChecks()
    try runSystemSelectionStorageChecks()
    runAXWindowDescriptionResolutionChecks()
    runAXWindowDescriptionFallbackChecks()
    runTreeInvalidationMonitorChecks()
    try runRefetchableElementResolutionChecks()
    runRefetchableElementMatchingChecks()
    try runRefetchableElementRecoveryChecks()
    try runRefetchableUIElementStorageChecks()
    runApplicationAXPrimaryWindowChecks()
    try runFocusedUIElementContextStorageChecks()
    try runApplicationFocusedContextChecks()
    runApplicationBundleWebShapeChecks()
    try runSelectionCaptureContextChecks()
    runNativeTransformationContextChecks()
    runSelectionExtractionFocusChecks()
    runUIElementSelectedRangesChecks()
    runUIElementTreeBuildTraversalChecks()
    runVisibleChildrenThresholdChecks()
    await runCursorPathBoundsChecks()
    runMovingCursorAssociationChecks()
    runCursorObservedStateChecks()
    runCursorBlurFilterResetChecks()
    await runCursorFadeInPhaseChecks()
    runLayerFilterPropertyChecks()
    runFilterMethodSelectorChecks()
    runCursorMotionAnimationResetChecks()
    runCursorWindowVisibilityChecks()
    runCursorCorrespondingWindowChecks()
    await runSoftwareCursorViewChecks()
    try await runVirtualCursorContractChecks()
    runUseSelectionForFindItemChecks()
    runCopyMenuItemChecks()
    try runAppControllerWindowObservationLifetimeChecks()
    try runAppControllerObservationDeliveryChecks()
    try await runTargetWindowObservationOwnershipChecks()
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
    func orderedWindow(id: UInt32, ownerPID: Int32, layer: Int32) -> CGWindow {
        CGWindow([kCGWindowNumber as String: id, kCGWindowOwnerPID as String: ownerPID,
            kCGWindowLayer as String: layer])
    }
    let windows = [orderedWindow(id: 1, ownerPID: 88, layer: 0),
                   orderedWindow(id: 2, ownerPID: 77, layer: 0)]
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
        windows: { [orderedWindow(id: 1, ownerPID: 88, layer: 1), windows[1]] },
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
    let protocolTarget: any UIElementProtocol = RefetchReconstructionProbe(
        element: AXUIElementCreateApplication(2147480021), reconstructed: false)
    var selectionEnvironment = UIElementActionEnvironment.system
    selectionEnvironment.supported = { _ in unexpectedFailure() }
    selectionEnvironment.settable = { _, _ in unexpectedFailure() }
    selectionEnvironment.read = { _, _ in unexpectedFailure() }
    checkFalse(protocolTarget.clickingMayCauseSelection(transaction: nil,
        environment: selectionEnvironment, reportError: { _ in unexpectedFailure() }))
    var protocolProbes = 0
    let protocolActive = try await (app as any UIElementProtocol).prepareSyntheticClickFocus(
        element: protocolTarget, insideWebView: false, clickingByCoordinate: false,
        hasHeldKey: false, window: nil, enforcer: nil,
        applicationIsActive: { protocolProbes += 1; return false },
        reportError: { _ in unexpectedFailure() }, send: { _ in unexpectedFailure() })
    checkFalse(protocolActive)
    try await (app as any UIElementProtocol).prepareAccessibilityClickFocus(
        element: protocolTarget, window: nil, enforcer: nil,
        probeApplicationIsActive: { protocolProbes += 1 },
        reportError: { _ in unexpectedFailure() }, send: { _ in unexpectedFailure() })
    checkEqual(protocolProbes, 2)
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
    // Exercise the concrete synchronous application wrapper without touching a
    // real application or the production MainActor singleton. An absent app
    // must exit before acquiring/releasing or reporting initialization.
    let missingApp = ApplicationUIElement(element: AXUIElementCreateApplication(2147480019))
    let tracker = AXEnablementAssertionTracker<NSRunningApplication>(
        reportFirstAcquisition: { _, _ in unexpectedFailure() },
        reportMissingRelease: { _ in unexpectedFailure() })
    let assertion = missingApp.enableAccessibilityIfNeeded(window: nil, for: .fullUIContext,
        tracker: tracker, reportError: { _ in unexpectedFailure() },
        reportInitialized: { _ in unexpectedFailure() }, reportRelease: { _ in unexpectedFailure() })
    checkTrue(assertion == nil)
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
    var owner: WindowOrderingObserver<Int, CGWindowEventStream<Int, Observer>.AsyncIterator, Int>? = .init(observedWindowIDs: [7],
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
        let menuBarItem = MenuBarItemUIElement(element: ax)
        precondition(CFEqual(window.axElement, ax) && CFEqual(sheet.axElement, ax) && CFEqual(menu.axElement, ax))
        precondition(window.cache.transactionAttributes == requested)
        precondition(sheet.cache.transactionAttributes == requested)
        precondition(menu.cache.transactionAttributes == requested)
        precondition(CFEqual(menuBarItem.axElement, ax) && menuBarItem.cache.transactionAttributes == requested)
        precondition(MenuBarItemUIElement.role == .menuBarItem)
        let slot = AppControllerMenuState<MenuUIElement, MenuBarItemUIElement>()
        slot.setFocusedMenuBarItem(menuBarItem)
        precondition(slot.focusedMenuBarItem?.id == ax)
        slot.menuDidClose(notifyOrdering: {}, removeWindows: {})
        precondition(slot.focusedMenuBarItem == nil)
        precondition(WindowUIElement.role == .window && SheetUIElement.role == .sheet && MenuUIElement.role == .menu)
    }
    precondition(UIElementTreeTransaction.current == nil)
    let first = AXUIElementCreateApplication(1)
    let second = AXUIElementCreateApplication(2)
    let item = AXUIElementCreateSystemWide()
    let children = UIElementAttribute(kAXChildrenAttribute)
    func partial(_ values: [AnyObject]) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: values as NSArray),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    for (roots, nested, expected) in [
        ([first, second], [item, item], 2),
        ([first, second], [], 0),
        ([], [item], 0)
    ] {
        let table: [AXUIElement: [UIElementAttribute: AXPartialValue]] = [
            ax: [children: partial(roots)], first: [children: partial(nested)],
            second: [children: partial([second])], item: [:]]
        let scope = UIElementTreeTransaction(element: root,
            cache: UIElementTransactionCache(attributeTable: table, requestedAttributes: [children],
                fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable<UIElementRole>())
        scope.perform { _ in
            let results = MenuBarItemUIElement(element: ax).menuItemsValue(reportError: { _ in preconditionFailure() })
            precondition(results.count == expected)
            precondition(results.allSatisfy { $0.id == item && $0.cache.transactionAttributes == [children] })
            precondition(MenuItemUIElement.role == .menuItem)
        }
    }
}

private func runUseSelectionForFindItemChecks() {
    let root = AXUIElementCreateApplication(getpid())
    let menu = AXUIElementCreateApplication(1)
    let first = AXUIElementCreateApplication(2)
    let second = AXUIElementCreateSystemWide()
    let children = UIElementAttribute(kAXChildrenAttribute)
    let title = UIElementAttribute(kAXTitleAttribute)
    func partial(_ raw: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    for (firstTitle, secondTitle, expected) in [
        ("Use Selection for Find", "Use Selection for Find", first as AXUIElement?),
        ("use selection for find", "Use Selection for Find", second as AXUIElement?),
        ("使用所选内容查找", "Other", nil)
    ] {
        let table: [AXUIElement: [UIElementAttribute: AXPartialValue]] = [
            root: [children: partial([menu] as NSArray)],
            menu: [children: partial([first, second] as NSArray)],
            first: [title: partial(firstTitle as NSString)],
            second: [title: partial(secondTitle as NSString)]]
        let scope = UIElementTreeTransaction(element: UIElement(element: root),
            cache: UIElementTransactionCache(attributeTable: table, requestedAttributes: [children, title],
                fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable<UIElementRole>())
        scope.perform { _ in
            precondition(MenuBarItemUIElement(element: root).useSelectionForFindItem?.id == expected)
        }
    }
}

private func runCopyMenuItemChecks() {
    struct Item { let id: Int; let char: String?; let modifiers: Int?; let title: String?; let children: [Item] }
    func find(_ items: [Item]) -> Int? {
        findCopyMenuItem(items, cmdChar: { $0.char }, cmdModifiers: { $0.modifiers },
            title: { $0.title }, children: { $0.children })?.id
    }
    let fallback = Item(id: 1, char: nil, modifiers: nil, title: "Copy", children: [])
    let shortcut = Item(id: 2, char: "C", modifiers: 0, title: "复制", children: [])
    precondition(find([fallback, shortcut]) == 2)
    precondition(find([shortcut, shortcut]) == 2)
    precondition(find([fallback]) == 1 && find([]) == nil)
    for (char, modifiers) in [("c", 0), ("C", 1), ("C", nil)] {
        precondition(find([Item(id: 3, char: char, modifiers: modifiers, title: nil, children: [])]) == nil)
    }
    let nonCopy = Item(id: 4, char: nil, modifiers: nil, title: "Other", children: [shortcut])
    precondition(find([nonCopy]) == nil)
    let nestedCopy = Item(id: 5, char: nil, modifiers: nil, title: "Copy", children: [shortcut])
    precondition(find([nestedCopy]) == 2)
    let deadCopy = Item(id: 6, char: nil, modifiers: nil, title: "Copy", children: [nonCopy])
    precondition(find([deadCopy, fallback]) == nil)
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

private func runAppControllerAttentionChecks() {
    enum Failed: Error { case pid }
    var calls: [String] = []
    clearAppControllerAttention(processID: { throw Failed.pid },
        getProcess: { _, _ in preconditionFailure() }, setAttention: { _, _ in preconditionFailure() })
    clearAppControllerAttention(processID: { calls.append("pid"); return 7 },
        getProcess: { pid, process in
            precondition(pid == 7 && process.pointee.highLongOfPSN == 0 && process.pointee.lowLongOfPSN == 0)
            calls.append("lookup"); return -1
        }, setAttention: { _, _ in preconditionFailure() })
    precondition(calls == ["pid", "lookup"])
    calls = []
    clearAppControllerAttention(processID: { calls.append("pid"); return 8 },
        getProcess: { _, process in process.pointee.lowLongOfPSN = 42; calls.append("lookup"); return 0 },
        setAttention: { process, attention in
            precondition(process.pointee.lowLongOfPSN == 42 && !attention)
            calls.append("clear"); return -1
        })
    precondition(calls == ["pid", "lookup", "clear"])
}

private func runAppControllerWindowCreatedFocusChecks() {
    enum Failed: Error { case subscription, pid }
    var calls: [String] = []
    prepareAppControllerWindowCreatedFocus(bundleIdentifier: "com.apple.controlcenter.extra",
        registerDestroyed: { preconditionFailure() }, actualPID: { preconditionFailure() },
        startSuppressingMenuDismissal: { _ in preconditionFailure() })
    prepareAppControllerWindowCreatedFocus(bundleIdentifier: "com.apple.controlcenter",
        registerDestroyed: { calls.append("register"); throw Failed.subscription },
        actualPID: { calls.append("pid"); return 7 }, startSuppressingMenuDismissal: {
            precondition($0 == 7); calls.append("suppress")
        })
    precondition(calls == ["register", "pid", "suppress"])
    calls = []
    prepareAppControllerWindowCreatedFocus(bundleIdentifier: "com.apple.controlcenter",
        registerDestroyed: nil, actualPID: { calls.append("pid"); throw Failed.pid },
        startSuppressingMenuDismissal: { precondition($0 == nil); calls.append("suppress") })
    precondition(calls == ["pid", "suppress"])
}

private func runAppControllerWindowsCompositionChecks() {
    struct Window: WindowUIElementProtocol {
        static var role: UIElementRole? { nil }
        let axElement: AXUIElement
        let cache: UIElementCache
        var rawWindowID: UInt32
        var windowID: UInt32
        init(element: AXUIElement) {
            axElement = element
            cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
            rawWindowID = 1; windowID = 1
        }
    }
    let firstAX = AXUIElementCreateApplication(7), otherAX = AXUIElementCreateApplication(8)
    var updates: [Set<UInt32>] = []
    var closeCalls = 0
    let context = AppControllerWindows<UIElement>(observedWindowIDsChanged: { updates.append(Set($0)) },
        menuDidOpen: { preconditionFailure() }, menuDidClose: { closeCalls += 1 })
    var first = Window(element: firstAX); first.rawWindowID = 10; first.windowID = 999
    var second = first; second.rawWindowID = 20
    var other = Window(element: otherAX); other.rawWindowID = 30; other.windowID = 999
    var invalid = other; invalid.windowID = 40; invalid.rawWindowID = 0
    context.register(first); context.register(second); context.register(other); context.register(invalid)
    precondition(updates.last == [0, 10, 20, 30])
    precondition(Set(context.windows().keys) == [10, 20, 30])
    precondition(updates.last == [10, 20, 30])
    updates = []
    context.menuState.setOpenedMenu(MenuUIElement(axElement: firstAX, cache: first.cache))
    context.closeMenu(firstAX)
    precondition(closeCalls == 1 && context.menuState.openedMenu == nil)
    precondition(updates.count == 2 && updates.last == [30])
    context.republishObservedWindowIDs()
    precondition(updates.last == [30])
    precondition(context.orderedWindows { [30, 30] }.count == 2)
}

private func runAppControllerAXEventHandlerChecks() {
    let ax = AXUIElementCreateApplication(getpid())
    var publications = 0, observerReads = 0, enforcerReads = 0, menuCloses = 0
    let windows = AppControllerWindows<UIElement>(observedWindowIDsChanged: { _ in publications += 1 },
        menuDidOpen: { preconditionFailure() }, menuDidClose: { menuCloses += 1 })
    let handler = AppControllerAXEventHandler(application: ax, bundleIdentifier: "owned-check",
        windows: windows, observer: { observerReads += 1; return nil },
        focusEnforcer: { enforcerReads += 1; return nil })
    handler.handle(.windowMoved, element: ax)
    handler.handle(.windowResized, element: ax)
    precondition(publications == 2 && observerReads == 0 && enforcerReads == 0)
    handler.handle(AXNotification("unknown"), element: ax)
    precondition(publications == 2 && observerReads == 0 && enforcerReads == 0)
    handler.handle(.uiElementDestroyed, element: ax)
    precondition(observerReads == 1 && enforcerReads == 1)
    handler.handle(.menuClosed, element: ax)
    precondition(menuCloses == 1 && enforcerReads == 2 && observerReads == 1)
}

private func runAppControllerWindowObservationLifetimeChecks() throws {
    let ax = AXUIElementCreateApplication(getpid())
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    // Real AX observer allocation only: no subscriptions, monitoring or UI input.
    let nativeObserver = try AXNotificationObserver(processID: getpid(), handler: { _ in })
    let event = AXNotificationObserver.NotificationEvent(observer: nativeObserver.axObserver,
        element: ax, notification: .menuClosed, info: [:])
    var callback: ((AXNotificationObserver.NotificationEvent) -> Void)?
    var calls: [String] = []
    var owner: AppControllerWindowObservation<UIElement>? = try AppControllerWindowObservation(
        application: ax, processID: getpid(), bundleIdentifier: "owned-check",
        focusEnforcer: { calls.append("focus"); return nil }, reportError: { _ in preconditionFailure() },
        initializeWindows: { windows in
            calls.append("seed")
            windows.menuState.setOpenedMenu(MenuUIElement(axElement: ax, cache: cache))
        }, makeObserver: { handler in
            calls.append("factory")
            callback = handler
            handler(event) // may arrive before windowObserver is assigned
            return nativeObserver
        })
    precondition(calls == ["seed", "factory", "focus"])
    precondition(owner?.windows.menuState.openedMenu == nil)
    weak var weakOwner = owner
    owner = nil
    precondition(weakOwner == nil)
    callback?(event)
    precondition(calls == ["seed", "factory", "focus"])
}

private func runAppControllerObservationDeliveryChecks() throws {
    enum Failed: Error { case construction }
    let ax = AXUIElementCreateApplication(getpid())
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let observer = try AXNotificationObserver(processID: getpid(), handler: { _ in })
    let event = AXNotificationObserver.NotificationEvent(observer: observer.axObserver,
        element: ax, notification: .menuClosed, info: [:])
    var retainedCallback: ((AXNotificationObserver.NotificationEvent) -> Void)?
    var queued: [() -> Void] = []
    var focusReads = 0
    var owner: AppControllerWindowObservation<UIElement>? = try AppControllerWindowObservation(
        application: ax, processID: getpid(), bundleIdentifier: "owned-check",
        focusEnforcer: { focusReads += 1; return nil }, reportError: { _ in preconditionFailure() },
        deliverEvent: { queued.append($0) }, initializeWindows: {
            $0.menuState.setOpenedMenu(MenuUIElement(axElement: ax, cache: cache))
        }, makeObserver: { callback in retainedCallback = callback; callback(event); return observer })
    precondition(queued.count == 1 && focusReads == 0 && owner?.windows.menuState.openedMenu != nil)
    queued.removeFirst()()
    precondition(focusReads == 1 && owner?.windows.menuState.openedMenu == nil)
    retainedCallback?(event)
    weak var weakOwner = owner
    owner = nil
    precondition(weakOwner == nil && queued.count == 1)
    queued.removeFirst()()
    precondition(focusReads == 1)
    weak var failedWindows: AppControllerWindows<UIElement>?
    do {
        let _: AppControllerWindowObservation<UIElement> = try AppControllerWindowObservation(
            application: ax, processID: getpid(), bundleIdentifier: "owned-check",
            focusEnforcer: { preconditionFailure() }, reportError: { _ in preconditionFailure() },
            initializeWindows: { failedWindows = $0 }, makeObserver: { callback in
                retainedCallback = callback; throw Failed.construction
            })
        preconditionFailure("Observer construction failure must escape")
    } catch Failed.construction {}
    precondition(failedWindows == nil)
    retainedCallback?(event)
}

@MainActor private func runTargetWindowObservationOwnershipChecks() throws {
    enum Failed: Error { case construction }
    var target: Target? = Target(.current)
    do {
        try target!.prepareWindowObservation(make: { throw Failed.construction })
        preconditionFailure()
    } catch Failed.construction {}
    precondition(target!.windowObservation == nil)
    let observer = try AXNotificationObserver(processID: getpid(), handler: { _ in })
    var owner: AppControllerWindowObservation<MenuBarItemUIElement>? = try AppControllerWindowObservation(
        application: target!.root, processID: getpid(), bundleIdentifier: "owned-check",
        focusEnforcer: { nil }, reportError: { _ in preconditionFailure() },
        initializeWindows: { _ in }, makeObserver: { _ in observer })
    weak var lifetime = owner
    var constructions = 0
    try target!.prepareWindowObservation(make: { constructions += 1; return owner! })
    owner = nil
    try target!.prepareWindowObservation(make: { preconditionFailure() })
    precondition(constructions == 1 && lifetime != nil && target!.windowObservation === lifetime)
    // No ordering activation/native subscriptions are started by this check.
    target!.deactivateAccessibility()
    target = nil
    precondition(lifetime == nil)
}


@MainActor private func runVirtualCursorContractChecks() async throws {
    enum Failed: Error { case press }
    final class Cursor: VirtualCursor {
        var isPressed = false
        var counts: [Int] = []
        var fails = false
        func press(count: Int) async throws {
            counts.append(count)
            if fails { throw Failed.press }
        }
    }
    let concrete = Cursor()
    let cursor: any VirtualCursor = concrete
    cursor.isPressed = true
    try await cursor.press()
    precondition(concrete.counts == [1] && cursor.isPressed)
    concrete.fails = true
    do { try await cursor.press(); preconditionFailure() }
    catch Failed.press {}
    precondition(concrete.counts == [1, 1] && cursor.isPressed)
}


@MainActor private func runSoftwareCursorViewChecks() {
    let style = SoftwareCursorStyle()
    precondition(style.hotSpot == CGPoint(x: 4, y: 4))
    precondition(style.isAttached && !style.isPressed && style.activityState == .idle)
    precondition(style.velocityX == 0 && style.velocityY == 0 && style.angle == .zero)
    precondition(style.scootStretchXScale == 1 && style.scootStretchScale == 1 && style.scootStretchPivotX == 0.5)
    precondition(style.scootStretchAngle == .zero && style.scootTiltAngle == .zero)
    let oldFactory = ComputerUseCursorStyle.current
    defer { ComputerUseCursorStyle.current = oldFactory }
    ComputerUseCursorStyle.current = { style }
    precondition(ComputerUseCursorStyle.current() === style)
    precondition(ComputerUseCursorStyle.software !== ComputerUseCursorStyle.software)
    let first = style.makeView()
    precondition(first === style.makeView())
    guard let imageView = first as? NSImageView, let image = imageView.image else { preconditionFailure() }
    precondition(image.size == NSSize(width: 20, height: 23))
    precondition(imageView.frame == NSRect(x: 0, y: 0, width: 20, height: 23))
    precondition(image.representations.contains { $0.pixelsWide == 200 && $0.pixelsHigh == 230 })
}


private func runCursorCorrespondingWindowChecks() {
    precondition(cursorCorrespondingWindowIsPresent(nil, windowNumbers: { preconditionFailure() }))
    precondition(!cursorCorrespondingWindowIsPresent(7, windowNumbers: { nil }))
    precondition(!cursorCorrespondingWindowIsPresent(7, windowNumbers: { [] }))
    precondition(!cursorCorrespondingWindowIsPresent(7, windowNumbers: { [6, 8] }))
    precondition(cursorCorrespondingWindowIsPresent(7, windowNumbers: { [6, 7, 8] }))
    precondition(cursorCorrespondingWindowIsPresent(0, windowNumbers: { [0] }))
    // Source compares NSNumber.unsignedIntValue, not signed NSNumber identity.
    precondition(cursorCorrespondingWindowIsPresent(UInt32.max, windowNumbers: { [-1] }))
}


private func runCursorWindowVisibilityChecks() {
    func check(wants: Bool, present: Bool = true, id: UInt32? = 7,
        reason0: Bool = false, reason1: Bool = false, visible: Bool = true,
        level: Int32? = 3, expected: [String]) {
        var events: [String] = []
        updateCursorWindowVisibility(wantsToBeVisible: { events.append("wants"); return wants },
            correspondingWindowIsPresent: { events.append("present"); return present },
            correspondingWindowID: { events.append("id"); return id },
            overlayLevelReason0: { events.append("reason0"); return reason0 },
            overlayLevelReason1: { events.append("reason1"); return reason1 },
            reset: { events.append("reset") }, isVisible: { events.append("visible"); return visible },
            orderOut: { events.append("out") }, orderFront: { events.append("front") },
            windowLevel: { precondition($0 == id); events.append("level"); return level },
            setLevel: { precondition($0 == level); events.append("set") },
            orderAbove: { precondition($0 == id); events.append("above") })
        precondition(events == expected)
    }
    check(wants: false, expected: ["wants", "reset", "visible", "out"])
    check(wants: true, present: false, visible: false, expected: ["wants", "present", "reset", "visible"])
    check(wants: true, id: nil, expected: ["wants", "present", "id", "front"])
    check(wants: true, reason0: true, expected: ["wants", "present", "id", "reason0", "front"])
    check(wants: true, reason1: true, expected: ["wants", "present", "id", "reason0", "reason1", "front"])
    check(wants: true, expected: ["wants", "present", "id", "reason0", "reason1", "level", "set", "above"])
    check(wants: true, level: nil, expected: ["wants", "present", "id", "reason0", "reason1", "level", "above"])
}


private func runCursorMotionAnimationResetChecks() {
    final class Mock { let state: AnimationState; init(_ state: AnimationState) { self.state = state } }
    for state in [AnimationState.ready, .retargeted, .running, .ended] {
        let original = Mock(state), replacement = Mock(.running)
        var progress: Mock? = original, position: Mock? = original
        var events: [String] = []
        resetCursorMotionAnimations(progress: { progress }, progressState: { $0.state },
            stopProgressImmediately: { precondition($0 === original); events.append("stop-progress") },
            clearProgress: { progress = nil; events.append("clear-progress") },
            position: { position }, clearPositionCallback: {
                precondition($0 === original)
                events.append("clear-callback")
                position = replacement
            }, positionState: { $0.state }, stopPositionImmediately: {
                precondition($0 === replacement)
                events.append("stop-position")
            }, clearPosition: { position = nil; events.append("clear-position") })
        let expected = (state == .ended ? [] : ["stop-progress"]) +
            ["clear-progress", "clear-callback", "stop-position", "clear-position"]
        precondition(events == expected && progress == nil && position == nil)
    }
    for positionValue: Mock? in [nil, Mock(.ended)] {
        var clears = 0
        resetCursorMotionAnimations(progress: { nil as Mock? }, progressState: { _ in preconditionFailure() },
            stopProgressImmediately: { _ in preconditionFailure() }, clearProgress: { clears += 1 },
            position: { positionValue }, clearPositionCallback: { precondition($0 === positionValue) },
            positionState: { $0.state }, stopPositionImmediately: { _ in preconditionFailure() },
            clearPosition: { clears += 1 })
        precondition(clears == 2)
    }
}


private func runCursorWindowResetChecks() {
    for persistent in [false, true] {
        for temporary in [false, true] {
            for wants in [false, true] {
                for present in [false, true] {
                    var reason = temporary
                    var events: [String] = []
                    func reset() {
                        resetCursorWindow(overlayReasons: { (persistent, reason) },
                            clearTemporaryOverlayReason: { reason = false; events.append("reason") },
                            setLevel: { precondition($0 == 0); events.append("level") },
                            resetMotionAnimations: { events.append("motion") },
                            resetScootAnimations: { events.append("scoot") },
                            clearNextInteractionHandler: { events.append("next") },
                            clearMotionCompletionHandler: { events.append("completion") },
                            clearTimingSatisfied: { events.append("timing") },
                            setVelocityX: { precondition($0 == 0); events.append("vx") },
                            setVelocityY: { precondition($0 == 0); events.append("vy") },
                            wantsToBeVisible: { events.append("wants"); return wants },
                            correspondingWindowIsPresent: { events.append("present"); return present },
                            updateVisibility: { events.append("visibility") })
                    }
                    reset()
                    let core = ["motion", "scoot", "next", "completion", "timing", "vx", "vy"]
                    var expected = ["reason"] + (!persistent && temporary ? ["level"] : []) + core
                    if temporary {
                        expected.append("wants")
                        if wants { expected.append("present"); if present { expected.append("visibility") } }
                    }
                    precondition(events == expected && !reason)
                    events = []; reset()
                    precondition(events == ["reason"] + core)
                }
            }
        }
    }
}


private func runInterpolatableAnimationStopChecks() {
    var events: [String] = []
    var callback: ((InterpolatableAnimationEvent<Int>) -> Void)? = { _ in preconditionFailure() }
    stopInterpolatableAnimation(immediately: true, setState: {
        precondition($0 == .ended); events.append("ended")
        callback = { event in
            guard case .finished(7) = event else { preconditionFailure() }
            events.append("finished")
        }
    }, handler: { events.append("handler"); return callback },
        value: { events.append("value"); return 7 }, retarget: { _ in preconditionFailure() })
    precondition(events == ["ended", "handler", "value", "finished"])
    stopInterpolatableAnimation(immediately: true, setState: { precondition($0 == .ended) },
        handler: { nil as ((InterpolatableAnimationEvent<Int>) -> Void)? },
        value: { preconditionFailure() }, retarget: { _ in preconditionFailure() })
    events = []
    stopInterpolatableAnimation(immediately: false, setState: { _ in preconditionFailure() },
        handler: { preconditionFailure() }, value: { events.append("value"); return 9 },
        retarget: { precondition($0 == 9); events.append("retarget") })
    precondition(events == ["value", "retarget"])
}


private func runAnimationStateStopCompositionChecks() {
    var state: AnimationState = .running
    var events: [String] = []
    func stop() {
        stopInterpolatableAnimation(immediately: true, setState: { requested in
            setInterpolatableAnimationState(requested, read: { state }, write: {
                state = $0; events.append("write")
            }, notifyCoordinator: {
                precondition($0 == .ended && state == .ended)
                events.append("coordinator")
            })
        }, handler: { { (event: InterpolatableAnimationEvent<Int>) in
            guard case .finished(3) = event else { preconditionFailure() }
            precondition(state == .ended)
            events.append("finished")
        } }, value: { 3 }, retarget: { _ in preconditionFailure() })
    }
    stop(); stop()
    precondition(events == ["write", "coordinator", "finished", "write", "finished"])
    events = []
    for next in [AnimationState.ready, .retargeted, .running] {
        setInterpolatableAnimationState(next, read: { state }, write: { state = $0 },
            notifyCoordinator: { precondition($0 == next && state == next); events.append("notify") })
    }
    precondition(events == ["notify", "notify", "notify"])
}


private func runAnimationTransactionCompletionChecks() {
    let animation = UUID(), transaction = UUID()
    for state in [AnimationState.ready, .retargeted, .running, .ended] {
        var events: [String] = []
        var handlers: [UUID: (AnimationState) -> Void] = [:]
        handlers[transaction] = { value in
            precondition(value == state)
            events.append("callback")
            // A reentrant replacement is also removed by terminal cleanup.
            handlers[transaction] = { _ in preconditionFailure() }
        }
        notifyAnimationTransactionCompletion(animationID: animation, state: state,
            transactionID: { precondition($0 == animation); events.append("transaction"); return transaction },
            completion: { events.append("lookup"); return handlers[$0] },
            removeCompletion: { events.append("remove"); handlers.removeValue(forKey: $0) })
        let terminal = state == .retargeted || state == .ended
        precondition(events == ["transaction", "lookup", "callback"] + (terminal ? ["remove"] : []))
        precondition((handlers[transaction] == nil) == terminal)
    }
    notifyAnimationTransactionCompletion(animationID: animation, state: .ended,
        transactionID: { _ in nil }, completion: { _ in preconditionFailure() },
        removeCompletion: { _ in preconditionFailure() })
    notifyAnimationTransactionCompletion(animationID: animation, state: .ended,
        transactionID: { _ in transaction }, completion: { _ in nil },
        removeCompletion: { _ in preconditionFailure() })
}


private func runAnimationDriverRemovalChecks() {
    final class Source {}
    final class Handler { let name: String; let released: (String) -> Void
        init(_ name: String, released: @escaping (String) -> Void) { self.name = name; self.released = released }
        deinit { released(name) }
    }
    let source = Source(), otherSource = Source()
    var events: [String] = []
    let id = ObjectIdentifier(source)
    var registry = [id: Handler("old", released: { events.append($0) })]
    removeAnimationDriver(source: otherSource, lookup: { registry[$0] },
        stopAnimations: { _ in preconditionFailure() }, remove: { _ in preconditionFailure() })
    removeAnimationDriver(source: source, lookup: { registry[$0] }, stopAnimations: { handler in
        precondition(registry[id] === handler)
        events.append("invalidate")
        registry[id] = Handler("replacement", released: { events.append($0) })
    }, remove: { key in events.append("remove"); return registry.removeValue(forKey: key) })
    precondition(registry.isEmpty)
    precondition(events == ["invalidate", "remove", "old", "replacement"])
}


private func runAnimationDriverStopAnimationsChecks() {
    let a = UUID(), b = UUID(), c = UUID()
    var animations = [a: 1, b: 2]
    var events: [String] = []
    stopAnimationDriverAnimations(keys: { [a, b] }, lookup: { animations[$0] },
        stopImmediately: { value in
            events.append("stop-\(value)")
            if value == 1 { animations[a] = 9; animations[c] = 3 }
        }, remove: { key in events.append("remove"); return animations.removeValue(forKey: key) })
    precondition(events == ["stop-1", "remove", "stop-2", "remove"])
    precondition(animations == [c: 3])
    animations = [a: 1, b: 2, c: 3]; events = []
    stopAnimationDriverAnimations(keys: { [a, b, c] }, lookup: { animations[$0] },
        stopImmediately: { value in events.append("stop-\(value)"); animations.removeValue(forKey: b) },
        remove: { animations.removeValue(forKey: $0) })
    precondition(events == ["stop-1"] && animations == [c: 3])
}


private func runNativeAnimationProtocolCompositionChecks() {
    final class Mock: Animation {
        let id = UUID()
        var state: AnimationState = .running
        var startTime: Double? = 10
        var currentValue = 0.0
        var ticks: [AnimationUpdate] = []
        var stopped: [Bool] = []
        func stop(immediately: Bool) { stopped.append(immediately); state = .ended }
        func reset() {
            resetInterpolatableAnimation(clearStartTime: { startTime = nil }, setState: { requested in
                setInterpolatableAnimationState(requested, read: { state }, write: { state = $0 },
                    notifyCoordinator: { precondition($0 == .ready && startTime == nil) })
            })
        }
        func performTick(with update: AnimationUpdate) {
            performInterpolatableAnimationTick(with: update, state: { state },
                initialize: { startTime = $0 }, setState: { state = $0 },
                interpolate: { ticks.append($0); return 1.0 }, applyValue: { value in
                    changeInterpolatableAnimationValue(readValue: { currentValue }, mutate: { currentValue = value }, handler: { nil })
                },
                finish: { preconditionFailure() })
        }
    }
    let concrete = Mock()
    let animation: any Animation = concrete
    let update = AnimationUpdate(timestamp: 10, duration: 0.25)
    precondition(update.targetTimestamp == 10.25 && update.targetRunningTime(from: 11) == -0.75)
    precondition(update.targetRunningTime(from: nil) == nil)
    animation.performTick(with: update); animation.stop(); animation.reset()
    precondition(concrete.ticks == [update] && concrete.stopped == [true] && animation.state == .ready && concrete.startTime == nil && concrete.currentValue == 1)
    var records: [UUID: any Animation] = [animation.id: animation]
    stopAnimationDriverAnimations(keys: { [animation.id] }, lookup: { records[$0] },
        remove: { records.removeValue(forKey: $0) })
    precondition(records.isEmpty && concrete.stopped == [true, true] && animation.state == .ended)
}


private func runInterpolatableAnimationTickChecks() {
    let update = AnimationUpdate(timestamp: 10, duration: 0.1, targetTimestamp: 10.3)
    for initial in [AnimationState.ready, .retargeted, .running, .ended] {
        for sample: Double? in [nil, 7] {
            var current = initial
            var events: [String] = []
            performInterpolatableAnimationTick(with: update, state: { current }, initialize: {
                precondition($0 == 10); events.append("initialize")
            }, setState: { current = $0; events.append("state") }, interpolate: {
                precondition(current == .running && $0 == update)
                events.append("interpolate"); return sample
            }, applyValue: { precondition($0 == 7); events.append("value") },
                finish: { events.append("finish") })
            let expected = (initial == .running ? [] : ["initialize"]) +
                ["state", "interpolate", sample == nil ? "finish" : "value"]
            precondition(events == expected)
        }
    }
}


private func runInterpolatableAnimationFinishChecks() {
    var state: AnimationState = .running
    var target = 7
    var events: [String] = []
    var callback: ((InterpolatableAnimationEvent<Int>) -> Void)? = { _ in preconditionFailure() }
    finishInterpolatableAnimation(applyTarget: {
        events.append("apply-target")
        target = 8
        callback = { event in
            guard case .finished(8) = event else { preconditionFailure() }
            precondition(state == .running)
            events.append("finished")
        }
    }, handler: { events.append("handler"); return callback },
        targetValue: { events.append("target"); return target },
        setState: { state = $0; events.append("ended") })
    precondition(events == ["apply-target", "handler", "target", "finished", "ended"] && state == .ended)
    finishInterpolatableAnimation(applyTarget: {},
        handler: { nil as ((InterpolatableAnimationEvent<Int>) -> Void)? },
        targetValue: { preconditionFailure() }, setState: { precondition($0 == .ended) })
}


private func runInterpolatableAnimationValueChangeChecks() {
    final class Trace { var events: [String] = [] }
    struct Value: Equatable {
        let number: Int; let trace: Trace
        static func == (a: Self, b: Self) -> Bool { a.trace.events.append("equal-\(a.number)-\(b.number)"); return a.number == b.number }
    }
    let trace = Trace()
    var value = Value(number: 1, trace: trace)
    var callback: ((InterpolatableAnimationEvent<Value>) -> Void)? = { _ in preconditionFailure() }
    changeInterpolatableAnimationValue(readValue: { trace.events.append("read"); return value }, mutate: {
        trace.events.append("mutate"); value = Value(number: 2, trace: trace)
        callback = { event in
            guard case let .valueChanged(oldValue: old, newValue: new) = event else { preconditionFailure() }
            precondition(old.number == 1 && new.number == 2 && value.number == 2)
            trace.events.append("callback")
        }
    }, handler: { trace.events.append("handler"); return callback })
    precondition(trace.events == ["read", "mutate", "read", "handler", "equal-2-1", "callback"])
    trace.events = []
    changeInterpolatableAnimationValue(readValue: { trace.events.append("read"); return value },
        mutate: { trace.events.append("mutate") }, handler: { nil })
    precondition(trace.events == ["read", "mutate", "read"])
    trace.events = []
    changeInterpolatableAnimationValue(readValue: { value }, mutate: {}, handler: { { _ in preconditionFailure() } })
    precondition(trace.events == ["equal-2-2"])
}


@MainActor private func runAnimationDriverContractChecks() {
    final class Source: AnimationDriverSource {
        func makeAnimationDriver() -> AnimationDriver { AnimationDriver() }
    }
    @MainActor final class Counter { var updates: [AnimationUpdate] = [] }
    let source: any AnimationDriverSource = Source()
    let driver = source.makeAnimationDriver(), other = source.makeAnimationDriver()
    precondition(driver !== other && driver.frameCallback == nil && !driver.isActive)
    driver.start(); driver.stop()
    precondition(!driver.isActive)
    let counter = Counter()
    driver.frameCallback = { counter.updates.append($0) }
    let update = AnimationUpdate(timestamp: 2, duration: 0.25)
    driver.frameCallback?(update)
    precondition(counter.updates == [update])
    driver.isActive = true; driver.stop()
    precondition(driver.isActive)
    driver.frameCallback = nil
}


private func runDoubleVectorLengthChecks() {
    precondition(Double.length(SIMD2(3.0, 4.0)) == 5)
    precondition(Double.lengthSquared(SIMD3(2.0, 3.0, 6.0)) == 49)
    precondition(Double.length(SIMD4(1.0, 2.0, 2.0, 4.0)) == 5)
    let eight = SIMD8<Double>(1, 2, 3, 4, 5, 6, 7, 8)
    precondition(Double.lengthSquared(eight) == 204)
    precondition(Double.length(eight) == Double(204).squareRoot())
    // Native is a squared-vector reduction, not overflow-safe hypot.
    precondition(Double.length(SIMD2(Double.greatestFiniteMagnitude, 0)).isInfinite)
    precondition(Double.lengthSquared(SIMD4<Double>(.nan, 0, 0, 0)).isNaN)
    precondition(Double.length(SIMD8<Double>(repeating: 0)) == 0)
    precondition(Double.lengthSquared(SIMD16<Double>(repeating: 1)) == 16)
    precondition(Double.length(SIMD32<Double>(repeating: 1)) == Double(Float16(32).squareRoot()))
    var narrow16 = SIMD16<Double>(repeating: 0)
    narrow16[0] = 1e30
    precondition(Double.lengthSquared(narrow16).isInfinite)
    var narrow32 = SIMD32<Double>(repeating: 0)
    narrow32[0] = 1000
    precondition(Double.lengthSquared(narrow32).isInfinite)
    narrow32[0] = 1; narrow32[1] = 1
    precondition(Double.length(narrow32) == 1.4140625) // sqrt rounded in half before widening
    narrow32[0] = .nan
    precondition(Double.lengthSquared(narrow32).isNaN)

}


private func runFloatVectorLengthChecks() {
    precondition(Float.length(SIMD2<Float>(3, 4)) == 5)
    precondition(Float.lengthSquared(SIMD3<Float>(2, 3, 6)) == 49)
    precondition(Float.length(SIMD4<Float>(1, 2, 2, 4)) == 5)
    precondition(Float.lengthSquared(SIMD8<Float>(1, 2, 3, 4, 5, 6, 7, 8)) == 204)
    precondition(Float.length(SIMD16<Float>(repeating: 1)) == 4)
    var half = SIMD32<Float>(repeating: 0)
    half[0] = 1000
    precondition(Float.lengthSquared(half).isInfinite)
    half[0] = 1; half[1] = 1
    precondition(Float.length(half) == 1.4140625)
    half[0] = .nan
    precondition(Float.lengthSquared(half).isNaN)
    precondition(Float.length(SIMD2<Float>(.greatestFiniteMagnitude, 0)).isInfinite)
}


private func runSIMD1StorageChecks() {
    var value = SIMD1<Double>(3)
    precondition(value.scalarCount == 1 && value.storage.scalarCount == 2)
    precondition(value[0] == 3 && value.storage[1] == 0)
    value[0] += 2
    precondition(value[0] == 5)
    // Native delegates subscript to two-lane storage; preserve the second lane.
    value[1] = 99
    precondition(value.storage[1] == 99)
    let sameLogicalValue = SIMD1<Double>(5)
    precondition(value == sameLogicalValue)
    var copy = value
    copy.storage[0] = 8
    precondition(value[0] == 5 && copy[0] == 8)
    precondition(Array(value.indices) == [0])
    precondition(SIMD1<Int32>()[0] == 0)
    precondition(SIMD1<Float>(repeating: 7)[0] == 7)
}


private func runFloatingPointAlmostEqualChecks() {
    precondition(1.0.isAlmostEqual(to: 1.001, tolerance: 0.01))
    precondition(!1.0.isAlmostEqual(to: 2, tolerance: 0.5)) // strict boundary
    precondition(!1.0.isAlmostEqual(to: 1, tolerance: 0))
    precondition(Double.infinity.isAlmostEqual(to: .infinity, tolerance: 0))
    precondition(!Double.infinity.isAlmostEqual(to: -.infinity, tolerance: 1))
    precondition(!Double.nan.isAlmostEqual(to: .nan, tolerance: 1))
    precondition(Double.infinity.isAlmostEqual(to: .greatestFiniteMagnitude, tolerance: 0.01))
    precondition(Double.greatestFiniteMagnitude.isAlmostEqual(to: .infinity, tolerance: 0.01))
    precondition(!Double.infinity.isAlmostEqual(to: 0, tolerance: 0.01))
    precondition(Double.leastNonzeroMagnitude.isAlmostEqual(to: 0, tolerance: 0.01))
    precondition(!Float(1).isAlmostEqual(to: 1, tolerance: .nan))
    precondition(Float16(1).isAlmostEqual(to: 1, tolerance: 0.01))
}


private func runSIMDValueRoundTripChecks() throws {
    var value = SIMDValue<Double>(wrappedValue: 3)
    precondition(value.projectedValue[0] == 3)
    value.projectedValue[0] += 4
    precondition(value.wrappedValue == 7)
    value.wrappedValue += 2
    precondition(value.projectedValue[0] == 9)
    precondition(SIMDValue<Double>().wrappedValue == 0)
    precondition(value > SIMDValue<Double>(wrappedValue: 8))
    let bytes = try JSONEncoder().encode(value)
    precondition(String(decoding: bytes, as: UTF8.self) == "9")
    let decoded = try JSONDecoder().decode(SIMDValue<Double>.self, from: bytes)
    precondition(decoded == value)
    do {
        _ = try JSONDecoder().decode(SIMDValue<Double>.self, from: Data("{}".utf8))
        preconditionFailure("SIMDValue accepted a keyed object for Double")
    } catch is DecodingError { }
    struct Normalized: SIMDRepresentable {
        typealias SIMDType = SIMD1<Double>
        var number: Double
        init(_ representation: SIMDType) { number = representation[0].magnitude }
        func simdRepresentation() -> SIMDType { SIMDType(number) }
        static var zero: Self { Self(SIMDType(0)) }
    }
    let left = SIMDValue<Normalized>(simdValue: SIMD1(-2.0))
    let right = SIMDValue<Normalized>(simdValue: SIMD1(2.0))
    precondition(left.projectedValue != right.projectedValue)
    precondition(left == right) // Compare reconstructed Value, not vector storage.
    let scalar = SIMD1<Double>(-3)
    precondition(scalar.magnitude() == 3 && scalar.magnitudeSquared() == 9)
    precondition(SIMD1<Double>(1).isAlmostEqual(to: SIMD1(2), tolerance: 1))
    precondition(!(SIMD1<Double>(1) < SIMD1(1)))
    precondition(Float(3).simdRepresentation()[0] == 3)
}


private func runSIMDVectorRepresentationChecks() throws {
    precondition(SIMD2<Double>(3, 4).magnitude() == 5)
    precondition(SIMD3<Float>(2, 3, 6).magnitudeSquared() == 49)
    precondition(SIMD4<Double>(1, 2, 2, 4).magnitude() == 5)
    precondition(SIMD8<Float>(repeating: 1).magnitudeSquared() == 8)
    precondition(SIMD16<Double>(repeating: 1).magnitude() == 4)
    precondition(SIMD32<Float>(repeating: 1).magnitudeSquared() == 32)
    precondition(SIMD2<Double>(1, 2) < SIMD2(2, 3))
    precondition(!(SIMD2<Double>(1, 3) < SIMD2(2, 2)))
    precondition(!(SIMD2<Double>(1, 2) < SIMD2(1, 3)))
    precondition(SIMD2<Double>(1, 2).isAlmostEqual(to: SIMD2(2, 3), tolerance: 1))
    // Whole-vector max chooses one delta; preserve source's asymmetric mixed-sign result.
    precondition(!SIMD2<Double>(1, -100).isAlmostEqual(to: .zero, tolerance: 1))
    precondition(SIMD2<Double>(-1, 100).isAlmostEqual(to: .zero, tolerance: 1))
    precondition(!SIMD2<Double>(.infinity, 0).isAlmostEqual(to: SIMD2(.infinity, 0), tolerance: 1))
    var wrapped = SIMDValue<SIMD2<Double>>(wrappedValue: SIMD2(1, 2))
    wrapped.projectedValue[1] = 4
    precondition(wrapped.wrappedValue == SIMD2(1, 4))
    let encoded = try JSONEncoder().encode(wrapped)
    let decoded = try JSONDecoder().decode(SIMDValue<SIMD2<Double>>.self, from: encoded)
    precondition(decoded == wrapped)
}


private func runCoreGraphicsRepresentationChecks() throws {
    precondition(CGFloat(-3).simdRepresentation()[0] == -3)
    precondition(CGFloat(SIMD1<Double>(4)) == 4)
    let point = CGPoint(x: -7, y: 11)
    precondition(CGPoint(point.simdRepresentation()) == point)
    let size = CGSize(width: -3, height: 8)
    precondition(CGSize(size.simdRepresentation()) == size)
    let rect = CGRect(x: -1, y: 2, width: -3, height: 4)
    let lanes = rect.simdRepresentation()
    precondition(lanes == SIMD4(-1.0, 2, -3, 4))
    precondition(CGRect(lanes) == rect)
    var wrapped = SIMDValue<CGPoint>(wrappedValue: point)
    wrapped.projectedValue[0] += 2
    precondition(wrapped.wrappedValue == CGPoint(x: -5, y: 11))
    let encoded = try JSONEncoder().encode(wrapped)
    let decoded = try JSONDecoder().decode(SIMDValue<CGPoint>.self, from: encoded)
    precondition(decoded == wrapped)
    precondition(CGPoint(x: 1000, y: 2000).isAlmostEqual(to: CGPoint(x: 1001, y: 2001), tolerance: 0.01))
    precondition(!CGPoint(x: 1, y: 1).isAlmostEqual(to: CGPoint(x: 1, y: 1), tolerance: 0))
    precondition(CGPoint(x: CGFloat.infinity, y: 1).isAlmostEqual(to: CGPoint(x: CGFloat.infinity, y: 1), tolerance: 0.01))
}


private func runAnimationTargetChangeChecks() {
    for initial in [AnimationState.ready, .retargeted, .running, .ended] {
        var target = SIMDValue<CGPoint>(wrappedValue: CGPoint(x: 1, y: 2))
        var current = initial
        var events: [String] = []
        changeInterpolatableAnimationTarget(readTarget: { events.append("read"); return target.wrappedValue },
            mutate: { events.append("write"); target.wrappedValue = CGPoint(x: 3, y: 4) },
            state: { current }, setState: { current = $0; events.append("state") },
            handler: { events.append("handler"); return { event in
                guard case let .retargeted(from, to) = event else { preconditionFailure() }
                precondition(from == CGPoint(x: 1, y: 2) && to == CGPoint(x: 3, y: 4))
                events.append("event")
            } })
        if initial == .running {
            precondition(current == .retargeted)
            precondition(events == ["read", "write", "read", "state", "handler", "read", "event"])
        } else { precondition(events == ["read", "write"] && current == initial) }
    }
    var target = 1
    var current = AnimationState.running
    var called = false
    changeInterpolatableAnimationTarget(readTarget: { target }, mutate: { target = 2 },
        state: { current }, setState: { current = $0; target = 3 },
        handler: { { event in
            guard case let .retargeted(from, to) = event else { preconditionFailure() }
            precondition(from == 1 && to == 3); called = true
        } })
    precondition(called)
    changeInterpolatableAnimationTarget(readTarget: { 1 }, mutate: {}, state: { .running },
        setState: { _ in preconditionFailure("Unchanged target retargeted") },
        handler: { preconditionFailure("Unchanged target read handler") })
}


private func runAnimationInitialCaptureChecks() {
    var current = SIMDValue<CGPoint>(wrappedValue: CGPoint(x: 3, y: 4))
    var initial = SIMDValue<CGPoint>()
    var start: Double?
    var state = AnimationState.ready
    var events: [String] = []
    func tick(_ timestamp: Double) {
        performInterpolatableAnimationTick(with: AnimationUpdate(timestamp: timestamp, duration: 1),
            state: { state }, initialize: { time in
                startInterpolatableAnimation(at: time,
                    setStartTime: { start = $0; events.append("time") },
                    currentValue: { precondition(start == time); events.append("read"); return current.wrappedValue },
                    setInitialValue: { initial.wrappedValue = $0; events.append("initial") })
            }, setState: { state = $0; events.append("state") },
            interpolate: { _ -> SIMD2<Double>? in current.projectedValue },
            applyValue: { current.projectedValue = $0 }, finish: { preconditionFailure() })
    }
    tick(5)
    precondition(start == 5 && initial.wrappedValue == CGPoint(x: 3, y: 4))
    current.wrappedValue = CGPoint(x: 8, y: 9)
    tick(6)
    precondition(start == 5 && initial.wrappedValue == CGPoint(x: 3, y: 4))
    state = .retargeted
    tick(7)
    precondition(start == 7 && initial.wrappedValue == CGPoint(x: 8, y: 9))
    precondition(events == ["time", "read", "initial", "state", "state", "time", "read", "initial", "state"])
}


private func runBezierProjectionChecks() {
    precondition(bezierAnimationProgress(targetTimestamp: 5, startTime: 5, duration: 2) == 0)
    precondition(bezierAnimationProgress(targetTimestamp: 6, startTime: 5, duration: 2) == 0.5)
    precondition(bezierAnimationProgress(targetTimestamp: 7, startTime: 5, duration: 2) == 1)
    precondition(bezierAnimationProgress(targetTimestamp: 8, startTime: 5, duration: 2) == nil)
    precondition(bezierAnimationProgress(targetTimestamp: 4, startTime: 5, duration: 2) == nil)
    precondition(bezierAnimationProgress(targetTimestamp: 6, startTime: nil, duration: 2) == nil)
    precondition(bezierAnimationProgress(targetTimestamp: .nan, startTime: 5, duration: 2) == nil)
    precondition(bezierAnimationProgress(targetTimestamp: .infinity, startTime: 5, duration: .infinity) == 0)
    let result = projectBezierAnimationValue(initial: CGPoint(x: -10, y: 4).simdRepresentation(),
        target: CGPoint(x: 10, y: 12).simdRepresentation(), factor: 0.25)
    precondition(CGPoint(result) == CGPoint(x: -5, y: 6))
    let scalar = projectBezierAnimationValue(initial: SIMD1<Float>(2), target: SIMD1<Float>(6), factor: 0.5)
    precondition(scalar[0] == 4)
    let overflow = projectBezierAnimationValue(initial: SIMD1<Double>(-.greatestFiniteMagnitude),
        target: SIMD1<Double>(.greatestFiniteMagnitude), factor: 0)
    precondition(overflow[0].isNaN) // Preserve subtract/multiply/add, no endpoint shortcut.
}


private func runBezierPolynomialChecks() {
    let curve = BezierFunction<Double>(x1: 0.25, y1: -1, x2: 0.75, y2: 2)
    precondition(curve.x1 == 0.25 && curve.x2 == 0.75 && curve.y1 == -1 && curve.y2 == 2)
    for t in [0.0, 0.25, 0.5, 0.75, 1, 1.5, -0.5] {
        let u = 1 - t
        let expectedX = 3 * u * u * t * 0.25 + 3 * u * t * t * 0.75 + t * t * t
        let expectedY = -3 * u * u * t + 6 * u * t * t + t * t * t
        precondition(abs(curve.evaluateCurveX(t: t) - expectedX) < 1e-12)
        precondition(abs(curve.evaluateCurveY(t: t) - expectedY) < 1e-12)
    }
    let linear = BezierFunction<Float>(x1: 0, y1: 0, x2: 1, y2: 1)
    precondition(linear.evaluateCurveX(t: 0.5) == 0.5)
    precondition(linear.evaluateCurveX(t: .nan).isNaN)
}


private func runBezierSolverChecks() {
    let curve = BezierFunction<Double>(x1: 0.25, y1: 0.1, x2: 0.25, y2: 1)
    for x in [0.0, 0.001, 0.1, 0.5, 0.9, 0.999, 1] {
        let t = curve.solveForT(x: x, epsilon: 1e-8)
        precondition(abs(curve.evaluateCurveX(t: t) - x) < 1e-8)
        let ty = curve.solveForT(y: x, epsilon: 1e-8)
        precondition(abs(curve.evaluateCurveY(t: ty) - x) < 1e-8)
    }
    // x=t^3, near zero: derivative threshold forces the native bisection path.
    let flat = BezierFunction<Double>(x1: 0, y1: 0, x2: 0, y2: 1)
    let t = flat.solveForT(x: 1e-7, epsilon: 1e-12)
    precondition(abs(t - pow(1e-7, 1.0 / 3)) < 1e-7)
    let float = BezierFunction<Float>(x1: 0.25, y1: 0.1, x2: 0.75, y2: 1)
    let tf = float.solveForT(x: 0.3, epsilon: 1e-5)
    precondition(abs(float.evaluateCurveX(t: tf) - 0.3) < 1e-5)
}


private func runBezierKernelCompositionChecks() {
    let ease = BezierFunction<Double>.easeIn
    precondition(ease.x1 == 0.42 && ease.y1 == 0 && ease.x2 == 1 && ease.y2 == 1)
    precondition(abs(ease.solve(x: 0.5, epsilon: 1e-8) - 0.3153568126) < 1e-8)
    let y = ease.solve(x: 0.3, epsilon: 1e-8)
    precondition(abs(ease.solve(y: y, epsilon: 1e-8) - 0.3) < 1e-6)
    let initial = CGPoint(x: 10, y: 20).simdRepresentation()
    let target = CGPoint(x: 110, y: 220).simdRepresentation()
    var previousX = -Double.infinity
    for step in 0...20 {
        let update = AnimationUpdate(timestamp: -999, duration: 0, targetTimestamp: Double(step) / 10)
        let result = interpolateBezierAnimationValue(with: update, startTime: 0, duration: 2,
            curve: BezierFunction<Double>.easeInOut, initial: initial, target: target)!
        precondition(result[0] >= previousX); previousX = result[0]
        if step == 0 { precondition(result == initial) }
        if step == 20 { precondition(result == target) }
    }
    let past = AnimationUpdate(timestamp: 0, duration: 0, targetTimestamp: 2.1)
    precondition(interpolateBezierAnimationValue(with: past, startTime: 0, duration: 2,
        curve: BezierFunction<Double>.linear, initial: initial, target: target) == nil)
}


private func runBezierParameterResolutionChecks() {
    let custom = BezierFunction<Double>(x1: 0.123456789, y1: -0.345678912,
        x2: 0.987654321, y2: 1.23456789)
    let parameters = BezierParameters(curve: custom, duration: 0.75)
    let resolved = resolveBezierAnimationParameters(parameters, as: Float.self)
    let expected = BezierFunction<Float>(x1: Float(custom.x1), y1: Float(custom.y1),
        x2: Float(custom.x2), y2: Float(custom.y2))
    precondition(resolved.curve == expected && resolved.duration == 0.75)
    let curves: [BezierParameters.Curve] = [.linear, .easeIn, .easeOut, .easeInOut]
    for curve in curves {
        let output = resolveBezierAnimationParameters(BezierParameters(curve, duration: 2), as: Double.self)
        let initial = SIMD1<Double>(0), target = SIMD1<Double>(100)
        let update = AnimationUpdate(timestamp: 0, duration: 0, targetTimestamp: 1)
        let value = interpolateBezierAnimationValue(with: update, startTime: 0,
            duration: output.duration, curve: output.curve, initial: initial, target: target)!
        precondition(value[0] >= 0 && value[0] <= 100)
        if curve == .linear { precondition(abs(value[0] - 50) < 0.001) }
    }
    let negative = resolveBezierAnimationParameters(BezierParameters(.linear, duration: -1), as: Double.self)
    precondition(negative.duration == -1) // Validation stays in the kernel.
}


private func runAnimationDriverFrameChecks() {
    final class Item: Animation {
        let id: UUID
        var state: AnimationState
        var tick: (() -> Void)?
        init(_ id: UUID = UUID(), state: AnimationState = .ready) { self.id = id; self.state = state }
        func stop(immediately: Bool) { state = .ended }
        func reset() { state = .ready }
        func performTick(with update: AnimationUpdate) { tick?() }
    }
    let ended = Item(state: .ended), running = Item(state: .running)
    var values: [UUID: any Animation] = [ended.id: ended, running.id: running]
    var events: [String] = []
    ended.tick = { preconditionFailure("Ended animation ticked") }
    running.tick = { events.append("tick"); running.state = .ended }
    var callback: (() -> Void)? = { preconditionFailure("Stale invalidation callback") }
    performAnimationDriverFrame(with: AnimationUpdate(timestamp: 1, duration: 0.1),
        snapshot: { [ended, running] }, remove: { events.append("remove"); values.removeValue(forKey: $0) },
        isEmpty: { values.isEmpty }, stopDriver: {
            events.append("stop"); callback = { events.append("invalidate") }
        }, invalidation: { callback })
    precondition(events == ["remove", "tick", "remove", "stop", "invalidate"])
    let first = Item(), second = Item(), newcomer = Item()
    values = [first.id: first, second.id: second]
    events = []
    first.tick = {
        events.append("first")
        values.removeValue(forKey: second.id)
        values[newcomer.id] = newcomer
    }
    second.tick = { events.append("second") }
    newcomer.tick = { preconditionFailure("New item ticked in same frame") }
    performAnimationDriverFrame(with: AnimationUpdate(timestamp: 2, duration: 0.1),
        snapshot: { [first, second] }, remove: { values.removeValue(forKey: $0) },
        isEmpty: { values.isEmpty }, stopDriver: { preconditionFailure("Nonempty driver stopped") }, invalidation: { nil })
    precondition(events == ["first", "second"])
    // Break test-only closure ownership, preserving the native snapshot lifetime check.
    running.tick = nil; first.tick = nil; second.tick = nil
}


@MainActor private func runAnimationDriverActivationChecks() {
    final class Owner { var frames = 0 }
    final class Driver: AnimationDriver {
        var starts = 0
        override func start() {
            precondition(frameCallback != nil)
            starts += 1; isActive = true
        }
    }
    let driver = Driver()
    var owner: Owner? = Owner()
    weak var lifetime = owner
    activateAnimationDriver(driver, owner: owner!, isEmpty: { true }, frame: { target, _ in target.frames += 1 })
    precondition(driver.starts == 0 && driver.frameCallback == nil)
    activateAnimationDriver(driver, owner: owner!, isEmpty: { false }, frame: { target, _ in target.frames += 1 })
    precondition(driver.starts == 1)
    driver.frameCallback?(AnimationUpdate(timestamp: 1, duration: 0.1))
    precondition(owner!.frames == 1)
    activateAnimationDriver(driver, owner: owner!, isEmpty: { preconditionFailure("Active driver queried registry") },
        frame: { _, _ in preconditionFailure("Active callback replaced") })
    driver.frameCallback?(AnimationUpdate(timestamp: 2, duration: 0.1))
    precondition(owner!.frames == 2 && driver.starts == 1)
    owner = nil
    precondition(lifetime == nil)
    driver.frameCallback?(AnimationUpdate(timestamp: 3, duration: 0.1))
    driver.frameCallback = nil
}


private func runImmediateAnimationRegistrationChecks() {
    final class Item: Animation {
        let id: UUID
        let state: AnimationState
        init(_ id: UUID, _ state: AnimationState) { self.id = id; self.state = state }
        func stop(immediately: Bool) { preconditionFailure("Registration stopped animation") }
        func reset() { preconditionFailure("Registration reset animation") }
        func performTick(with update: AnimationUpdate) { preconditionFailure("Registration ticked animation") }
    }
    for state in [AnimationState.ready, .retargeted, .running, .ended] {
        let id = UUID(), old = Item(UUID(), .running)
        let item = Item(id, state)
        var registry: [UUID: any Animation] = [id: old]
        var events: [String] = []
        registerImmediateAnimation(item, insert: { id, value in
            events.append("insert"); registry[id] = value
        }, remove: { id in events.append("remove"); registry.removeValue(forKey: id) },
        activate: {
            events.append("activate")
            if state == .ended { precondition(registry[id] == nil) }
            else { precondition((registry[id] as? Item) === item) }
        })
        precondition(events == [state == .ended ? "remove" : "insert", "activate"])
    }
}


@MainActor private func runDelayedAnimationRegistrationChecks() async {
    final class Owner { var calls = 0 }
    enum ProbeError: Error { case failed }
    var live: Owner? = Owner()
    weak var weakOwner = live
    var events: [String] = []
    await resumeDelayedAnimationRegistration(sleep: { events.append("sleep") },
        owner: { events.append("owner"); return weakOwner }, register: { target, delay in
            precondition(delay == .zero); target.calls += 1; events.append("register")
        })
    precondition(events == ["sleep", "owner", "register"] && live!.calls == 1)
    // A non-cancellation sleep error does not itself suppress registration.
    await resumeDelayedAnimationRegistration(sleep: { throw ProbeError.failed }, owner: { weakOwner },
        register: { target, _ in target.calls += 1 })
    precondition(live!.calls == 2)
    let cancelled = Task { @MainActor in
        withUnsafeCurrentTask { $0?.cancel() }
        await resumeDelayedAnimationRegistration(sleep: { throw CancellationError() },
            owner: { weakOwner }, register: { _, _ in preconditionFailure("Cancelled task registered") })
    }
    await cancelled.value
    await resumeDelayedAnimationRegistration(sleep: { live = nil }, owner: { weakOwner },
        register: { _, _ in preconditionFailure("Released owner registered") })
    precondition(weakOwner == nil)
    final class Item: Animation {
        let id = UUID()
        let state = AnimationState.ready
        func stop(immediately: Bool) { preconditionFailure("Delayed registration stopped animation") }
        func reset() { preconditionFailure("Delayed registration reset animation") }
        func performTick(with update: AnimationUpdate) { preconditionFailure("Delayed registration ticked animation") }
    }
    let scheduledOwner = Owner()
    let item = Item()
    let clock = ContinuousClock()
    let start = clock.now
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        scheduleDelayedAnimationRegistration(owner: scheduledOwner, animation: item, delay: .milliseconds(1)) {
            target, registered, delay in
            precondition(target === scheduledOwner && (registered as? Item) === item)
            precondition(delay == .zero && start.duration(to: clock.now) >= .milliseconds(1))
            target.calls += 1
            continuation.resume()
        }
        precondition(scheduledOwner.calls == 0)
    }
    precondition(scheduledOwner.calls == 1)
}


@MainActor private func runAnimationDriverHandlerOwnershipChecks() {
    final class Driver: AnimationDriver {
        var starts = 0, stops = 0
        override func start() { starts += 1; isActive = true }
        override func stop() { stops += 1; isActive = false }
    }
    final class Item: Animation {
        let id = UUID()
        var state = AnimationState.ready
        var ticks = 0, stops = 0
        var onTick: (() -> Void)?
        func stop(immediately: Bool) { precondition(immediately); stops += 1; state = .ended }
        func reset() { preconditionFailure("Handler reset animation") }
        func performTick(with update: AnimationUpdate) { ticks += 1; onTick?() }
    }
    let driver = Driver()
    var owner: AnimationCoordinator.AnimationDriverHandler? = .init(driver: driver)
    weak var lifetime = owner
    let first = Item(), second = Item()
    var invalidations = 0
    owner!.onInvalidation = { precondition(!driver.isActive); invalidations += 1 }
    owner!.register(first)
    owner!.register(second)
    precondition(driver.starts == 1)
    first.onTick = { first.state = .ended }
    driver.frameCallback?(AnimationUpdate(timestamp: 1, duration: 0.1))
    precondition(first.ticks == 1 && second.ticks == 1 && driver.stops == 0)
    owner!.stopAnimations()
    precondition(first.stops == 0 && second.stops == 1)
    driver.frameCallback?(AnimationUpdate(timestamp: 2, duration: 0.1))
    precondition(driver.stops == 1 && invalidations == 1)
    let late = Item()
    owner!.register(late)
    precondition(driver.starts == 2)
    owner = nil
    precondition(lifetime == nil && driver.stops == 1)
    driver.frameCallback?(AnimationUpdate(timestamp: 3, duration: 0.1))
    precondition(late.ticks == 0 && late.stops == 0)
    first.onTick = nil
}


@MainActor private func runInterpolatableAnimationOwnershipChecks() {
    struct Tracked: SIMDRepresentable {
        typealias SIMDType = SIMD1<Double>
        static var trace: [String] = []
        var number: Double
        init(number: Double) { self.number = number }
        init(_ vector: SIMD1<Double>) { Self.trace.append("read:\(vector[0])"); number = vector[0] }
        func simdRepresentation() -> SIMD1<Double> { Self.trace.append("write:\(number)"); return SIMD1(number) }
        static var zero: Self { trace.append("zero"); return Self(number: 0) }
    }
    Tracked.trace = []
    let tracked = InterpolatableAnimation<Tracked>(restoredValue: Tracked(number: 2), targetValue: Tracked(number: 10))
    precondition(Tracked.trace == ["zero", "write:0.0", "zero", "write:0.0", "zero", "write:0.0",
        "write:2.0", "write:2.0", "read:0.0", "write:10.0"], "Conversion trace: \(Tracked.trace)")
    precondition(tracked.value.number == 2 && tracked.initialValue.number == 2 && tracked.targetValue.number == 10)
    final class Projection: InterpolatableAnimation<Double> {
        var next: SIMD1<Double>?
        override func interpolate(with update: AnimationUpdate) -> SIMD1<Double>? { next }
    }
    // Native projected setter bypasses the wrapped target observer.
    let projectedTarget = Projection(restoredValue: 0, targetValue: 1)
    projectedTarget.state = .running
    var targetEvents = 0
    projectedTarget.eventHandler = { _ in targetEvents += 1 }
    projectedTarget.$targetValue = SIMD1(2)
    precondition(projectedTarget.targetValue == 2 && projectedTarget.state == .running && targetEvents == 0)
    projectedTarget.$targetValue[0] = 3
    precondition(projectedTarget.targetValue == 3 && projectedTarget.state == .running && targetEvents == 0)
    projectedTarget.targetValue = 4
    precondition(projectedTarget.state == .retargeted && targetEvents == 1)
    projectedTarget.eventHandler = nil
    let item = Projection(restoredValue: 2, targetValue: 10)
    var events: [String] = []
    item.eventHandler = { event in
        switch event {
        case let .valueChanged(old, new): events.append("value:\(old):\(new)")
        case let .finished(value):
            precondition(item.state == .running)
            events.append("finished:\(value)")
        case let .retargeted(old, new):
            precondition(item.state == .retargeted)
            events.append("target:\(old):\(new)")
        }
    }
    item.next = SIMD1(4)
    item.performTick(with: AnimationUpdate(timestamp: 1, duration: 0.1))
    precondition(item.initialValue == 2 && item.startTime == 1 && item.value == 4)
    item.targetValue = 20
    precondition(item.state == .retargeted)
    item.next = SIMD1(8)
    item.performTick(with: AnimationUpdate(timestamp: 2, duration: 0.1))
    precondition(item.initialValue == 4 && item.startTime == 2)
    item.next = nil
    item.performTick(with: AnimationUpdate(timestamp: 3, duration: 0.1))
    precondition(item.value == 20 && item.state == .ended)
    precondition(events == ["value:2.0:4.0", "target:10.0:20.0", "value:4.0:8.0", "value:8.0:20.0", "finished:20.0"])
    item.reset()
    precondition(item.state == .ready && item.startTime == nil && item.value == 20)
    item.eventHandler = nil
    let base = InterpolatableAnimation<Double>(restoredValue: 1, targetValue: 3)
    base.performTick(with: AnimationUpdate(timestamp: 0, duration: 0.1))
    precondition(base.value == 3 && base.state == .ended)
}


@MainActor private func runBezierAnimationOwnershipChecks() {
    let item = BezierAnimation<CGPoint>(BezierParameters(.linear, duration: 1),
        initialValue: CGPoint(x: 10, y: 20), targetValue: CGPoint(x: 110, y: 220))
    precondition(item.value == CGPoint(x: 10, y: 20) && item.initialValue == item.value)
    precondition(item.state == .ready && item.startTime == nil)
    var values: [CGPoint] = []
    var finished = 0
    item.eventHandler = { event in
        switch event {
        case let .valueChanged(_, new): values.append(new)
        case let .finished(value):
            precondition(value == item.targetValue && item.state == .running)
            finished += 1
        case .retargeted: break
        }
    }
    item.performTick(with: AnimationUpdate(timestamp: 0, duration: 0, targetTimestamp: 0))
    item.performTick(with: AnimationUpdate(timestamp: 0.5, duration: 0, targetTimestamp: 0.5))
    precondition(abs(item.value.x - 60) < 0.001 && abs(item.value.y - 120) < 0.001)
    item.performTick(with: AnimationUpdate(timestamp: 1, duration: 0, targetTimestamp: 1))
    precondition(item.state == .running && finished == 0)
    item.performTick(with: AnimationUpdate(timestamp: 1.1, duration: 0, targetTimestamp: 1.1))
    precondition(item.state == .ended && finished == 1 && item.value == item.targetValue)
    precondition(values.count == 2)
    item.eventHandler = nil
    let updated = BezierAnimation<Double>(BezierParameters(.linear, duration: 1), initialValue: 0, targetValue: 100)
    updated.start(at: 0)
    let half = AnimationUpdate(timestamp: 0.5, duration: 0)
    precondition(abs(updated.interpolate(with: half)![0] - 50) < 0.001)
    precondition(!updated.updateParameters(.spring(SpringParameters(response: 0.5, dampingFraction: 0.7))))
    precondition(abs(updated.interpolate(with: half)![0] - 50) < 0.001)
    precondition(updated.updateParameters(.bezier(BezierParameters(.linear, duration: 2))))
    precondition(updated.startTime == 0 && updated.state == .ready && updated.value == 0)
    precondition(abs(updated.interpolate(with: half)![0] - 25) < 0.01)
    let base = InterpolatableAnimation<Double>(restoredValue: 0, targetValue: 1)
    precondition(!base.updateParameters(.bezier(BezierParameters(.linear, duration: 1))))
    precondition(SpringParameters(stiffness: 4, dampingFraction: 0.5).response == Double.pi)
    precondition(SpringParameters(stiffness: .infinity, dampingFraction: 0).response == 0)
    precondition(SpringParameters(stiffness: .nan, dampingFraction: 0).response == 0)
    precondition(SpringParameters(stiffness: -1, dampingFraction: 0).response.isNaN)
    precondition(SpringParameters(stiffness: 0, dampingFraction: 0).response == .infinity)
}


@MainActor private func runAnimationCoordinatorDriverCacheChecks() {
    final class Source: AnimationDriverSource {
        var factories = 0
        func makeAnimationDriver() -> AnimationDriver { factories += 1; return AnimationDriver() }
    }
    final class Item: Animation {
        let id = UUID()
        var state = AnimationState.ready
        var stops = 0
        func stop(immediately: Bool) { precondition(immediately); stops += 1; state = .ended }
        func reset() {}
        func performTick(with update: AnimationUpdate) {}
    }
    var coordinator: AnimationCoordinator? = AnimationCoordinator()
    let source = Source(), other = Source()
    let first = coordinator!.handler(for: source)
    precondition(coordinator!.handler(for: source) === first && source.factories == 1)
    precondition(coordinator!.handler(for: other) !== first && other.factories == 1)
    let item = Item()
    first.register(item)
    coordinator!.remove(driverSource: source)
    precondition(item.stops == 1)
    let replacement = coordinator!.handler(for: source)
    precondition(replacement !== first && source.factories == 2)
    // Old callback removes the current key, as in the native callback body.
    first.onInvalidation?()
    precondition(coordinator!.handler(for: source) !== replacement && source.factories == 3)
    weak var lifetime = coordinator
    coordinator = nil
    precondition(lifetime == nil)
    replacement.onInvalidation?()
    var retainedSource: Source? = Source()
    weak var sourceLifetime = retainedSource
    var retainedHandler: AnimationCoordinator.AnimationDriverHandler? = AnimationCoordinator().handler(for: retainedSource!)
    retainedSource = nil
    precondition(sourceLifetime != nil)
    retainedHandler = nil
    precondition(sourceLifetime == nil)
    _ = retainedHandler
}


private func runAnimationTransactionStorageChecks() {
    final class Source: AnimationDriverSource {
        func makeAnimationDriver() -> AnimationDriver { AnimationDriver() }
    }
    precondition(Transaction.Priority.low.rawValue == 250)
    precondition(Transaction.Priority.default.rawValue == 500)
    precondition(Transaction.Priority.high.rawValue == 750)
    precondition(Transaction.Priority.required.rawValue == 1000)
    precondition(Transaction.Priority(-1) < .low && Transaction.Priority.high < .required)
    var source: Source? = Source()
    weak var lifetime = source
    var calls: [AnimationState] = []
    var transaction = Transaction(driverSource: source!, descriptor: .bezier(BezierParameters(.linear, duration: 2)),
        priority: .high, delay: .milliseconds(25), completion: { calls.append($0) })
    let copy = transaction
    precondition(transaction.id == copy.id && transaction.driverSource === source)
    precondition(transaction.descriptor == .bezier(BezierParameters(.linear, duration: 2)))
    transaction.priority = .required
    transaction.delay = .zero
    transaction.completion?(.running)
    precondition(copy.priority == .high && copy.delay == .milliseconds(25) && calls == [.running])
    let other = Transaction(driverSource: source!, descriptor: nil, priority: .default, delay: .zero, completion: nil)
    precondition(other.id != transaction.id && other.descriptor == nil)
    source = nil
    precondition(lifetime == nil) // Do not dereference an expired unowned source.
    withExtendedLifetime((transaction, copy, other)) {}
}


@MainActor private func runAnimationTransactionExecutionChecks() {
    final class Source: AnimationDriverSource {
        func makeAnimationDriver() -> AnimationDriver { AnimationDriver() }
    }
    enum Failure: Error { case expected }
    let source = Source()
    let outer = Transaction(driverSource: source, descriptor: nil, priority: .default, delay: .zero, completion: nil)
    let inner = Transaction(driverSource: source, descriptor: nil, priority: .high, delay: .zero, completion: nil)
    var stack: [Transaction] = []
    var registered: [UUID] = []
    func execute<Result>(_ transaction: Transaction, _ body: () throws -> Result) rethrows -> Result {
        try performAnimationTransaction(transaction, storeCompletion: { registered.append($0.id) },
            append: { stack.append($0) }, removeLast: { stack.removeLast() }, body: body)
    }
    let result = execute(outer) {
        precondition(stack.map(\.id) == [outer.id])
        let nested = execute(inner) { precondition(stack.map(\.id) == [outer.id, inner.id]); return 7 }
        precondition(stack.map(\.id) == [outer.id])
        return nested + 1
    }
    precondition(result == 8 && stack.isEmpty && registered == [outer.id, inner.id])
    do {
        let _: Int = try execute(outer) { throw Failure.expected }
        preconditionFailure("Throwing transaction returned")
    } catch Failure.expected {} catch { preconditionFailure("Wrong error") }
    precondition(stack.map(\.id) == [outer.id])
    // Successful outer execution pops the live last entry, even when an inner
    // failure was caught by its body: preserve the source's literal removeLast.
    stack.removeAll()
    execute(outer) {
        do { let _: Int = try execute(inner) { throw Failure.expected } } catch {}
    }
    precondition(stack.map(\.id) == [outer.id])
    precondition(outer.perform { inner.perform { 42 } } == 42)
}


@MainActor private func runAnimationCoordinatorRegistrationChecks() {
    final class Driver: AnimationDriver {
        var starts = 0
        override func start() { starts += 1; isActive = true }
        override func stop() { isActive = false }
    }
    final class Source: AnimationDriverSource {
        let driver = Driver()
        var factories = 0
        func makeAnimationDriver() -> AnimationDriver { factories += 1; return driver }
    }
    let coordinator = AnimationCoordinator.shared
    let outerSource = Source(), innerSource = Source(), explicitSource = Source()
    var outerEvents: [AnimationState] = [], innerEvents: [AnimationState] = []
    let outer = Transaction(driverSource: outerSource, descriptor: nil, priority: .required,
        delay: .zero, completion: { outerEvents.append($0) })
    let inner = Transaction(driverSource: innerSource, descriptor: nil, priority: .low,
        delay: .zero, completion: { innerEvents.append($0) })
    let noSource = InterpolatableAnimation<Double>(restoredValue: 0, targetValue: 1)
    coordinator.register(noSource)
    precondition(noSource.state == .ready)
    let animation = InterpolatableAnimation<Double>(restoredValue: 0, targetValue: 1)
    outer.perform { inner.perform { coordinator.register(animation) } }
    precondition(innerSource.factories == 1 && outerSource.factories == 0)
    innerSource.driver.frameCallback?(AnimationUpdate(timestamp: 0, duration: 0.1))
    precondition(animation.state == .ended && innerEvents == [.running, .ended] && outerEvents.isEmpty)
    // Completion is removed after ended, including for an explicit driver.
    let explicit = InterpolatableAnimation<Double>(restoredValue: 0, targetValue: 1)
    outer.perform { coordinator.register(explicit, driverSource: explicitSource) }
    precondition(explicitSource.factories == 1 && outerSource.factories == 0)
    explicitSource.driver.frameCallback?(AnimationUpdate(timestamp: 0, duration: 0.1))
    precondition(outerEvents == [.running, .ended])
    coordinator.remove(driverSource: innerSource)
    coordinator.remove(driverSource: explicitSource)
}


private func runSpringParameterConversionChecks() {
    precondition(SpringParameters.smooth == .smooth(duration: 0.5))
    precondition(SpringParameters.snappy == .snappy(duration: 0.5))
    precondition(SpringParameters.bouncy == .bouncy(duration: 0.5))
    precondition(SpringParameters(duration: -2, bounce: 0).response == -2)
    for (bounce, damping) in [(-2.0, Double.infinity), (-1, .infinity), (-0.5, 2), (0, 1), (0.5, 0.5), (1, 0), (2, 0)] {
        precondition(SpringParameters(duration: 3, bounce: bounce).dampingFraction == damping)
    }
    precondition(SpringParameters(duration: 1, bounce: .infinity).dampingFraction == 0)
    precondition(SpringParameters(duration: 1, bounce: -.infinity).dampingFraction == .infinity)
    precondition(SpringParameters(duration: 1, bounce: .nan).dampingFraction.isNaN)
    precondition(SpringParameters(duration: 1, bounce: -0.0).dampingFraction == 1)
    precondition(SpringParameters.bouncy(duration: 2, extraBounce: 0.2).dampingFraction == 0.5)
    precondition(SpringParameters.snappy(duration: 2, extraBounce: -0.65).dampingFraction == 2)
}


private func runVelocityVerletStiffnessChecks() {
    precondition(velocityVerletStiffness(response: 2 * Double.pi) == 1)
    precondition(velocityVerletStiffness(response: Double.infinity) == 0)
    for response in [0.0, -0.0, -1, -Double.infinity, Double.nan] {
        precondition(velocityVerletStiffness(response: response) == Double.infinity)
    }
    precondition(velocityVerletStiffness(response: Double.leastNormalMagnitude) == .infinity)
    let response: Float = 0.5
    let frequency = Float(6.283185307179586) / response
    precondition(velocityVerletStiffness(response: response) == frequency * frequency)
}


private func runVelocityVerletDragChecks() {
    precondition(velocityVerletDrag(dampingFraction: 0.5, stiffness: 4.0) == 2)
    precondition(velocityVerletDrag(dampingFraction: -0.5, stiffness: 4.0) == -2)
    precondition(velocityVerletDrag(dampingFraction: 0.0, stiffness: Double.infinity).isNaN)
    precondition(velocityVerletDrag(dampingFraction: 1.0, stiffness: -1.0).isNaN)
    precondition(velocityVerletDrag(dampingFraction: Double.infinity, stiffness: 0).isNaN)
    precondition(velocityVerletDrag(dampingFraction: -1.0, stiffness: -0.0).sign == .plus)
    let stiffness: Float = 123.25, damping: Float = 0.7
    precondition(velocityVerletDrag(dampingFraction: damping, stiffness: stiffness) == (stiffness.squareRoot() * 2) * damping)
}


private func runVelocityVerletConfigurationChecks() {
    typealias Configuration = VelocityVerletSimulation<SIMD2<Double>>.Configuration
    let normal = Configuration(response: 0.5, dampingFraction: 0.7)
    precondition(normal.response == 0.5 && normal.dt == 1.0 / 240 && normal.idleVelocityThreshold == 0.06)
    precondition(normal.stiffness == velocityVerletStiffness(response: 0.5))
    precondition(normal.drag == velocityVerletDrag(dampingFraction: 0.7, stiffness: normal.stiffness))
    for response in [0.0, -1, Double.nan, Double.leastNormalMagnitude] {
        let capped = Configuration(response: response, dampingFraction: 1, idleVelocityThreshold: -2)
        precondition(capped.stiffness == 28800 && capped.idleVelocityThreshold == -2)
        precondition(capped.drag == 28800.0.squareRoot() * 2)
    }
    let explicitNaN = Configuration(response: .infinity, dampingFraction: 1, idleVelocityThreshold: .nan)
    precondition(explicitNaN.stiffness == 0 && explicitNaN.drag == 0 && explicitNaN.idleVelocityThreshold.isNaN)
    let narrow = VelocityVerletSimulation<SIMD2<Float>>.Configuration(response: 0.7, dampingFraction: 0.3)
    precondition(narrow.response == Float(0.7) && narrow.idleVelocityThreshold == Float(0.06))
    precondition(narrow.stiffness == velocityVerletStiffness(response: Float(0.7)))
}


private func runVelocityVerletStateChecks() {
    typealias Simulation = VelocityVerletSimulation<SIMD2<Double>>
    let configuration = Simulation.Configuration(response: 0.5, dampingFraction: 0.7)
    var state = Simulation(configuration: configuration, time: 12,
        velocity: SIMD2(2, -3), force: SIMD2(5, -7))
    let copy = state
    state.reset()
    precondition(state.velocity == .zero && state.force == .zero)
    precondition(state.time == 12 && state.configuration.response == configuration.response)
    precondition(state.configuration.dt == configuration.dt && state.configuration.drag == configuration.drag)
    precondition(copy.velocity == SIMD2(2, -3) && copy.force == SIMD2(5, -7) && copy.time == 12)
    state.configuration.dt = 0.25
    precondition(copy.configuration.dt == 1.0 / 240)
    state.reset()
    precondition(state.configuration.dt == 0.25 && state.time == 12)
}


private func runVelocityVerletTimeChecks() {
    typealias Simulation = VelocityVerletSimulation<SIMD2<Double>>
    var config = Simulation.Configuration(response: 0.5, dampingFraction: 0.7)
    config.dt = 0.25
    var simulation = Simulation(configuration: config, time: 0, velocity: .zero, force: .zero)
    var steps = 0
    simulation.advanceTime(to: 1) { _ in steps += 1 }
    precondition(steps == 4 && simulation.time == 1) // Exactly one-second gap is not clamped.
    simulation.advanceTime(to: 0.5) { _ in preconditionFailure("Advanced backwards") }
    simulation.advanceTime(to: .nan) { _ in preconditionFailure("Advanced to NaN") }
    precondition(simulation.time == 1)
    simulation.time = 0
    steps = 0
    simulation.advanceTime(to: 2) { _ in steps += 1 }
    precondition(steps == 1 && simulation.time == (2 + (-1.0 / 60)) + 0.25)
    simulation.time = 0
    steps = 0
    simulation.advanceTime(to: 0.2) { state in steps += 1; state.configuration.dt = 0.125 }
    precondition(steps == 2 && simulation.time == 0.25)
    simulation.advanceTime(to: .infinity) { _ in preconditionFailure("Infinite target performed a step") }
    precondition(simulation.time == .infinity)
    simulation.time = .nan
    simulation.advanceTime(to: 1) { _ in preconditionFailure("NaN time performed a step") }
    precondition(simulation.time.isNaN)
}


private func runVelocityVerletHalfKickChecks() {
    let next = velocityVerletHalfKick(velocity: SIMD2<Double>(1, -2), force: SIMD2(4, 8), dt: 0.5)
    precondition(next == SIMD2(2, 0))
    let zero = velocityVerletHalfKick(velocity: SIMD2<Double>(1, -2), force: .zero, dt: 0.25)
    precondition(zero == SIMD2(1, -2))
    // Halving in Double before scalar conversion avoids early Float overflow.
    let large = velocityVerletHalfKick(velocity: SIMD2<Float>.zero, force: SIMD2(repeating: 1),
        dt: Double(Float.greatestFiniteMagnitude) * 1.5)
    precondition(large[0].isFinite && large[0] == Float(Double(Float.greatestFiniteMagnitude) * 0.75))
    let invalid = velocityVerletHalfKick(velocity: SIMD2<Double>.zero, force: SIMD2(.infinity, 1), dt: 0)
    precondition(invalid[0].isNaN && invalid[1] == 0)
}


private func runVelocityVerletDriftChecks() {
    let velocity = velocityVerletHalfKick(velocity: SIMD2<Double>(1, -2), force: SIMD2(4, 8), dt: 0.5)
    let position = velocityVerletDrift(position: SIMD2<Double>(10, 20), halfStepVelocity: velocity, dt: 0.5)
    precondition(position == SIMD2(11, 20))
    // With no force, two exact dyadic time intervals match one full interval.
    let start = SIMD2<Double>(3, -5), constantVelocity = SIMD2<Double>(2, 4)
    let first = velocityVerletDrift(position: start, halfStepVelocity: constantVelocity, dt: 0.25)
    let second = velocityVerletDrift(position: first, halfStepVelocity: constantVelocity, dt: 0.25)
    precondition(second == velocityVerletDrift(position: start, halfStepVelocity: constantVelocity, dt: 0.5))
    let backwards = velocityVerletDrift(position: second, halfStepVelocity: constantVelocity, dt: -0.5)
    precondition(backwards == start)
    let overflow = velocityVerletDrift(position: SIMD2<Float>.zero, halfStepVelocity: SIMD2(0, 1),
        dt: Double(Float.greatestFiniteMagnitude) * 2)
    precondition(overflow[0].isNaN && overflow[1] == .infinity)
}


private func runVelocityVerletIntegrationChecks() {
    typealias Simulation = VelocityVerletSimulation<SIMD2<Double>>
    let config = Simulation.Configuration(response: 2 * Double.pi, dampingFraction: 0)
    var simulation = Simulation(configuration: config, time: 0, velocity: .zero, force: .zero)
    var position = SIMD2<Double>(1, -2)
    simulation.step(position: &position, target: .zero)
    precondition(position == SIMD2(1, -2) && simulation.force == SIMD2(-1, 2))
    precondition(simulation.velocity == SIMD2(-config.dt * 0.5, config.dt))
    precondition(simulation.time == 0)
    // Undamped oscillator over one second: compare to its analytic trajectory,
    // allowing fixed-step integration error rather than mirroring each stage.
    simulation.advance(to: 1, position: &position, target: .zero)
    precondition(abs(position[0] - cos(simulation.time)) < 0.01)
    precondition(abs(position[1] + 2 * cos(simulation.time)) < 0.02)
    let force = velocityVerletForce(position: SIMD2<Double>(2, 3), target: SIMD2(5, 1),
        halfStepVelocity: SIMD2(4, -2), stiffness: 2, drag: 3)
    precondition(force == SIMD2(-6, 2))
    let equilibrium = velocityVerletForce(position: SIMD2<Double>(2, 3), target: SIMD2(2, 3),
        halfStepVelocity: .zero, stiffness: 2, drag: 3)
    precondition(equilibrium == .zero)
}


private func runSpringLogicalCompletionChecks() {
    for state in [AnimationState.ready, .retargeted, .running, .ended] {
        precondition(springAnimationIsLogicallyComplete(startTime: nil, state: state,
            simulationTime: .nan, response: Double.nan) == (state == .ended))
    }
    precondition(!springAnimationIsLogicallyComplete(startTime: 2, state: .ended, simulationTime: 2.25, response: 0.5))
    precondition(springAnimationIsLogicallyComplete(startTime: 2, state: .running, simulationTime: 2.5, response: 0.5))
    precondition(springAnimationIsLogicallyComplete(startTime: 2, state: .ready, simulationTime: 3, response: 0.5))
    precondition(!springAnimationIsLogicallyComplete(startTime: 2, state: .ended, simulationTime: .nan, response: 0.5))
    precondition(!springAnimationIsLogicallyComplete(startTime: 2, state: .ended, simulationTime: 3, response: Double.nan))
    // Original converts elapsed Double to scalar before comparison.
    let below = 1.0 - Double(Float.ulpOfOne) / 4
    precondition(springAnimationIsLogicallyComplete(startTime: 0, state: .running, simulationTime: below, response: Float(1)))
    precondition(!springAnimationIsLogicallyComplete(startTime: 0, state: .running, simulationTime: below, response: Double(1)))
}


private func runVelocityVerletMotionThresholdChecks() {
    precondition(!velocityVerletExceedsMotionThreshold(velocity: SIMD2<Double>.zero, force: .zero, threshold: 0))
    precondition(!velocityVerletExceedsMotionThreshold(velocity: SIMD2<Double>(3, 4), force: .zero, threshold: 5))
    precondition(velocityVerletExceedsMotionThreshold(velocity: SIMD2<Double>(3, 4), force: .zero, threshold: 4.9))
    precondition(velocityVerletExceedsMotionThreshold(velocity: SIMD2<Double>.zero, force: SIMD2(3, 4), threshold: 4.9))
    precondition(!velocityVerletExceedsMotionThreshold(velocity: SIMD2<Double>(3, 4), force: .zero, threshold: -5))
    typealias Simulation = VelocityVerletSimulation<SIMD2<Double>>
    let config = Simulation.Configuration(response: 1, dampingFraction: 1, idleVelocityThreshold: 5)
    let moving = Simulation(configuration: config, time: 100, velocity: SIMD2(6, 0), force: .zero)
    precondition(moving.exceedsMotionThreshold)
}


private func runVelocityVerletIdleChecks() {
    func idle(_ position: SIMD2<Double>, _ target: SIMD2<Double>, velocity: SIMD2<Double> = .zero) -> Bool {
        velocityVerletIsIdle(position: position, target: target, velocity: velocity, force: .zero, threshold: 0.06)
    }
    precondition(idle(SIMD2(9.95, 0), SIMD2(10, 0)))
    precondition(!idle(SIMD2(9.8, 0), SIMD2(10, 0)))
    precondition(!idle(SIMD2(10, 0), SIMD2(10, 0), velocity: SIMD2(1, 0)))
    // Zero target makes the source's relative tolerance zero, bypassing the
    // position rejection after motion passes. Do not invent an absolute floor.
    precondition(idle(SIMD2(100, -100), .zero))
    precondition(idle(SIMD2(.nan, 0), SIMD2(10, 0)))
    precondition(idle(SIMD2(10, 0), SIMD2(.nan, 0)))
    typealias Simulation = VelocityVerletSimulation<SIMD2<Double>>
    let simulation = Simulation(configuration: .init(response: 1, dampingFraction: 1), time: 0,
        velocity: .zero, force: .zero)
    precondition(simulation.isIdle(position: SIMD2(10, 0), target: SIMD2(10, 0)))
}


@MainActor private func runSpringAnimationOwnershipChecks() {
    let animation = SpringAnimation<CGPoint>(.smooth, initialValue: CGPoint(x: 10, y: 20),
        targetValue: CGPoint(x: 100, y: 200))
    precondition(animation.velocity == .zero && !animation.isLogicallyComplete)
    var frames = 0, finishes = 0
    animation.eventHandler = { event in
        switch event {
        case .valueChanged: frames += 1
        case let .finished(value):
            precondition(animation.state == .running && value == CGPoint(x: 100, y: 200))
            finishes += 1
        case .retargeted: break
        }
    }
    for index in 0..<2400 {
        animation.performTick(with: AnimationUpdate(timestamp: Double(index) / 240, duration: 1.0 / 240))
        if animation.state == .ended { break }
    }
    precondition(animation.state == .ended && animation.value == animation.targetValue && finishes == 1 && frames > 1)
    precondition(animation.isLogicallyComplete)
    let time = animation.startTime
    let velocity = animation.velocity
    precondition(!animation.updateParameters(.bezier(BezierParameters(.linear, duration: 1))))
    precondition(animation.updateParameters(.spring(.bouncy)))
    precondition(animation.startTime == time && animation.velocity == velocity)
    animation.eventHandler = nil
    animation.reset()
    precondition(animation.state == .ready && animation.startTime == nil && animation.velocity == .zero)
    precondition(!animation.isLogicallyComplete)
}


@MainActor private func runAnimationDescriptorFactoryChainChecks() {
    final class Driver: AnimationDriver {
        override func start() { isActive = true }
        override func stop() { isActive = false }
    }
    final class Source: AnimationDriverSource {
        let driver = Driver()
        func makeAnimationDriver() -> AnimationDriver { driver }
    }
    let descriptors: [AnimationDescriptor] = [.bezier(BezierParameters(.easeInOut, duration: 0.2)), .spring(.smooth)]
    for (index, descriptor) in descriptors.enumerated() {
        let source = Source()
        let start = CGPoint(x: 10, y: 20), target = CGPoint(x: 100, y: 200)
        let animation = descriptor.makeAnimation(from: start, to: target)
        precondition(index == 0 ? animation is BezierAnimation<CGPoint> : animation is SpringAnimation<CGPoint>)
        precondition(animation.value == start && animation.initialValue == start && animation.targetValue == target)
        var states: [AnimationState] = []
        let transaction = Transaction(driverSource: source, descriptor: descriptor, priority: .default,
            delay: .zero, completion: { states.append($0) })
        transaction.perform { AnimationCoordinator.shared.register(animation) }
        precondition(source.driver.isActive)
        for frame in 0..<2400 {
            source.driver.frameCallback?(AnimationUpdate(timestamp: Double(frame) / 240, duration: 1.0 / 240))
            if !source.driver.isActive { break }
        }
        precondition(animation.state == .ended && animation.value == target && !source.driver.isActive)
        precondition(states == [.running, .ended])
        AnimationCoordinator.shared.remove(driverSource: source)
    }
}


@MainActor private func runCursorAnimationStorageResetChecks() {
    final class Owner: CursorWindowAnimationStorage {
        var cursorMotionProgressAnimation: SpringAnimation<CGFloat>?
        var cursorScootPositionAnimation: SpringAnimation<CGPoint>?
        var cursorScootBaseRotationAnimation: SpringAnimation<CGFloat>?
        var cursorScootAxisAnimation: SpringAnimation<CGFloat>?
        var cursorScootStretchAnimation: SpringAnimation<CGFloat>?
        var cursorScootRotationAnimation: SpringAnimation<CGFloat>?
    }
    let owner = Owner()
    let progress = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
    let position = SpringAnimation<CGPoint>(.smooth, initialValue: .zero, targetValue: CGPoint(x: 1, y: 2))
    let replacement = SpringAnimation<CGPoint>(.smooth, initialValue: .zero, targetValue: CGPoint(x: 3, y: 4))
    owner.cursorMotionProgressAnimation = progress
    owner.cursorScootPositionAnimation = position
    var finishes = 0
    progress.eventHandler = { event in
        if case .finished = event { finishes += 1; owner.cursorScootPositionAnimation = replacement }
    }
    replacement.eventHandler = { _ in preconditionFailure("Position callback was not cleared") }
    owner.resetMotionAnimations()
    precondition(progress.state == .ended && finishes == 1)
    precondition(position.state == .ready && replacement.state == .ended)
    precondition(owner.cursorMotionProgressAnimation == nil && owner.cursorScootPositionAnimation == nil)
    precondition(replacement.eventHandler == nil)
    progress.eventHandler = nil
    owner.resetMotionAnimations()
    precondition(finishes == 1)
}


@MainActor private func runCursorScootAnimationResetChecks() {
    final class Owner { var animation: SpringAnimation<CGFloat>? }
    final class ReleaseProbe {
        let onRelease: () -> Void
        init(_ onRelease: @escaping () -> Void) { self.onRelease = onRelease }
        deinit { onRelease() }
    }
    let owner = Owner()
    let original = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
    let replacement = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 2)
    owner.animation = original
    do {
        let release = ReleaseProbe { owner.animation = replacement }
        original.eventHandler = { [release] _ in
            withExtendedLifetime(release) {}
            preconditionFailure("Reset emitted through cleared scoot handler")
        }
    }
    stopAndClearCursorScootAnimation(owner, at: \.animation)
    precondition(original.state == .ready && replacement.state == .ended && owner.animation == nil)
    precondition(original.eventHandler == nil)
    stopAndClearCursorScootAnimation(owner, at: \.animation)
}


@MainActor private func runCursorScootResetFieldOrderChecks() {
    final class Owner: CursorWindowResetStorage {
        var overlayWindowLevelReasons = CursorOverlayWindowLevelReasons()
        var cursorMotionNextInteractionTimingHandler: (() -> Void)?
        var cursorMotionCompletionHandler: (() -> Void)?
        var cursorMotionDidSatisfyNextInteractionTiming = true
        var wantsToBeVisible = true
        var correspondingWindowID: UInt32? = 17
        var events: [String] = []
        func setCursorWindowLevel(_ level: Int) { precondition(level == 0); events.append("level") }
        func correspondingWindowIsPresent() -> Bool { events.append("present"); return true }
        func updateVisibility() { events.append("visibility") }
        var style = ComputerUseCursorStyle()
        var cursorMotionProgressAnimation: SpringAnimation<CGFloat>?
        var cursorScootPositionAnimation: SpringAnimation<CGPoint>?
        var cursorScootBaseRotationAnimation: SpringAnimation<CGFloat>?
        var cursorScootAxisAnimation: SpringAnimation<CGFloat>?
        var cursorScootStretchAnimation: SpringAnimation<CGFloat>?
        var cursorScootRotationAnimation: SpringAnimation<CGFloat>?
        var motionConfiguration = ComputerUseCursorMotionConfiguration.live
        var cursorScootBaseRotationOffset: CGFloat = 10
        var cursorScootAxisRotation: CGFloat = 20
        var cursorScootStretchXScale: CGFloat = 2
        var cursorScootStretchScale: CGFloat = 3
        var cursorScootStretchPivotX: CGFloat = 0.1
        var cursorScootRotationOffset: CGFloat = 30
    }
    final class ReleaseProbe {
        let release: () -> Void
        init(_ release: @escaping () -> Void) { self.release = release }
        deinit { release() }
    }
    let owner = Owner()
    let axis = SpringAnimation<CGFloat>(.smooth, initialValue: 1, targetValue: 2)
    let stretch = SpringAnimation<CGFloat>(.smooth, initialValue: 1, targetValue: 2)
    owner.cursorScootAxisAnimation = axis
    owner.cursorScootStretchAnimation = stretch
    do {
        let probe = ReleaseProbe {
            precondition(owner.cursorScootBaseRotationOffset == 0 && owner.cursorScootAxisRotation == 20)
        }
        axis.eventHandler = { [probe] _ in withExtendedLifetime(probe) {} }
    }
    do {
        let probe = ReleaseProbe {
            precondition(owner.cursorScootAxisRotation == 0 && owner.cursorScootStretchXScale == 2)
            owner.motionConfiguration.scootStretchPivotX = 0.8
        }
        stretch.eventHandler = { [probe] _ in withExtendedLifetime(probe) {} }
    }
    owner.resetScootAnimationFields()
    precondition(axis.state == .ended && stretch.state == .ended)
    precondition(owner.cursorScootStretchXScale == 1 && owner.cursorScootStretchScale == 1)
    precondition(owner.cursorScootStretchPivotX == 0.8 && owner.cursorScootRotationOffset == 0)
    precondition(owner.cursorScootAxisAnimation == nil && owner.cursorScootStretchAnimation == nil)
    precondition(!owner.scootStyleNeedsReset { .zero })
    precondition(owner.scootStyleNeedsReset { .degrees(1) })
    owner.cursorScootAxisRotation = 19 // Native scalar preflight does not inspect axis rotation.
    precondition(!owner.scootStyleNeedsReset { .zero })
    owner.cursorScootBaseRotationOffset = 0.001
    precondition(!owner.scootStyleNeedsReset { .zero })
    owner.cursorScootBaseRotationOffset = CGFloat(0.001).nextUp
    precondition(owner.scootStyleNeedsReset { preconditionFailure("Dirty scalar queried tilt") })
    owner.cursorScootBaseRotationOffset = 0
    owner.cursorScootAxisAnimation = axis
    precondition(owner.scootStyleNeedsReset { preconditionFailure("Present animation queried tilt") })
    owner.cursorScootAxisAnimation = nil
    precondition(abs(cursorScootResetAngle(clickAngle: -44).radians) < 1e-12)
    precondition(abs(cursorScootResetAngle(clickAngle: 360).radians + 2 * .pi) < 1e-12)
    precondition(cursorScootResetAngle(clickAngle: .nan).radians.isNaN)
    final class ReplacingStyle: ComputerUseCursorStyle {
        var onAngle: (() -> Void)?
        override var angle: Angle { didSet { onAngle?() } }
    }
    let firstStyle = ReplacingStyle()
    let replacementStyle = ComputerUseCursorStyle()
    replacementStyle.scootStretchScale = 9
    replacementStyle.scootTiltAngle = .degrees(23)
    firstStyle.scootStretchScale = 7
    firstStyle.onAngle = { owner.style = replacementStyle }
    owner.style = firstStyle
    owner.cursorScootRotationOffset = 2
    owner.resetScootAnimations()
    precondition(owner.style === replacementStyle)
    precondition(firstStyle.scootStretchScale == 7)
    precondition(replacementStyle.scootStretchScale == 1)
    precondition(replacementStyle.scootStretchPivotX == 0.8)
    precondition(replacementStyle.scootTiltAngle == .zero)
    // Clean preflight skips style writes but still restores ignored axis state.
    owner.cursorScootAxisRotation = 19
    replacementStyle.scootStretchScale = 9
    owner.resetScootAnimations()
    precondition(owner.cursorScootAxisRotation == 0)
    precondition(replacementStyle.scootStretchScale == 9)
    owner.overlayWindowLevelReasons.petLaunch = true
    owner.style.velocityX = 8
    owner.style.velocityY = 9
    let progress = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
    owner.cursorMotionProgressAnimation = progress
    progress.eventHandler = { event in
        if case .finished = event { owner.events.append("motionFinished") }
    }
    do {
        let release = ReleaseProbe {
            precondition(owner.cursorScootRotationOffset == 0)
            precondition(owner.cursorMotionDidSatisfyNextInteractionTiming)
            owner.events.append("nextReleased")
        }
        owner.cursorMotionNextInteractionTimingHandler = { [release] in withExtendedLifetime(release) {} }
    }
    do {
        let release = ReleaseProbe {
            precondition(owner.cursorMotionNextInteractionTimingHandler == nil)
            owner.events.append("completionReleased")
        }
        owner.cursorMotionCompletionHandler = { [release] in withExtendedLifetime(release) {} }
    }
    owner.resetCursorWindowState()
    precondition(owner.events == ["level", "motionFinished", "nextReleased", "completionReleased", "present", "visibility"])
    precondition(progress.state == .ended && owner.cursorMotionProgressAnimation == nil)
    precondition(!owner.overlayWindowLevelReasons.petLaunch)
    precondition(!owner.cursorMotionDidSatisfyNextInteractionTiming)
    precondition(owner.style.velocityX == 0 && owner.style.velocityY == 0)
    owner.events = []
    owner.resetCursorWindowState()
    precondition(owner.events.isEmpty)
    func overlay(_ enabled: Bool) {
        updateCursorAppMonitorOverlay(enabled,
            reasons: { owner.overlayWindowLevelReasons },
            setAppMonitorReason: { owner.overlayWindowLevelReasons.appMonitor = $0 },
            promote: {
                precondition(owner.overlayWindowLevelReasons.appMonitor)
                owner.events.append("promote")
            }, setLevel: { owner.setCursorWindowLevel($0) },
            updateVisibility: { owner.updateVisibility() })
    }
    overlay(true)
    precondition(owner.events == ["promote", "visibility"])
    owner.events = []
    overlay(true)
    precondition(owner.events.isEmpty)
    // A live pet launch owns the overlay across app deactivation.
    owner.overlayWindowLevelReasons.petLaunch = true
    overlay(false)
    precondition(owner.events == ["visibility"])
    owner.events = []
    overlay(true)
    precondition(owner.events == ["visibility"])
    owner.events = []
    owner.overlayWindowLevelReasons.petLaunch = false
    overlay(false)
    precondition(owner.events == ["level", "visibility"])
}


@MainActor private func runCursorAppMonitorEventChecks() {
    final class Window: CursorAppMonitorWindow {
        var isVisible = true
        var wantsToBeVisible = false
        var correspondingWindowID: UInt32? = 7
        var overlays: [Bool] = []
        var updates = 0
        func setAppMonitorOverlay(_ enabled: Bool) { overlays.append(enabled) }
        func updateVisibility() { updates += 1 }
    }
    final class Monitor: CursorAppMonitorEventStorage {
        var appIsActive = false
        var menusOpen = 0
        weak var cursorWindow: (any CursorAppMonitorWindow)?
    }
    let monitor = Monitor()
    var window: Window? = Window()
    monitor.cursorWindow = window
    func event(_ notification: AXNotification) {
        monitor.handleCursorApplicationNotification(notification) {
            preconditionFailure("Menu/unknown event read primary window")
        }
    }
    event(.menuClosed)
    precondition(monitor.menusOpen == -1 && window!.overlays == [false])
    event(.menuOpened)
    event(.menuOpened)
    monitor.applyApplicationActiveChange(true)
    event(.menuClosed)
    monitor.applyApplicationActiveChange(false)
    precondition(monitor.menusOpen == 0)
    precondition(window!.overlays == [false, false, true, true, true, false])
    event(.windowCreated)
    precondition(window!.overlays.count == 6)
    monitor.handleCursorApplicationNotification(.focusedWindowChanged) { nil }
    precondition(window!.correspondingWindowID == 7 && window!.updates == 0)
    struct ReadFailure: Error {}
    monitor.handleCursorApplicationNotification(.focusedWindowChanged) { throw ReadFailure() }
    precondition(window!.correspondingWindowID == 7)
    window!.isVisible = false
    monitor.handleCursorApplicationNotification(.focusedWindowChanged) { 8 }
    precondition(window!.correspondingWindowID == 7 && !window!.wantsToBeVisible)
    window!.isVisible = true
    monitor.handleCursorApplicationNotification(.focusedWindowChanged) { 9 }
    precondition(window!.correspondingWindowID == 9 && window!.wantsToBeVisible && window!.updates == 1)
    window = nil
    precondition(monitor.cursorWindow == nil)
    event(.menuOpened)
    monitor.applyApplicationActiveChange(true)
    precondition(monitor.menusOpen == 1 && monitor.appIsActive)
}


private func runCursorWindowOcclusionChecks() {
    for (numbers, shouldReorder) in [([10, 20], false), ([20, 10], true), ([10], false), ([20], false), ([10, 10, 20], false)] {
        var events: [String] = []
        updateCursorWindowOcclusion(isVisible: { true }, occlusionState: { 0 },
            reasons: { CursorOverlayWindowLevelReasons() }, correspondingWindowID: { 20 },
            windowNumbers: { numbers }, windowNumber: { 10 },
            restoreAssociation: { precondition($0 == 20); events.append("associate") },
            updateVisibility: { events.append("visibility") }, styleVisibilityDidChange: { events.append("style") })
        precondition(events == (shouldReorder ? ["associate", "visibility", "style"] : ["style"]))
    }
    var hookCalls = 0
    updateCursorWindowOcclusion(isVisible: { false },
        occlusionState: { preconditionFailure("Hidden window queried occlusion") },
        reasons: { preconditionFailure() }, correspondingWindowID: { preconditionFailure() },
        windowNumbers: { preconditionFailure() }, windowNumber: { preconditionFailure() },
        restoreAssociation: { _ in preconditionFailure() }, updateVisibility: { preconditionFailure() },
        styleVisibilityDidChange: { hookCalls += 1 })
    precondition(hookCalls == 1)
}


@MainActor private func runConcreteCursorPressChecks() async {
    var writes: [Bool] = []
    var sleeps = 0
    do {
        try await animateCursorPress(count: 2, isVisible: { true },
            setPressed: { writes.append($0) }, sleep: { duration in
                precondition(duration == .milliseconds(50)); sleeps += 1
            })
        precondition(writes == [true, false, true, false] && sleeps == 5)
        try await animateCursorPress(count: -1, isVisible: { false },
            setPressed: { _ in preconditionFailure() }, sleep: { _ in preconditionFailure() })
        try await animateCursorPress(count: 0, isVisible: { true },
            setPressed: { _ in preconditionFailure() }, sleep: { _ in preconditionFailure() })
    } catch { preconditionFailure("Unexpected press error: \(error)") }
    let firstStyle = ComputerUseCursorStyle()
    let replacementStyle = ComputerUseCursorStyle()
    replacementStyle.isPressed = true
    var currentStyle = firstStyle
    do {
        try await animateCursorPress(count: 1, isVisible: { true },
            setPressed: { currentStyle.isPressed = $0 }, sleep: { _ in currentStyle = replacementStyle })
        precondition(firstStyle.isPressed && !replacementStyle.isPressed)
    } catch { preconditionFailure("Style replacement press failed") }
    writes = []
    do {
        try await animateCursorPress(count: 1, isVisible: { true },
            setPressed: { writes.append($0) }, sleep: { _ in throw CancellationError() })
        preconditionFailure("Press suppressed cancellation")
    } catch is CancellationError {
        // Native error path propagates without running the later false setter.
        precondition(writes == [true])
    } catch { preconditionFailure("Wrong press error") }
}


private func runCursorHotspotScreenPointChecks() {
    let middle = cursorLinearMotionSample(start: .zero, target: CGPoint(x: 10, y: 0), position: CGPoint(x: 5, y: 100))
    precondition(middle.progress == 0.5 && abs(middle.envelope - CGFloat(pow(0.5, 0.62))) < 1e-14)
    let shifted = cursorLinearMotionSample(start: CGPoint(x: -20, y: 30), target: CGPoint(x: -10, y: 30),
        position: CGPoint(x: -15, y: -200))
    precondition(shifted.progress == middle.progress && shifted.envelope == middle.envelope)
    let before = cursorLinearMotionSample(start: .zero, target: CGPoint(x: 10, y: 0), position: CGPoint(x: -1, y: 0))
    let after = cursorLinearMotionSample(start: .zero, target: CGPoint(x: 10, y: 0), position: CGPoint(x: 11, y: 0))
    precondition(before.progress == 0 && before.envelope == 0 && after.progress == 1 && after.envelope == 0)
    let degenerate = cursorLinearMotionSample(start: .zero, target: CGPoint(x: 0.01, y: 0), position: .zero)
    precondition(degenerate.progress == 1 && degenerate.envelope == 0)
    let invalidPosition = cursorLinearMotionSample(start: .zero, target: CGPoint(x: 10, y: 0), position: CGPoint(x: CGFloat.nan, y: 0))
    precondition(invalidPosition.progress.isNaN && invalidPosition.envelope.isNaN)
    let invalidPath = cursorLinearMotionSample(start: .zero, target: CGPoint(x: CGFloat.nan, y: 0), position: .zero)
    precondition(invalidPath.progress == 1 && invalidPath.envelope == 0)
    precondition(cursorMoveNeedsTemporaryOverlay(wasVisible: false, animated: true,
        petLocationExists: true, initialAbsolute: .zero, targetAbsolute: CGPoint(x: 0, y: 1)))
    precondition(!cursorMoveNeedsTemporaryOverlay(wasVisible: false, animated: true,
        petLocationExists: true, initialAbsolute: .zero, targetAbsolute: .zero))
    precondition(!cursorMoveNeedsTemporaryOverlay(wasVisible: true, animated: true,
        petLocationExists: true, initialAbsolute: .zero, targetAbsolute: CGPoint(x: 1, y: 1)))
    precondition(!cursorMoveNeedsTemporaryOverlay(wasVisible: false, animated: false,
        petLocationExists: true, initialAbsolute: .zero, targetAbsolute: CGPoint(x: 1, y: 1)))
    precondition(!cursorMoveNeedsTemporaryOverlay(wasVisible: false, animated: true,
        petLocationExists: false, initialAbsolute: .zero, targetAbsolute: CGPoint(x: 1, y: 1)))
    for appMonitor in [false, true] {
        for temporary in [false, true] {
            var reasons = CursorOverlayWindowLevelReasons(appMonitor: appMonitor, petLaunch: temporary)
            var calls: [String] = []
            clearCursorMoveTemporaryOverlay(reasons: { reasons },
                clearTemporaryReason: { reasons.petLaunch = false; calls.append("clear") },
                setLevel: { precondition($0 == 0 && !reasons.petLaunch); calls.append("level") },
                updateVisibility: { calls.append("visibility") })
            precondition(calls == (temporary ? (appMonitor ? ["clear", "visibility"] : ["clear", "level", "visibility"]) : []))
            precondition(reasons.appMonitor == appMonitor && !reasons.petLaunch)
        }
    }
    for appMonitor in [false, true] {
        for temporary in [false, true] {
            for requested in [false, true] {
                var reasons = CursorOverlayWindowLevelReasons(appMonitor: appMonitor, petLaunch: temporary)
                var calls: [String] = []
                associateCursorWindowForMove(aboveWindowID: nil, temporaryOverlay: requested,
                    setWantsVisible: { precondition($0); calls.append("wants") },
                    setCorrespondingWindow: { precondition($0 == nil); calls.append("window") },
                    reasons: { calls.append("reasons"); return reasons },
                    setTemporaryReason: { reasons.petLaunch = true; calls.append("temporary") },
                    promote: { precondition(reasons.petLaunch); calls.append("promote") },
                    updateVisibility: { calls.append("visibility") })
                var expected = ["wants", "window"]
                if requested {
                    expected += ["reasons", "temporary"]
                    if !appMonitor && !temporary { expected.append("promote") }
                }
                expected.append("visibility")
                precondition(calls == expected && reasons.petLaunch == (temporary || requested))
            }
        }
    }
    var events: [String] = []
    var frameReads = 0
    var hotspotReads = 0
    let point = cursorHotspotScreenPoint(frame: {
        events.append("frame"); frameReads += 1
        return frameReads == 1 ? CGRect(x: 10, y: 20, width: 40, height: 50)
            : CGRect(x: 999, y: 999, width: 40, height: 80)
    }, hotspot: {
        events.append("hotspot"); hotspotReads += 1
        return hotspotReads == 1 ? CGPoint(x: 4, y: 999) : CGPoint(x: 999, y: 6)
    }, zeroScreenFrame: {
        events.append("screen"); return CGRect(x: -100, y: -20, width: 500, height: 300)
    })
    precondition(point == CGPoint(x: 14, y: 186))
    precondition(events == ["frame", "hotspot", "frame", "hotspot", "screen"])
    let absent = cursorHotspotScreenPoint(frame: { CGRect(x: 10, y: 20, width: 40, height: 50) },
        hotspot: { CGPoint(x: 4, y: 6) }, zeroScreenFrame: { nil })
    precondition(absent == CGPoint(x: 14, y: -64))
    let frame = CGRect(x: -110, y: 35, width: 20, height: 23)
    let hotspot = CGPoint(x: 4, y: 6)
    for screen in [CGRect(x: -100, y: -20, width: 500, height: 300), nil] as [CGRect?] {
        let observed = cursorHotspotScreenPoint(frame: { frame }, hotspot: { hotspot }, zeroScreenFrame: { screen })
        let restored = cursorMoveOrigin(for: observed, capturedFrame: frame,
            zeroScreenFrame: { screen }, hotspot: { hotspot })
        precondition(restored == frame.origin)
    }
    var moveReads: [String] = []
    var moveHotspotReads = 0
    let origin = cursorMoveOrigin(for: CGPoint(x: -10, y: 40), capturedFrame: frame,
        zeroScreenFrame: { moveReads.append("screen"); return CGRect(x: 0, y: -20, width: 500, height: 300) },
        hotspot: {
            moveReads.append("hotspot"); moveHotspotReads += 1
            return moveHotspotReads == 1 ? CGPoint(x: 4, y: 999) : CGPoint(x: 999, y: 6)
        })
    precondition(origin == CGPoint(x: -14, y: 223))
    precondition(moveReads == ["screen", "hotspot", "hotspot"])
    for visible in [false, true] {
        for animated in [false, true] {
            for previous in [nil, CGPoint(x: 50, y: 60)] as [CGPoint?] {
                var reads: [String] = []
                let initial = cursorMoveInitialOrigin(targetOrigin: CGPoint(x: 100, y: 200),
                    wasVisible: visible, animated: animated, petLocation: previous,
                    capturedWindowFrame: frame,
                    hotspot: { reads.append("hotspot"); return hotspot },
                    currentWindowFrame: { reads.append("frame"); return CGRect(x: 8, y: 9, width: 99, height: 99) })
                let expected = visible ? CGPoint(x: 8, y: 9)
                    : (animated && previous != nil ? CGPoint(x: 46, y: 43) : CGPoint(x: 100, y: 200))
                precondition(initial == expected)
                precondition(reads == (previous == nil ? ["frame"] : ["hotspot", "hotspot", "frame"]))
            }
        }
    }
}


private func runCursorObservedStateChecks() {
    var numbers = [5, 9]
    let id = cursorObservedWindowID { numbers.removeFirst() }
    precondition(id == 9 && numbers.isEmpty)
    numbers = [0, 9]
    precondition(cursorObservedWindowID { numbers.removeFirst() } == nil && numbers == [9])
    numbers = [5, 0]
    precondition(cursorObservedWindowID { numbers.removeFirst() } == 0 && numbers.isEmpty)
    let screen = CGRect(x: -20, y: -10, width: 500, height: 300)
    precondition(cursorCenterScreenPoint(frame: CGRect(x: 10, y: 20, width: 40, height: 60),
        zeroScreenFrame: screen) == CGPoint(x: 30, y: 240))
    precondition(cursorCenterScreenPoint(frame: CGRect(x: 10, y: 20, width: 40, height: 60),
        zeroScreenFrame: nil) == CGPoint(x: 30, y: -50))
}


@MainActor private func runCursorOrderOutChecks() async {
    var visible = false
    var events: [String] = []
    var currentDelegate = "old"
    await orderOutCursor(willHide: {
        events.append("willHide")
        await Task.yield()
        visible = true
    }, isVisible: { visible }, prepareWindow: { events.append("prepare") },
        hideAnimated: {
            events.append("animated")
            await Task.yield()
            currentDelegate = "replacement"
        }, hideImmediately: { preconditionFailure("Used pre-delegate visibility") },
        didHide: { events.append(currentDelegate) }, postDidHide: { events.append("notification") })
    precondition(events == ["willHide", "prepare", "animated", "replacement", "notification"])
    events = []
    await orderOutCursor(willHide: { visible = false }, isVisible: { visible },
        prepareWindow: { events.append("prepare") }, hideAnimated: { preconditionFailure() },
        hideImmediately: { events.append("immediate") }, didHide: { events.append("delegate") },
        postDidHide: { events.append("notification") })
    precondition(events == ["prepare", "immediate", "delegate", "notification"])
}


private func runCursorBlurFilterResetChecks() {
    final class Filter {
        let blur: Bool
        init(_ blur: Bool) { self.blur = blur }
    }
    let first = Filter(false), blur = Filter(true), last = Filter(false)
    let original = [first, blur, last, blur]
    var visits = 0
    var restored: [Filter] = []
    resetCursorBlurFilters(readFilters: { original }, isGaussianBlur: { visits += 1; return $0.blur },
        writeFilters: { restored = $0 })
    precondition(visits == 4 && original.count == 4 && restored.count == 2)
    precondition(restored[0] === first && restored[1] === last)
    var writes = 0
    resetCursorBlurFilters(readFilters: { [first, last] }, isGaussianBlur: { $0.blur },
        writeFilters: { precondition($0.count == 2); writes += 1 })
    resetCursorBlurFilters(readFilters: { [Filter]() }, isGaussianBlur: { $0.blur },
        writeFilters: { precondition($0.isEmpty); writes += 1 })
    precondition(writes == 2)
    resetCursorBlurFilters(readFilters: { nil as [Filter]? }, isGaussianBlur: { _ in preconditionFailure() },
        writeFilters: { _ in preconditionFailure() })
}


private func runLayerFilterPropertyChecks() {
    func restoreDefaults<Filter: LayerFilter.FilterConvertible>(_ type: Filter.Type) -> Filter {
        let filter = Filter()
        precondition(filter.name == Filter.name)
        precondition(Filter.Keys.allCases.map(\.rawValue).count == 3)
        return filter
    }
    final class FilterInstance: NSObject {
        var writes: [(String, Any?)] = []
        override func setValue(_ value: Any?, forKey key: String) { writes.append((key, value)) }
    }
    let instance = FilterInstance()
    let configuration = LayerFilter.GaussianBlur(radius: 7, hardEdges: false, normalizeEdges: nil)
    let created = configuration.makeFilterInstance { name in
        precondition(name == .gaussianBlur); return instance
    }
    precondition(created === instance)
    precondition(instance.writes.map { $0.0 } == ["inputRadius", "inputHardEdges", "inputNormalizeEdges"])
    precondition((instance.writes[0].1 as? NSNumber)?.doubleValue == 7)
    precondition((instance.writes[1].1 as? NSNumber)?.boolValue == false)
    precondition(instance.writes[2].1 is NSNull)
    precondition(configuration.makeFilterInstance(using: { _ in nil }) == nil)
    let defaults = restoreDefaults(LayerFilter.GaussianBlur.self)
    precondition(defaults.radius == 0 && defaults.hardEdges == nil && defaults.normalizeEdges == nil)
    precondition(defaults.name == .gaussianBlur)
    precondition(LayerFilter.Name.allCases.map(\.rawValue) == ["colorSaturate", "gaussianBlur", "luminanceCurveMap", "luminanceToAlpha", "variableBlur", "sdrNormalize", "alphaThreshold"])
    var blur = LayerFilter.GaussianBlur(radius: 7, hardEdges: nil, normalizeEdges: false)
    precondition(blur.radius == 7 && blur.hardEdges == nil && blur.normalizeEdges == false)
    blur.$radius.erased = CGFloat(3)
    precondition(blur.radius == 3)
    blur.$radius.erased = "wrong type"
    blur.$radius.erased = nil
    precondition(blur.radius == 3)
    blur.$hardEdges.erased = true
    precondition(blur.hardEdges == true)
    blur.$hardEdges.erased = nil
    precondition(blur.hardEdges == nil)
    // An Optional.none wrapped value is boxed as a present Any, not flattened.
    precondition(blur.$hardEdges.erased != nil)
    blur.$radius = LayerFilter.Property<CGFloat>(wrappedValue: -7)
    precondition(blur.radius == -7)
    let keys = LayerFilter.GaussianBlur.Keys.allCases
    precondition(keys.map(\.rawValue) == ["inputRadius", "inputHardEdges", "inputNormalizeEdges"])
    precondition(LayerFilter.GaussianBlur.Keys(rawValue: "radius") == nil)
    blur[keyPath: blur.property(for: .inputRadius)].erased = CGFloat(12)
    blur[keyPath: blur.property(for: .inputHardEdges)].erased = false
    blur[keyPath: blur.property(for: .inputNormalizeEdges)].erased = nil
    precondition(blur.radius == 12 && blur.hardEdges == false && blur.normalizeEdges == nil)
    blur.radius = .nan
    precondition(blur.radius.isNaN)
}


private func runFilterMethodSelectorChecks() {
    let salt = "215bb664fac94b9e50faca8106be4dd77fd37a73606ca79682e992187974d983dfa5a32ce4dcfa868a6f0f6b3485a79252e0a79fef79b22854f9a6bdc92d54b"
    guard let cls = NSClassFromString("CAFilter"), let meta = object_getClass(cls),
          let selector = lookUpMethodSelector(in: meta, hash: 0x51575c7f8a81acb0, salt: salt) else {
        preconditionFailure("Pinned CAFilter factory selector unavailable")
    }
    precondition(NSStringFromSelector(selector) == "filterWithName:")
    // Real platform objects only; no windows, input or layer attachment.
    let blur = LayerFilter.GaussianBlur(radius: 7, hardEdges: true, normalizeEdges: false)
    guard let instance = blur.makeFilterInstance(), let second = blur.makeFilterInstance() else {
        preconditionFailure("CAFilter gaussianBlur factory returned nil")
    }
    precondition(instance !== second)
    precondition(instance.isKind(of: cls))
    precondition((instance.value(forKey: "inputRadius") as? NSNumber)?.doubleValue == 7)
    precondition((instance.value(forKey: "inputHardEdges") as? NSNumber)?.boolValue == true)
    precondition((instance.value(forKey: "inputNormalizeEdges") as? NSNumber)?.boolValue == false)
    precondition(LayerFilter.GaussianBlur().makeFilterInstance() != nil)
    let restored = LayerFilter.GaussianBlur().populated(from: instance)
    precondition(restored.radius == 7 && restored.hardEdges == true && restored.normalizeEdges == false)
    let original = LayerFilter.GaussianBlur(radius: 19, hardEdges: false, normalizeEdges: true)
    let partial = FilterPopulationFixture()
    let populated = original.populated(from: partial)
    precondition(partial.reads == ["inputRadius", "inputHardEdges", "inputNormalizeEdges"])
    // Wrong radius type and absent hardEdges preserve the receiver's values.
    precondition(populated.radius == 19 && populated.hardEdges == false && populated.normalizeEdges == false)
    precondition(original.radius == 19 && original.hardEdges == false && original.normalizeEdges == true)
    let layer = CALayer()
    layer.setLayerFilters([blur, LayerFilter.GaussianBlur(radius: 3, hardEdges: false, normalizeEdges: true), blur])
    let applied = layer.filters as? [NSObject]
    precondition(applied?.count == 3)
    precondition(applied?.map { ($0.value(forKey: "inputRadius") as? NSNumber)?.doubleValue } == [7, 3, 7])
    precondition(applied![0] !== applied![2])
    layer.setLayerFilters([])
    precondition(layer.filters != nil && layer.filters!.isEmpty)
    let values: [any LayerFilter.FilterConvertible] = [
        LayerFilter.ColorSaturate(amount: 0.75), blur,
        LayerFilter.LuminanceCurveMap(inputValues: [0, 0.2, 0.8, 1], inputAmount: 0.5),
        LayerFilter.LuminanceToAlpha(inputPremultipliedValues: true),
        LayerFilter.VariableBlur(radius: 4, normalizeEdges: false, inputFade: true, inputSourceSublayerName: "source"),
        LayerFilter.SDRNormalize(), LayerFilter.AlphaThreshold(amount: 0.3, color: CGColor(gray: 0.25, alpha: 1))
    ]
    layer.layerFilters = values
    let roundTrip = layer.layerFilters
    precondition(roundTrip.map(\.name) == LayerFilter.Name.allCases)
    precondition((roundTrip[0] as? LayerFilter.ColorSaturate)?.amount == 0.75)
    precondition((roundTrip[2] as? LayerFilter.LuminanceCurveMap)?.inputValues == [0, 0.2, 0.8, 1])
    precondition((roundTrip[2] as? LayerFilter.LuminanceCurveMap)?.inputAmount == 0.5)
    precondition((roundTrip[3] as? LayerFilter.LuminanceToAlpha)?.inputPremultipliedValues == true)
    precondition((roundTrip[4] as? LayerFilter.VariableBlur)?.radius == 4)
    precondition((roundTrip[4] as? LayerFilter.VariableBlur)?.inputSourceSublayerName == "source")
    precondition((roundTrip[6] as? LayerFilter.AlphaThreshold)?.amount == 0.3)
    precondition((roundTrip[6] as? LayerFilter.AlphaThreshold)?.color == CGColor(gray: 0.25, alpha: 1))
    for name in LayerFilter.Name.allCases {
        precondition(name.filterType().init().name == name)
        precondition(name.filterType().init().makeFilterInstance() != nil)
    }
    precondition(LayerFilter.EmptyKeys.allCases.isEmpty)
    precondition(LayerFilter.EmptyKeys(rawValue: "anything") == nil)
    layer.filters = [NSObject(), instance, "unrecognized"]
    precondition(layer.layerFilters.map(\.name) == [.gaussianBlur])
    layer.layerFilters = []
    precondition(layer.layerFilters.isEmpty && layer.filters != nil)
    layer.layerFilters = [LayerFilter.GaussianBlur(radius: 1, hardEdges: nil, normalizeEdges: nil),
        LayerFilter.ColorSaturate(amount: 0.75),
        LayerFilter.GaussianBlur(radius: 2, hardEdges: nil, normalizeEdges: nil)]
    layer.updateFilter(LayerFilter.GaussianBlur(radius: 9, hardEdges: nil, normalizeEdges: nil), creatingIfNeeded: false)
    let updated = layer.layerFilters
    precondition(updated.map(\.name) == [.gaussianBlur, .colorSaturate, .gaussianBlur])
    precondition((updated[0] as? LayerFilter.GaussianBlur)?.radius == 9)
    precondition((updated[2] as? LayerFilter.GaussianBlur)?.radius == 2)
    let unchangedInstance = layer.filters![0] as! NSObject
    layer.updateFilter(LayerFilter.SDRNormalize(), creatingIfNeeded: false)
    precondition(layer.filters![0] as! NSObject === unchangedInstance)
    layer.updateFilter(LayerFilter.SDRNormalize(), creatingIfNeeded: true)
    precondition(layer.layerFilters.map(\.name) == [.gaussianBlur, .colorSaturate, .gaussianBlur, .sdrNormalize])
    layer.updateFilter(nil as LayerFilter.GaussianBlur?, creatingIfNeeded: true)
    precondition(layer.layerFilters.map(\.name) == [.colorSaturate, .sdrNormalize])
    layer.updateFilter(nil as LayerFilter.GaussianBlur?, creatingIfNeeded: false)
    precondition(layer.layerFilters.map(\.name) == [.colorSaturate, .sdrNormalize])
}

private final class FilterPopulationFixture: NSObject {
    var reads: [String] = []
    override func value(forKeyPath key: String) -> Any? {
        reads.append(key)
        switch key {
        case "inputRadius": return "wrong type"
        case "inputNormalizeEdges": return NSNumber(value: false)
        default: return nil
        }
    }
}

private func runCursorMotionAngleChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.clickAngle = 0
    let early = cursorTerminalDirection(CGPoint(x: 2, y: 0), progress: 0.5, configuration: configuration)
    precondition(early == CGPoint(x: 1, y: 0))
    let late = cursorTerminalDirection(CGPoint(x: 2, y: 0), progress: 0.995, configuration: configuration)
    precondition(abs(late.x - 1 / CGFloat(50).squareRoot()) < 1e-12)
    precondition(abs(late.y - 7 / CGFloat(50).squareRoot()) < 1e-12)
    let terminal = cursorTerminalDirection(CGPoint(x: 2, y: 0), progress: 1, configuration: configuration)
    precondition(terminal == CGPoint(x: 0, y: 1))
    precondition(cursorTerminalDirection(.zero, progress: 0, configuration: configuration) == terminal)
    precondition(cursorTerminalDirection(CGPoint(x: 1, y: 0), progress: .nan, configuration: configuration) == terminal)
    let cancellation = cursorTerminalDirection(CGPoint(x: 0, y: -1), progress: 0.5, configuration: configuration)
    precondition(cancellation == CGPoint(x: 0, y: -1))
    for (direction, degrees) in [(CGPoint(x: 1, y: 0), 134.0), (CGPoint(x: 0, y: 1), 44.0),
                                 (CGPoint(x: 0, y: -1), 224.0), (CGPoint(x: -1, y: 0), -46.0)] {
        precondition(abs(cursorMotionAngle(direction: direction, clickAngle: -44).degrees - degrees) < 1e-12)
    }
    precondition(cursorMotionAngle(direction: CGPoint(x: 0.0009, y: 0), clickAngle: -44) == .zero)
    precondition(abs(cursorMotionAngle(direction: CGPoint(x: 0.001, y: 0), clickAngle: -44).degrees - 134) < 1e-12)
    precondition(cursorMotionAngle(direction: CGPoint(x: CGFloat.nan, y: 1), clickAngle: -44).radians.isNaN)
    // Source length is sqrt(x*x+y*y), not overflow-resistant hypot.
    precondition(abs(cursorMotionAngle(direction: CGPoint(x: 1e300, y: 1e300), clickAngle: -44).degrees - 134) < 1e-12)
}

private func runMovingCursorAssociationChecks() {
    for appMonitor in [false, true] {
        for target in [nil, UInt32(3), UInt32(4)] as [UInt32?] {
            var reasons = CursorOverlayWindowLevelReasons(appMonitor: appMonitor, petLaunch: true)
            var calls: [String] = []
            var hotspotReads = 0
            updateMovingCursorAssociation(origin: CGPoint(x: 10, y: 20),
                reasons: { reasons }, hotspot: {
                    hotspotReads += 1
                    return hotspotReads == 1 ? CGPoint(x: 4, y: 999) : CGPoint(x: 999, y: 6)
                }, frame: { CGRect(x: 0, y: 0, width: 40, height: 50) }, windowNumber: { 12 },
                hitWindow: { point, below in
                    precondition(point == CGPoint(x: 14, y: 64) && below == 12)
                    return 3
                }, correspondingWindowID: { target },
                setReasons: { reasons = $0; calls.append("reasons") },
                setLevel: { precondition($0 == 0 && !reasons.petLaunch); calls.append("level") },
                updateVisibility: { calls.append("visibility") })
            let reached = target == 3
            precondition(reasons.appMonitor == appMonitor && reasons.petLaunch == !reached && hotspotReads == 2)
            precondition(calls == (reached ? (appMonitor ? ["reasons", "visibility"] : ["reasons", "level", "visibility"]) : ["reasons"]))
        }
    }
    updateMovingCursorAssociation(origin: .zero,
        reasons: { CursorOverlayWindowLevelReasons() },
        hotspot: { preconditionFailure("No temporary reason must skip geometry") },
        frame: { preconditionFailure() }, windowNumber: { preconditionFailure() },
        hitWindow: { _, _ in preconditionFailure() }, correspondingWindowID: { preconditionFailure() },
        setReasons: { _ in preconditionFailure() }, setLevel: { _ in preconditionFailure() },
        updateVisibility: { preconditionFailure() })
}

private func runCursorCubicPathChecks() {
    let curved = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 5, y: 6), control1: CGPoint(x: 1, y: 2), control2: CGPoint(x: 3, y: 4))
    ])
    let curvedMiddle = curved.sample(at: 0.5)
    precondition(curvedMiddle.position == CGPoint(x: 2.125, y: 3))
    precondition(curvedMiddle.tangent == CGPoint(x: 5.25, y: 6))
    precondition(curved.sample(at: 0).tangent == CGPoint(x: 3, y: 6))
    precondition(curved.sample(at: 1).tangent == CGPoint(x: 6, y: 6))
    let path = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 3, y: 0), control1: CGPoint(x: 1, y: 0), control2: CGPoint(x: 2, y: 0)),
        .init(endpoint: CGPoint(x: 3, y: 3), control1: CGPoint(x: 3, y: 1), control2: CGPoint(x: 3, y: 2))
    ])
    let first = path.sample(at: 0.25)
    precondition(first.position == CGPoint(x: 1.5, y: 0) && first.tangent == CGPoint(x: 3, y: 0))
    let join = path.sample(at: 0.5)
    precondition(join.position == CGPoint(x: 3, y: 0) && join.tangent == CGPoint(x: 0, y: 3))
    let second = path.sample(at: 0.75)
    precondition(second.position == CGPoint(x: 3, y: 1.5) && second.tangent == CGPoint(x: 0, y: 3))
    for value in [CGFloat(1), 2, .infinity, .nan] {
        precondition(path.sample(at: value).position == CGPoint(x: 3, y: 3))
    }
    for value in [CGFloat(0), -1, -CGFloat.infinity] {
        precondition(path.sample(at: value).position == .zero)
    }
}

@MainActor
private func runCursorPathBoundsChecks() {
    let left = CGRect(x: -100, y: 0, width: 100, height: 100)
    let right = CGRect(x: 0, y: 0, width: 100, height: 100)
    // Earlier screen containing target beats a later screen containing start.
    precondition(cursorPathBounds(start: CGPoint(x: 50, y: 20), target: CGPoint(x: -50, y: 20),
        correspondingWindowFrame: nil, screenFrames: { [left, right] },
        zeroScreenFrame: { preconditionFailure("No window conversion") }) == left)
    precondition(cursorPathBounds(start: CGPoint(x: 500, y: 500), target: CGPoint(x: 600, y: 600),
        correspondingWindowFrame: nil, screenFrames: { [left, right] }) == left.union(right))
    precondition(cursorPathBounds(start: .zero, target: .zero, correspondingWindowFrame: nil,
        screenFrames: { [] }).isNull)
    var conversions = 0
    let window = CGRect(x: 55, y: 66, width: -30, height: -40)
    let bounds = cursorPathBounds(start: .zero, target: .zero, correspondingWindowFrame: window,
        screenFrames: { preconditionFailure("Window branch must not enumerate planning screens") },
        zeroScreenFrame: { conversions += 1; return right })
    precondition(bounds.origin == .zero && bounds.size.width == -30 && bounds.size.height == -40)
    precondition(conversions == 1)
}

private func runCursorStraightPathChecks() {
    let configuration = ComputerUseCursorMotionConfiguration.live
    let start = CGPoint(x: 12, y: -7)
    let target = CGPoint(x: 18, y: 1)
    let path = cursorStraightPath(start: start, target: target, configuration: configuration)!
    precondition(path.start == start && path.segments.count == 1)
    precondition(path.segments[0].endpoint == target)
    precondition(path.segments[0].control1 == CGPoint(x: 14, y: -7 + 8.0 / 3.0))
    precondition(path.segments[0].control2 == CGPoint(x: 16, y: -7 + 8.0 * (2.0 / 3.0)))
    precondition(path.sample(at: 0).position == start && path.sample(at: 1).position == target)
    precondition(cursorStraightPath(start: .zero, target: CGPoint(x: 10.0.nextUp, y: 0),
        configuration: configuration) == nil)
    precondition(cursorStraightPath(start: start, target: start, configuration: configuration)!.segments[0].control1 == start)
    precondition(cursorStraightPath(start: .zero, target: CGPoint(x: CGFloat.nan, y: 0), configuration: configuration) == nil)
    var changed = configuration
    changed.straightPathDistanceThreshold = .nan
    precondition(cursorStraightPath(start: .zero, target: .zero, configuration: changed) == nil)
    changed.straightPathDistanceThreshold = .infinity
    // hypot avoids overflow from squaring large finite coordinates.
    let huge = cursorStraightPath(start: .zero, target: CGPoint(x: 1e200, y: 1e200), configuration: changed)!
    precondition(huge.segments[0].control1.x.isFinite)
}

private func runCursorPathSeedChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.clickAngle = 0
    let start = CGPoint(x: 10, y: 20)
    let target = CGPoint(x: 110, y: 20)
    let seeds = cursorPathSeeds(start: start, target: target, configuration: configuration)
    precondition(seeds.count == 2 && seeds[0].start == start)
    precondition(seeds[0].segments[0].control1 == CGPoint(x: 10, y: 68))
    precondition(seeds[0].segments[0].control2 == CGPoint(x: 110, y: -28))
    precondition(seeds[1].segments[0].control1.y == 20 + 48 * 0.65)
    configuration.startHandle = 100
    configuration.endpointHandle = 100
    let capped = cursorPathSeeds(start: .zero, target: CGPoint(x: 100, y: 0), configuration: configuration)
    precondition(capped[0].segments[0].control1.y == 90)
    let large = cursorPathSeeds(start: .zero, target: CGPoint(x: 10000, y: 0), configuration: configuration)
    precondition(large[0].segments[0].control1.y == 640)
    configuration.startHandle = .nan
    let unordered = cursorPathSeeds(start: .zero, target: CGPoint(x: 100, y: 0), configuration: configuration)
    precondition(unordered[0].segments[0].control1.y == 90)
}

private func runCursorPathCandidateChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.clickAngle = 0
    let paths = cursorPathCandidates(start: .zero, target: CGPoint(x: 100, y: 0), configuration: configuration)
    precondition(paths.count == 20)
    precondition(paths[0].segments.count == 1 && paths[1].segments.count == 1)
    let join = paths[2].segments[0].endpoint
    precondition(join == CGPoint(x: 50, y: 48 * 0.16 + 50 * 0.55))
    let opposite = paths[3].segments[0].endpoint
    precondition(opposite == CGPoint(x: 50, y: 48 * 0.16 - 50 * 0.55))
    for path in paths.dropFirst(2) {
        precondition(path.segments.count == 2)
        precondition(path.sample(at: 0).position == .zero)
        precondition(path.sample(at: 1).position == CGPoint(x: 100, y: 0))
        let first = path.segments[0]
        let second = path.segments[1]
        precondition(abs((first.endpoint.x - first.control2.x) - (second.control1.x - first.endpoint.x)) < 1e-12)
    }
    configuration.candidateCount = 3
    precondition(cursorPathCandidates(start: .zero, target: CGPoint(x: 100, y: 0), configuration: configuration).count == 3)
    configuration.candidateCount = 0
    precondition(cursorPathCandidates(start: .zero, target: .zero, configuration: configuration).isEmpty)
    configuration.candidateCount = 99
    precondition(cursorPathCandidates(start: .zero, target: .zero, configuration: configuration).count == 20)
}

private func runCursorPathMetricChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.boundsMargin = 0
    let line = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 24, y: 0), control1: CGPoint(x: 8, y: 0), control2: CGPoint(x: 16, y: 0)),
        .init(endpoint: CGPoint(x: 24, y: 24), control1: CGPoint(x: 24, y: 8), control2: CGPoint(x: 24, y: 16))
    ])
    let bounds = CGRect(x: -1, y: -1, width: 30, height: 30)
    let metrics = cursorPathMetrics(line, bounds: bounds, configuration: configuration)
    precondition(abs(metrics.length - 48) < 1e-10)
    precondition(abs(metrics.maximumTurn - .pi / 2) < 1e-10)
    precondition(abs(metrics.absoluteTurnSum - .pi / 2) < 1e-10)
    precondition(abs(metrics.squaredTurnSum - (.pi / 2) * (.pi / 2)) < 1e-10)
    precondition(metrics.staysInsideBounds)
    configuration.boundsMargin = 2
    precondition(!cursorPathMetrics(line, bounds: bounds, configuration: configuration).staysInsideBounds)
    let empty = cursorPathMetrics(CursorCubicPath(start: .zero, segments: []), bounds: bounds, configuration: configuration)
    precondition(empty.length == 0 && empty.maximumTurn == 0 && !empty.staysInsideBounds)
}

private func runCursorPathScoreChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.clickAngle = 0
    let base = CursorPathMetrics(length: 100, squaredTurnSum: 0, maximumTurn: 0,
        absoluteTurnSum: 0, staysInsideBounds: true)
    precondition(cursorPathScore(start: .zero, target: CGPoint(x: 0, y: 100), metrics: base, configuration: configuration) == 100)
    precondition(cursorPathScore(start: .zero, target: CGPoint(x: 0, y: -100), metrics: base, configuration: configuration) == 190)
    var measured = base
    measured.length = 200
    measured.squaredTurnSum = 2
    measured.maximumTurn = 3
    measured.absoluteTurnSum = 4
    measured.staysInsideBounds = false
    precondition(cursorPathScore(start: .zero, target: CGPoint(x: 0, y: 100), metrics: measured, configuration: configuration) == 1457)
    configuration.clickAngle = .nan
    precondition(cursorPathScore(start: .zero, target: CGPoint(x: 0, y: 100), metrics: base, configuration: configuration) == 190)
}

private func runCursorPathPlannerChecks() {
    let zero = CursorCubicPath(start: .zero, segments: [])
    func candidate(_ score: CGFloat, inside: Bool) -> ScoredCursorPath {
        ScoredCursorPath(path: zero, metrics: CursorPathMetrics(length: 0, squaredTurnSum: 0,
            maximumTurn: 0, absoluteTurnSum: 0, staysInsideBounds: inside), score: score)
    }
    precondition(selectCursorPath([]) == nil)
    precondition(selectCursorPath([candidate(1, inside: false), candidate(100, inside: true)])!.score == 100)
    precondition(selectCursorPath([candidate(9, inside: false), candidate(2, inside: false)])!.score == 2)
    precondition(selectCursorPath([candidate(.nan, inside: true), candidate(2, inside: true)])!.score.isNaN)
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.candidateCount = 0
    let short = planCursorPath(start: .zero, target: CGPoint(x: 3, y: 0), bounds: .null, configuration: configuration)
    precondition(short.segments.count == 1 && short.segments[0].control1 == CGPoint(x: 1, y: 0))
    configuration = .live
    let target = CGPoint(x: 400, y: 200)
    let bounds = CGRect(x: -1000, y: -1000, width: 2000, height: 2000)
    let chosen = planCursorPath(start: .zero, target: target, bounds: bounds, configuration: configuration)
    precondition(chosen.sample(at: 0).position == .zero && chosen.sample(at: 1).position == target)
    let selectedMetrics = cursorPathMetrics(chosen, bounds: bounds, configuration: configuration)
    let selectedScore = cursorPathScore(start: .zero, target: target, metrics: selectedMetrics, configuration: configuration)
    for path in cursorPathCandidates(start: .zero, target: target, configuration: configuration) {
        let metrics = cursorPathMetrics(path, bounds: bounds, configuration: configuration)
        if metrics.staysInsideBounds {
            precondition(selectedScore <= cursorPathScore(start: .zero, target: target, metrics: metrics, configuration: configuration))
        }
    }
}

@MainActor
private func runCursorProgressVelocityChecks() {
    let position = CGPoint(x: 10, y: 12)
    let previous = CGPoint(x: 7, y: 8)
    func velocity(_ tangent: CGPoint, _ progress: CGFloat, _ count: Int = 2) -> CGPoint {
        cursorProgressVelocity(tangent: tangent, segmentCount: count, progressVelocity: progress,
            position: position, previousPosition: previous)
    }
    precondition(velocity(CGPoint(x: 3, y: -4), 5) == CGPoint(x: 30, y: -40))
    precondition(velocity(CGPoint(x: 3, y: -4), -5) == CGPoint(x: -30, y: 40))
    precondition(velocity(CGPoint(x: 3, y: -4), 0) == CGPoint(x: 3, y: 4))
    precondition(velocity(CGPoint(x: CGFloat.nan, y: 1), 1) == CGPoint(x: 3, y: 4))
    precondition(velocity(CGPoint(x: 3, y: -4), 1, 0) == CGPoint(x: 3, y: 4))
    let first = ComputerUseCursorStyle()
    let second = ComputerUseCursorStyle()
    var reads = 0
    applyCursorProgressVelocity(CGPoint(x: 11, y: 22), style: {
        reads += 1
        return reads == 1 ? first : second
    })
    precondition(reads == 2 && first.velocityX == 11 && first.velocityY == 0)
    precondition(second.velocityX == 0 && second.velocityY == 22)
}

@MainActor
private func runCursorProgressMotionFrameChecks() {
    let style = SoftwareCursorStyle()
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: .live)
    let path = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 30, y: 0), control1: CGPoint(x: 10, y: 0), control2: CGPoint(x: 20, y: 0))
    ])
    window.currentInterpolatedOrigin = CGPoint(x: -3, y: -4)
    var phases: [String] = []
    window.cursorMotionNextInteractionTimingHandler = {
        precondition(window.currentInterpolatedOrigin == CGPoint(x: 30, y: 0))
        phases.append("interaction")
    }
    window.applyProgressMotionFrame(path: path, progress: 1, finished: false, updatesAngle: true,
        correspondingWindowFrame: { phases.append("lookup"); return nil },
        progressVelocity: { phases.append("velocity"); return 2 },
        afterMove: { _ in phases.append("move") })
    precondition(phases == ["lookup", "move", "interaction", "velocity"])
    precondition(style.velocityX == 60 && style.velocityY == 0)
    precondition(window.cursorMotionDidSatisfyNextInteractionTiming)
    phases = []
    window.cursorMotionNextInteractionTimingHandler = { phases.append("interaction") }
    window.cursorMotionCompletionHandler = {
        precondition(style.velocityX == 0 && style.velocityY == 0)
        phases.append("completion")
    }
    window.applyProgressMotionFrame(path: path, progress: 1, finished: true, updatesAngle: false,
        correspondingWindowFrame: { nil },
        progressVelocity: { preconditionFailure("Finished event must not read velocity") },
        afterMove: { _ in phases.append("move") })
    precondition(phases == ["move", "interaction", "completion"])
    precondition(!window.isVisible && !window.cursorMotionDidSatisfyNextInteractionTiming)
}

@MainActor
private func runCursorProgressAnimationPreparationChecks() {
    let style = SoftwareCursorStyle()
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: .live)
    var callbacks: [String] = []
    let animation = window.prepareProgressAnimation(response: 0.3, timing: .finished,
        interaction: { callbacks.append("interaction") }, completion: { callbacks.append("completion") })
    precondition(window.cursorMotionProgressAnimation === animation)
    precondition(animation.value == 0 && animation.targetValue == 1 && animation.state == .ready)
    precondition(window.cursorMotionDidSatisfyNextInteractionTiming && callbacks.isEmpty)
    window.updateCloseEnoughInteraction(progress: 1, distance: 0)
    precondition(callbacks.isEmpty)
    window.finishProgressMotion()
    precondition(callbacks == ["interaction", "completion"])
    precondition(window.cursorMotionProgressAnimation == nil)
    callbacks = []
    _ = window.prepareProgressAnimation(response: 0.4, timing: .closeEnough,
        interaction: { callbacks.append("early") }, completion: { callbacks.append("done") })
    precondition(!window.cursorMotionDidSatisfyNextInteractionTiming)
    window.updateCloseEnoughInteraction(progress: 1, distance: 0)
    precondition(callbacks == ["early"])
    window.finishProgressMotion()
    precondition(callbacks == ["early", "done"] && !window.isVisible)
}

private func runCursorSpringResponseChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.clickAngle = 0
    let path = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 0, y: 100), control1: CGPoint(x: 0, y: 33), control2: CGPoint(x: 0, y: 66))
    ])
    var metrics = CursorPathMetrics(length: 100, squaredTurnSum: 0, maximumTurn: 0,
        absoluteTurnSum: 0, staysInsideBounds: true)
    precondition(abs(cursorSpringResponse(path: path, metrics: metrics, configuration: configuration) - 0.378) < 1e-12)
    var joined = path
    joined.segments.insert(.init(endpoint: CGPoint(x: 0, y: 50), control1: .zero, control2: .zero), at: 0)
    precondition(abs(cursorSpringResponse(path: joined, metrics: metrics, configuration: configuration) - 0.3726) < 1e-12)
    var reverse = path
    reverse.segments[0].endpoint.y = -100
    precondition(abs(cursorSpringResponse(path: reverse, metrics: metrics, configuration: configuration) - 0.63) < 1e-12)
    metrics.length = 940
    metrics.squaredTurnSum = 1.25
    metrics.absoluteTurnSum = 4.39822971502571
    precondition(abs(cursorSpringResponse(path: path, metrics: metrics, configuration: configuration) - 0.684) < 1e-12)
    configuration.springResponseScaler = 0
    precondition(cursorSpringResponse(path: path, metrics: metrics, configuration: configuration) == configuration.springResponseMin)
    configuration.springResponseScaler = .nan
    precondition(cursorSpringResponse(path: path, metrics: metrics, configuration: configuration) == configuration.springResponseMax)
}

@MainActor
private func runCursorProgressEventBindingChecks() {
    var window: ComputerUseCursorWindow? = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let path = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 30, y: 0), control1: CGPoint(x: 10, y: 0), control2: CGPoint(x: 20, y: 0))
    ])
    var moves = 0
    let old = window!.prepareProgressAnimation(response: 0.3, timing: .closeEnough, interaction: nil, completion: nil)
    window!.bindProgressEvents(old, path: path, updatesAngle: false,
        correspondingWindowFrame: { nil }, afterMove: { _ in moves += 1 })
    old.eventHandler?(.retargeted(fromValue: 0, toValue: 1))
    precondition(moves == 0)
    old.eventHandler?(.valueChanged(oldValue: 0, newValue: 0.5))
    precondition(moves == 1 && window!.currentInterpolatedOrigin == CGPoint(x: 15, y: 0))
    let current = window!.prepareProgressAnimation(response: 0.3, timing: .finished, interaction: nil, completion: nil)
    old.eventHandler?(.finished(1))
    precondition(moves == 1 && window!.cursorMotionProgressAnimation === current)
    window!.bindProgressEvents(current, path: path, updatesAngle: false,
        correspondingWindowFrame: { nil }, afterMove: { _ in moves += 1 })
    current.eventHandler?(.finished(1))
    precondition(moves == 2 && window!.cursorMotionProgressAnimation == nil)
    current.eventHandler?(.valueChanged(oldValue: 0, newValue: 0.2))
    precondition(moves == 2)
    // AppKit may retain/autorelease an NSWindow beyond the local reference.
    // Do not assert immediate deallocation as a weak-capture test.
    window = nil
    old.eventHandler?(.finished(1))
    precondition(moves == 2)
}

@MainActor
private func runCursorDrivenProgressChecks() {
    final class Driver: AnimationDriver {
        override func start() { isActive = true }
        override func stop() { isActive = false }
    }
    final class Source: AnimationDriverSource {
        let driver = Driver()
        func makeAnimationDriver() -> AnimationDriver { driver }
    }
    let source = Source()
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let target = CGPoint(x: 300, y: 200)
    let bounds = CGRect(x: -1000, y: -1000, width: 2000, height: 2000)
    var interactions = 0, completions = 0, moves = 0
    let animation = window.startPathProgressMotion(start: .zero, target: target, bounds: bounds,
        updatesAngle: true, timing: .closeEnough, correspondingWindowFrame: { nil },
        interaction: { interactions += 1 }, completion: { completions += 1 },
        afterMove: { _ in moves += 1 }, enqueue: { animation, owner in
            precondition(owner === window && owner.cursorMotionProgressAnimation === animation)
            precondition(animation.eventHandler != nil && owner.cursorMotionCompletionHandler != nil)
            precondition(owner.style.angle.radians.isFinite)
            animation.start(drivenBy: source)
        })
    precondition(source.driver.isActive)
    for frame in 0..<2400 {
        source.driver.frameCallback?(AnimationUpdate(timestamp: Double(frame) / 240, duration: 1.0 / 240))
        if !source.driver.isActive { break }
    }
    precondition(animation.state == .ended && animation.value == 1)
    precondition(window.currentInterpolatedOrigin == target && moves > 1)
    precondition(interactions == 1 && completions == 1)
    precondition(window.cursorMotionProgressAnimation == nil && !source.driver.isActive)
    precondition(window.style.velocityX == 0 && window.style.velocityY == 0 && !window.isVisible)
    AnimationCoordinator.shared.remove(driverSource: source)
}

@MainActor
private func runCursorInitialMotionAngleChecks() {
    let style = SoftwareCursorStyle()
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: .live)
    let path = CursorCubicPath(start: .zero, segments: [
        .init(endpoint: CGPoint(x: 30, y: 0), control1: CGPoint(x: 10, y: 0), control2: CGPoint(x: 20, y: 0))
    ])
    style.angle = .degrees(7)
    window.prepareInitialMotionAngle(path: path, updatesAngle: false)
    precondition(style.angle.degrees == 7)
    window.prepareInitialMotionAngle(path: path, updatesAngle: true)
    precondition(abs(style.angle.degrees - 134) < 1e-10)
    precondition(window.cursorMotionProgressAnimation == nil && !window.isVisible)
}

@MainActor
private func runCursorScootGeometryChecks() {
    let configuration = ComputerUseCursorMotionConfiguration.live
    let horizontal = cursorScootGeometry(start: .zero, target: CGPoint(x: 10, y: 0),
        currentAngle: .degrees(450), configuration: configuration)
    precondition(horizontal.direction == CGPoint(x: 1, y: 0))
    precondition(abs(horizontal.baseRotationOffset - 90) < 1e-10)
    let reverse = cursorScootGeometry(start: CGPoint(x: 10, y: 20), target: CGPoint(x: 7, y: 16),
        currentAngle: .degrees(-181), configuration: configuration)
    precondition(reverse.direction == CGPoint(x: -0.6, y: -0.8))
    precondition(abs(reverse.baseRotationOffset - 179) < 1e-10)
    let coincident = cursorScootGeometry(start: .zero, target: .zero,
        currentAngle: .zero, configuration: configuration)
    precondition(abs(coincident.direction.x - sin(configuration.clickAngle * .pi / 180)) < 1e-12)
    let style = SoftwareCursorStyle()
    style.angle = .degrees(45)
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: configuration)
    let geometry = window.prepareScootGeometry(start: .zero, target: CGPoint(x: 0, y: 1))
    precondition(abs(window.cursorScootBaseRotationOffset - 45) < 1e-10)
    precondition(geometry.direction == CGPoint(x: 0, y: 1) && !window.isVisible)
}

@MainActor
private func runCursorScootPreparationChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let start = CGPoint(x: 12, y: 23), target = CGPoint(x: 24, y: 31)
    var callbacks: [String] = []
    let animation = window.prepareScootPositionAnimation(start: start, target: target, timing: .finished,
        interaction: { callbacks.append("interaction") }, completion: { callbacks.append("completion") })
    precondition(window.cursorScootPositionAnimation === animation)
    precondition(window.cursorMotionProgressAnimation == nil)
    precondition(animation.value == start && animation.targetValue == target && animation.state == .ready)
    precondition(window.cursorMotionDidSatisfyNextInteractionTiming)
    window.updateCloseEnoughInteraction(progress: 1, distance: 0)
    precondition(callbacks.isEmpty)
    let replacement = window.prepareScootPositionAnimation(start: target, target: start, timing: .closeEnough,
        interaction: { callbacks.append("early") }, completion: { callbacks.append("done") })
    precondition(window.cursorScootPositionAnimation === replacement && animation.state == .ready)
    precondition(!window.cursorMotionDidSatisfyNextInteractionTiming)
    window.updateCloseEnoughInteraction(progress: 1, distance: 0)
    precondition(callbacks == ["early"])
    window.cursorMotionCompletionHandler?()
    precondition(callbacks == ["early", "done"] && !window.isVisible)
    window.resetCursorWindowState()
}

@MainActor
private func runCursorScootFinishChecks() {
    let style = SoftwareCursorStyle()
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: .live)
    let target = CGPoint(x: 10.5, y: -2.5)
    let progress = SpringAnimation<CGFloat>(.smooth, initialValue: 0, targetValue: 1)
    window.cursorMotionProgressAnimation = progress
    var callbacks: [String] = []
    let replacement = SpringAnimation<CGPoint>(.smooth, initialValue: .zero, targetValue: target)
    window.cursorMotionNextInteractionTimingHandler = {
        callbacks.append("interaction")
        window.cursorScootPositionAnimation = replacement
        window.cursorMotionCompletionHandler = {
            precondition(window.currentInterpolatedOrigin == target)
            precondition(window.frame.origin == CGPoint(x: 111, y: 398))
            precondition(window.cursorScootPositionAnimation == nil)
            precondition(window.cursorMotionNextInteractionTimingHandler == nil)
            precondition(!window.cursorMotionDidSatisfyNextInteractionTiming)
            precondition(style.velocityX == 0 && style.velocityY == 0)
            callbacks.append("replacementCompletion")
        }
    }
    window.cursorMotionCompletionHandler = { preconditionFailure("Stale completion") }
    style.velocityX = 5
    style.velocityY = 8
    window.finishScootMotion(target: target,
        correspondingWindowFrame: CGRect(x: 100, y: 200, width: 300, height: 400),
        zeroScreenFrame: { CGRect(x: 0, y: 0, width: 1000, height: 1000) })
    precondition(callbacks == ["interaction", "replacementCompletion"])
    precondition(window.cursorMotionProgressAnimation === progress)
    precondition(replacement.state == .ready && !window.isVisible)
}

private func runCursorScootAxisGeometryChecks() {
    let configuration = ComputerUseCursorMotionConfiguration.live
    for (point, degrees, pivot) in [
        (CGPoint(x: 1, y: 0), CGFloat(0), CGFloat(1)),
        (CGPoint(x: -1, y: 0), CGFloat(0), CGFloat(0)),
        (CGPoint(x: 0, y: 1), CGFloat(90), CGFloat(1)),
        (CGPoint(x: 0, y: -1), CGFloat(90), CGFloat(0))
    ] {
        let result = cursorScootAxisGeometry(direction: point, configuration: configuration)
        precondition(abs(result.degrees - degrees) < 1e-10 && result.pivotX == pivot)
    }
    let diagonal = cursorScootAxisGeometry(direction: CGPoint(x: -1, y: -1), configuration: configuration)
    precondition(abs(diagonal.degrees - 45) < 1e-10 && diagonal.pivotX == 0)
    for point in [CGPoint.zero, CGPoint(x: CGFloat.nan, y: 1)] {
        let result = cursorScootAxisGeometry(direction: point, configuration: configuration)
        precondition(result.degrees == 0 && result.pivotX == configuration.scootStretchPivotX)
    }
}

private func runCursorScootShapeTargetChecks() {
    let configuration = ComputerUseCursorMotionConfiguration.live
    let idle = cursorScootShapeTargets(envelope: 0, direction: CGPoint(x: 1, y: 0), axisPivotX: 1, configuration: configuration)
    precondition(idle.scale == 1 && idle.xScale == 1 && idle.pivotX == 0.5 && idle.tiltDegrees == 0)
    let peak = cursorScootShapeTargets(envelope: 1, direction: CGPoint(x: 1, y: 0), axisPivotX: 1, configuration: configuration)
    precondition(abs(peak.scale - 0.82) < 1e-12 && peak.xScale == 1.38 && peak.pivotX == 1 && peak.tiltDegrees == 57)
    let half = cursorScootShapeTargets(envelope: 0.5, direction: CGPoint(x: 0, y: 1), axisPivotX: 0, configuration: configuration)
    precondition(half.pivotX == 0.25 && abs(half.tiltDegrees - 23.56) < 1e-12)
    let saturated = cursorScootShapeTargets(envelope: 1, direction: CGPoint(x: -1, y: -1), axisPivotX: 0, configuration: configuration)
    precondition(saturated.tiltDegrees == -76)
    let unordered = cursorScootShapeTargets(envelope: 1, direction: CGPoint(x: CGFloat.nan, y: 0), axisPivotX: 1, configuration: configuration)
    precondition(unordered.tiltDegrees.isNaN)
}

@MainActor
private func runCursorScootStretchAnimationChecks() {
    let style = SoftwareCursorStyle()
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: .live)
    var enqueues = 0
    let enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = { animation, owner in
        enqueues += 1
        precondition(owner === window && owner.cursorScootStretchAnimation === animation)
        precondition(animation.eventHandler != nil)
    }
    let first = window.updateScootStretch(scale: 0.8, xScale: 1.3, pivotX: 1, enqueue: enqueue)
    precondition(first.value == 1 && first.targetValue == 0.8 && enqueues == 1)
    precondition(style.scootStretchXScale == 1.3 && window.cursorScootStretchXScale == 1.3)
    precondition(style.scootStretchPivotX == 1 && window.cursorScootStretchPivotX == 1)
    let reused = window.updateScootStretch(scale: 0.7, xScale: 1.2, pivotX: 0, enqueue: enqueue)
    precondition(first === reused && enqueues == 1 && first.targetValue == 0.7)
    first.eventHandler?(.valueChanged(oldValue: 1, newValue: -0.5))
    precondition(style.scootStretchScale == 0 && window.cursorScootStretchScale == 0)
    first.eventHandler?(.finished(1.5))
    precondition(style.scootStretchScale == 1 && window.cursorScootStretchAnimation === first)
    first.state = .ended
    let next = window.updateScootStretch(scale: 0.6, xScale: 1, pivotX: 0.5, enqueue: enqueue)
    precondition(next !== first && enqueues == 2)
    first.eventHandler?(.valueChanged(oldValue: 1, newValue: 0.3))
    precondition(style.scootStretchScale == 1)
    next.eventHandler?(.valueChanged(oldValue: 1, newValue: CGFloat.nan))
    precondition(style.scootStretchScale.isNaN && window.cursorScootStretchScale.isNaN)
    precondition(!window.isVisible)
}

@MainActor
private func runCursorScootTiltAnimationChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    window.cursorScootBaseRotationOffset = 15
    var enqueues = 0
    let enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = { animation, owner in
        enqueues += 1
        precondition(owner === window && owner.cursorScootRotationAnimation === animation)
    }
    let first = window.updateScootTilt(degrees: 30, enqueue: enqueue)
    precondition(first.value == 0 && first.targetValue == 30 && enqueues == 1)
    first.eventHandler?(.valueChanged(oldValue: 0, newValue: 30))
    precondition(window.cursorScootRotationOffset == 30)
    precondition(abs(window.style.angle.degrees - 15) < 1e-10)
    precondition(abs(window.style.scootTiltAngle.degrees - 30) < 1e-10)
    let reused = window.updateScootTilt(degrees: -40, enqueue: enqueue)
    precondition(reused === first && first.targetValue == -40 && enqueues == 1)
    first.eventHandler?(.finished(120))
    precondition(window.cursorScootRotationOffset == 120)
    first.state = .ended
    let next = window.updateScootTilt(degrees: 0, enqueue: enqueue)
    precondition(next !== first && next.value == 120 && enqueues == 2)
    first.eventHandler?(.finished(5))
    precondition(window.cursorScootRotationOffset == 120 && !window.isVisible)
}

@MainActor
private func runCursorScootAngleSpringChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    window.cursorScootBaseRotationOffset = 170
    window.cursorScootAxisRotation = 170
    var enqueues = 0
    let enqueue: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = { _, _ in enqueues += 1 }
    let base = window.updateScootBaseRotation(degrees: -170, enqueue: enqueue)
    let axis = window.updateScootAxis(degrees: -170, enqueue: enqueue)
    precondition(base.value == 170 && base.targetValue == 190)
    precondition(axis.value == 170 && axis.targetValue == 190 && enqueues == 2)
    base.eventHandler?(.finished(190))
    axis.eventHandler?(.finished(190))
    precondition(window.cursorScootBaseRotationOffset == 190 && window.cursorScootAxisRotation == 190)
    precondition(abs(window.style.angle.degrees - 190) < 1e-10)
    precondition(abs(window.style.scootStretchAngle.degrees - 190) < 1e-10)
    precondition(window.updateScootBaseRotation(degrees: 0, enqueue: enqueue) === base)
    precondition(window.updateScootAxis(degrees: 0, enqueue: enqueue) === axis)
    precondition(base.targetValue == 360 && axis.targetValue == 360 && enqueues == 2)
    base.state = .ended
    axis.state = .ended
    let nextBase = window.updateScootBaseRotation(degrees: 0, enqueue: enqueue)
    let nextAxis = window.updateScootAxis(degrees: 0, enqueue: enqueue)
    precondition(nextBase !== base && nextAxis !== axis && enqueues == 4)
    base.eventHandler?(.finished(5))
    axis.eventHandler?(.finished(5))
    precondition(window.cursorScootBaseRotationOffset == 190 && window.cursorScootAxisRotation == 190)
    precondition(!window.isVisible)
}

@MainActor
private func runCursorScootFrameChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let target = CGPoint(x: 30, y: 0)
    var events: [String] = []
    let animation = window.prepareScootPositionAnimation(start: .zero, target: target, timing: .closeEnough,
        interaction: { events.append("interaction") }, completion: { events.append("completion") })
    window.bindScootEvents(animation, start: .zero, target: target, direction: CGPoint(x: 1, y: 0),
        correspondingWindowFrame: { nil }, afterMove: { _ in events.append("move") },
        enqueueAuxiliary: { _, _ in events.append("auxiliary") })
    animation.eventHandler?(.valueChanged(oldValue: .zero, newValue: CGPoint(x: 15, y: 0)))
    precondition(events == ["move", "auxiliary", "auxiliary", "auxiliary"])
    precondition(window.currentInterpolatedOrigin == CGPoint(x: 15, y: 0))
    precondition(window.style.scootStretchXScale > 1 && window.style.velocityX == 0)
    events = []
    animation.eventHandler?(.valueChanged(oldValue: CGPoint(x: 15, y: 0), newValue: target))
    precondition(events == ["move", "interaction"])
    events = []
    animation.eventHandler?(.finished(target))
    precondition(events == ["move", "completion"])
    precondition(window.cursorScootPositionAnimation == nil && window.currentInterpolatedOrigin == target)
    precondition(window.cursorScootAxisAnimation == nil && window.cursorScootStretchAnimation == nil)
    precondition(window.cursorScootRotationAnimation == nil && !window.isVisible)
    animation.eventHandler?(.valueChanged(oldValue: target, newValue: .zero))
    precondition(window.currentInterpolatedOrigin == target)
}

@MainActor
private func runCursorDrivenScootChecks() {
    final class Driver: AnimationDriver {
        override func start() { isActive = true }
        override func stop() { isActive = false }
    }
    final class Source: AnimationDriverSource {
        let driver = Driver()
        func makeAnimationDriver() -> AnimationDriver { driver }
    }
    let source = Source()
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let target = CGPoint(x: 20, y: 10)
    var interactions = 0, completions = 0, moves = 0
    var startup: [String] = []
    let animation = window.startScootMotion(start: .zero, target: target, timing: .closeEnough,
        correspondingWindowFrame: { nil }, interaction: { interactions += 1 }, completion: { completions += 1 },
        afterMove: { _ in moves += 1 }, enqueueAuxiliary: { animation, _ in
            startup.append("auxiliary")
            animation.start(drivenBy: source)
        }, enqueuePosition: { animation, owner in
            precondition(owner.cursorScootPositionAnimation === animation && animation.eventHandler != nil)
            startup.append("position")
            animation.start(drivenBy: source)
        })
    precondition(startup == ["auxiliary", "auxiliary", "position"])
    for frame in 0..<2400 {
        source.driver.frameCallback?(AnimationUpdate(timestamp: Double(frame) / 240, duration: 1.0 / 240))
        if !source.driver.isActive { break }
    }
    precondition(animation.state == .ended && animation.value == target && moves > 1)
    precondition(interactions == 1 && completions == 1)
    precondition(window.currentInterpolatedOrigin == target && window.cursorScootPositionAnimation == nil)
    precondition(window.cursorScootBaseRotationAnimation == nil && window.cursorScootAxisAnimation == nil)
    precondition(window.cursorScootStretchAnimation == nil && window.cursorScootRotationAnimation == nil)
    precondition(!source.driver.isActive && !window.isVisible)
    AnimationCoordinator.shared.remove(driverSource: source)
}

@MainActor
private func runCursorMotionStartupChecks() {
    var configuration = ComputerUseCursorMotionConfiguration.live
    configuration.scootDistanceThreshold = 10
    for (distance, expectsScoot) in [(CGFloat(10), true), (CGFloat(10).nextUp, false)] {
        let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: configuration)
        var phases: [String] = []
        window.startCursorMotion(start: .zero, target: CGPoint(x: distance, y: 0), initialWindowFrame: nil,
            timing: .finished, correspondingWindowFrame: { nil }, interaction: nil, completion: nil,
            screenFrames: { phases.append("bounds"); return [CGRect(x: -100, y: -100, width: 1000, height: 1000)] },
            afterMove: { _ in phases.append("move") },
            enqueueScalar: { _, _ in phases.append("scalar") },
            enqueuePosition: { _, _ in phases.append("position") })
        precondition(phases.first == "bounds")
        precondition(phases == (expectsScoot ? ["bounds", "scalar", "scalar", "position"] : ["bounds", "scalar"]))
        precondition((window.cursorScootPositionAnimation != nil) == expectsScoot)
        precondition((window.cursorMotionProgressAnimation != nil) == !expectsScoot)
        precondition(!window.isVisible)
        window.resetCursorWindowState()
    }
}

@MainActor
private func runHostedPetLocationChecks() {
    HostedPetLocation.clear()
    precondition(HostedPetLocation.point == nil)
    var replies = 0
    HostedPetLocation.set(x: 12, y: 34, available: true) { error in
        precondition(error == nil && HostedPetLocation.point == CGPoint(x: 12, y: 34))
        replies += 1
    }
    let initial = cursorMoveInitialOrigin(targetOrigin: .zero, wasVisible: false, animated: true,
        petLocation: HostedPetLocation.point, capturedWindowFrame: CGRect(x: 0, y: 0, width: 20, height: 30),
        hotspot: { CGPoint(x: 4, y: 4) }, currentWindowFrame: { .zero })
    precondition(initial == CGPoint(x: 8, y: 8))
    precondition(HostedPetLocation.point == CGPoint(x: 12, y: 34))
    HostedPetLocation.set(x: 99, y: 88, available: false) { error in
        precondition(error == nil && HostedPetLocation.point == nil)
        replies += 1
    }
    precondition(replies == 2)
    HostedPetLocation.set(x: 1, y: 2, available: true) { _ in }
    HostedPetLocation.clear()
    precondition(HostedPetLocation.point == nil)
}

@MainActor
private func runCursorImmediateMoveChecks() {
    let style = SoftwareCursorStyle()
    let window = ComputerUseCursorWindow(style: style, motionConfiguration: .live)
    let initial = CGPoint(x: 1, y: 2)
    let absolute = CGPoint(x: 10.5, y: -2.5)
    window.currentInterpolatedOrigin = initial
    var phases: [String] = []
    var requestedOrigin: CGPoint?
    window.completeImmediateMove(initialRelative: initial, targetRelative: CGPoint(x: 5, y: 6),
        targetAbsolute: absolute, bounds: {
            precondition(requestedOrigin == absolute)
            phases.append("bounds")
            return CGRect(x: -100, y: -100, width: 1000, height: 1000)
        }, updatesAngle: true, interaction: {
            precondition(requestedOrigin == absolute && window.currentInterpolatedOrigin == initial)
            phases.append("interaction")
        }, completion: { phases.append("completion") }, setAbsoluteOrigin: { point in
            requestedOrigin = point
            window.setFrameOrigin(point)
        })
    precondition(phases == ["bounds", "interaction", "completion"])
    precondition(abs(style.angle.degrees) < 1e-10)
    precondition(window.cursorMotionProgressAnimation == nil && window.cursorScootPositionAnimation == nil)
    precondition(!window.isVisible)
}

private func runCursorMoveWindowHitTestChecks() {
    let first = CGPoint(x: 10, y: 20), second = CGPoint(x: 100, y: 200)
    var calls: [String] = [], points: [CGPoint] = []
    var hotspotReads = 0, frameReads = 0
    func run(_ id: UInt32?, hits: [Int]) -> Bool {
        calls = []; points = []; hotspotReads = 0; frameReads = 0
        return cursorMoveEndpointsMissWindow(firstOrigin: first, secondOrigin: second, correspondingWindowID: id,
            hotspot: {
                calls.append("hotspot"); hotspotReads += 1
                return CGPoint(x: hotspotReads <= 2 ? 4 : 8, y: hotspotReads <= 2 ? 6 : 10)
            }, frame: {
                calls.append("frame"); frameReads += 1
                return CGRect(x: 0, y: 0, width: 20, height: frameReads == 1 ? 30 : 40)
            }, hitTest: { point in
                calls.append("hit"); points.append(point)
                return hits[points.count - 1]
            })
    }
    precondition(!run(nil, hits: []) && calls.isEmpty)
    precondition(!run(7, hits: [7]))
    precondition(calls == ["hotspot", "frame", "hotspot", "hit"])
    precondition(points == [CGPoint(x: 14, y: 44)])
    precondition(!run(7, hits: [8, 7]))
    precondition(points == [CGPoint(x: 14, y: 44), CGPoint(x: 108, y: 230)])
    precondition(run(7, hits: [8, 9]) && hotspotReads == 4 && frameReads == 2)
}

private func runCursorMoveAnimationDecisionChecks() {
    for animated in [false, true] {
        for visible in [false, true] {
            for screen in [false, true] {
                for wasVisible in [false, true] {
                    for equal in [false, true] {
                        for miss in [false, true] {
                            var calls: [String] = []
                            let result = cursorMoveShouldAnimate(animated: animated, wasVisible: wasVisible,
                                initialAbsolute: .zero, targetAbsolute: equal ? .zero : CGPoint(x: 1, y: 0),
                                isVisible: { calls.append("visible"); return visible },
                                hasScreen: { calls.append("screen"); return screen },
                                endpointsMissWindow: { calls.append("hit"); return miss })
                            precondition(result == (animated && visible && screen && (wasVisible || !equal) && !miss))
                            var expected: [String] = []
                            if animated {
                                expected.append("visible")
                                if visible {
                                    expected.append("screen")
                                    if screen && (wasVisible || !equal) { expected.append("hit") }
                                }
                            }
                            precondition(calls == expected)
                        }
                    }
                }
            }
        }
    }
}

@MainActor
private func runCursorAnimatedAppearanceChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let layer = window.contentViewController!.view.layer!
    window.alphaValue = 0
    layer.layerFilters = [LayerFilter.GaussianBlur(radius: 7, hardEdges: nil, normalizeEdges: nil)]
    window.prepareAnimatedMoveAppearance(wasVisible: true)
    precondition(window.alphaValue == 0)
    precondition((layer.layerFilters.first as? LayerFilter.GaussianBlur)?.radius == 7)
    window.prepareAnimatedMoveAppearance(wasVisible: false)
    precondition(window.alphaValue == 1)
    precondition((layer.layerFilters.first as? LayerFilter.GaussianBlur)?.radius == 0)
    window.contentViewController = nil
    window.alphaValue = 0
    window.prepareAnimatedMoveAppearance(wasVisible: false)
    precondition(window.alphaValue == 1 && !window.isVisible)
}

@MainActor
private func runCursorWindowMoveGeometryChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    HostedPetLocation.set(x: 50, y: 60, available: true) { _ in }
    let result = window.prepareWindowMoveGeometry(point: CGPoint(x: 100, y: 200), aboveWindowID: 7,
        relativeToWindow: false, animated: true,
        windowFrame: { _ in preconditionFailure("No relative window lookup") },
        zeroScreenFrame: { CGRect(x: 0, y: 0, width: 1000, height: 1000) })
    precondition(!result.wasVisible && result.petLocation == CGPoint(x: 50, y: 60))
    precondition(result.initialAbsolute.x == 46 && result.targetAbsolute.x == 96)
    precondition(result.relativeOrigins.initial == result.initialAbsolute)
    precondition(result.relativeOrigins.target == result.targetAbsolute)
    precondition(window.currentInterpolatedOrigin == result.relativeOrigins.initial)
    var lookups: [UInt32] = []
    let relative = window.prepareWindowMoveGeometry(point: CGPoint(x: 100, y: 200), aboveWindowID: 7,
        relativeToWindow: true, animated: false, windowFrame: { id in
            lookups.append(id); return CGRect(x: 10, y: 20, width: 300, height: 400)
        }, zeroScreenFrame: { CGRect(x: 0, y: 0, width: 1000, height: 1000) })
    precondition(lookups == [7] && relative.relativeOrigins.initial == relative.relativeOrigins.target)
    precondition(relative.relativeOrigins.target.x == relative.targetAbsolute.x - 10)
    precondition(relative.relativeOrigins.target.y == relative.targetAbsolute.y - 580)
    precondition(!window.isVisible && HostedPetLocation.point == CGPoint(x: 50, y: 60))
    HostedPetLocation.clear()
}

@MainActor
private func runCursorWindowMoveChecks() {
    final class Driver: AnimationDriver {
        override func start() { isActive = true }
        override func stop() { isActive = false }
    }
    final class Source: AnimationDriverSource {
        let driver = Driver()
        func makeAnimationDriver() -> AnimationDriver { driver }
    }
    let source = Source()
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    var env = CursorWindowMoveEnvironment()
    var phases: [String] = []
    env.associate = { owner, id, temporary in
        phases.append(temporary ? "temporaryAssociation" : "association")
        owner.wantsToBeVisible = true
        owner.correspondingWindowID = id
    }
    env.isVisible = { _ in true }
    env.hasScreen = { _ in true }
    env.screenFrames = { [CGRect(x: 0, y: 0, width: 1000, height: 1000)] }
    env.zeroScreenFrame = { CGRect(x: 0, y: 0, width: 1000, height: 1000) }
    env.enqueueScalar = { animation, _ in phases.append("scalar"); animation.start(drivenBy: source) }
    env.enqueuePosition = { animation, _ in phases.append("position"); animation.start(drivenBy: source) }
    env.afterMove = { _ in }
    HostedPetLocation.clear()
    let immediate = window.move(to: CGPoint(x: 100, y: 200), aboveWindowID: nil, relativeToWindow: false,
        animated: false, timing: .finished, interaction: { phases.append("interaction") },
        completion: { phases.append("completion") }, environment: env)
    precondition(!immediate && phases == ["association", "interaction", "completion"])
    phases = []
    HostedPetLocation.set(x: 50, y: 60, available: true) { _ in }
    // Fixture screen conversion uses1000 rather than live desktop inventory.
    let expectedTarget = CGPoint(x: 196, y: 1000 - 300 - window.frame.height + 4)
    let started = window.move(to: CGPoint(x: 200, y: 300), aboveWindowID: nil, relativeToWindow: false,
        animated: true, timing: .closeEnough, interaction: { phases.append("interaction") },
        completion: { phases.append("completion") }, environment: env)
    precondition(started && phases == ["temporaryAssociation", "scalar"])
    for frame in 0..<2400 {
        source.driver.frameCallback?(AnimationUpdate(timestamp: Double(frame) / 240, duration: 1.0 / 240))
        if !source.driver.isActive { break }
    }
    precondition(phases == ["temporaryAssociation", "scalar", "interaction", "completion"])
    precondition(window.currentInterpolatedOrigin == expectedTarget && !window.isVisible)
    precondition(!source.driver.isActive && window.cursorMotionProgressAnimation == nil)
    HostedPetLocation.clear()
    AnimationCoordinator.shared.remove(driverSource: source)
}

@MainActor
private func runCursorOwnerWindowMoveChecks() async {
    let owner = ComputerUseCursor(style: SoftwareCursorStyle(), motionConfiguration: .live)
    var env = CursorWindowMoveEnvironment()
    var associations = 0
    env.associate = { window, id, _ in
        associations += 1
        window.wantsToBeVisible = true
        window.correspondingWindowID = id
    }
    env.zeroScreenFrame = { CGRect(x: 0, y: 0, width: 1000, height: 1000) }
    env.screenFrames = { [CGRect(x: 0, y: 0, width: 1000, height: 1000)] }
    env.enqueueScalar = { _, _ in preconditionFailure("Immediate move enqueued scalar") }
    env.enqueuePosition = { _, _ in preconditionFailure("Immediate move enqueued position") }
    HostedPetLocation.clear()
    owner.isMoving = true
    let started = await owner.moveWindowAndWaitForInteraction(to: CGPoint(x: 100, y: 200), aboveWindowID: nil,
        relativeToWindow: false, animated: false, timing: .closeEnough, isDelegate: false, environment: env)
    precondition(!started && !owner.isMoving && associations == 1)
    owner.isMoving = true
    let delegated = await owner.moveWindowAndWaitForInteraction(to: CGPoint(x: 120, y: 220), aboveWindowID: nil,
        relativeToWindow: false, animated: false, timing: .finished, isDelegate: true, environment: env)
    precondition(!delegated && owner.isMoving && associations == 2)
    precondition(!owner.window.isVisible)
}

@MainActor
private func runCursorFadeInPhaseChecks() {
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let controller = NSViewController()
    controller.view = NSView(frame: NSRect(x: 0, y: 0, width: 32, height: 32))
    controller.view.wantsLayer = true
    window.contentViewController = controller
    let layer = controller.view.layer!
    layer.layerFilters = [LayerFilter.GaussianBlur(radius: 7, hardEdges: nil, normalizeEdges: nil),
        LayerFilter.ColorSaturate()]
    window.alphaValue = 0.6
    window.prepareFadeIn()
    precondition(!window.isVisible && window.alphaValue == 0)
    precondition((layer.layerFilters.first as? LayerFilter.GaussianBlur)?.radius == 0)
    precondition(layer.layerFilters.last is LayerFilter.ColorSaturate)
    let animation = layer.animation(forKey: "cursorBlurTransition") as! CABasicAnimation
    precondition((animation.fromValue as? NSNumber)?.doubleValue == 7)
    precondition((animation.toValue as? NSNumber)?.doubleValue == 0)
    precondition(animation.duration == 0.44)
    // Simulate only delivery of the completion, not successful AppKit timing.
    window.alphaValue = 0.75
    var resumed = false
    window.completeFadeIn {
        precondition(layer.layerFilters.count == 1)
        precondition(layer.layerFilters.first is LayerFilter.ColorSaturate)
        precondition(window.alphaValue == 0.75 && !window.isVisible)
        resumed = true
    }
    precondition(resumed)
    window.contentViewController = nil
    window.prepareFadeIn()
    window.completeFadeIn { precondition(window.alphaValue == 0) }
}

@MainActor
private func runCursorOwnerMoveChecks() async {
    for started in [false, true] {
        for animated in [false, true] {
            for fadeIn in [false, true] {
                for visible in [false, true] {
                    let expected = started ? false : (visible ? false : (animated || fadeIn))
                    precondition(cursorMoveRequiresFadeIn(started: started, animated: animated,
                        fadeIn: fadeIn, wasVisible: visible) == expected)
                }
            }
        }
    }
    final class Delegate: ComputerUseCursorDelegate {
        var phases: [String] = []
        func computerUseCursorWillMove(_ cursor: ComputerUseCursor, to point: CGPoint,
            aboveWindowID: UInt32?, animated: Bool) async {
            precondition(cursor.targetWindowID == 7 && !cursor.isMoving)
            phases.append("delegate")
        }
        func computerUseCursorWillHide(_ cursor: ComputerUseCursor) async {}
        func computerUseCursorDidHide(_ cursor: ComputerUseCursor) {}
        func computerUseCursorDidMove(_ cursor: ComputerUseCursor) {}
    }
    let owner = ComputerUseCursor(style: SoftwareCursorStyle(), motionConfiguration: .live)
    let delegate = Delegate()
    owner.delegate = delegate
    var env = CursorWindowMoveEnvironment()
    env.associate = { window, id, _ in
        precondition(owner.isMoving)
        delegate.phases.append("associate")
        window.correspondingWindowID = id
    }
    env.windowFrame = { _ in nil }
    env.zeroScreenFrame = { CGRect(x: 0, y: 0, width: 1000, height: 1000) }
    env.screenFrames = { [CGRect(x: 0, y: 0, width: 1000, height: 1000)] }
    env.enqueueScalar = { _, _ in preconditionFailure("Unexpected animation") }
    env.enqueuePosition = { _, _ in preconditionFailure("Unexpected animation") }
    let token = NotificationCenter.default.addObserver(forName: computerUseCursorDidFinishMoveNotification,
        object: owner, queue: nil) { _ in
        MainActor.assumeIsolated {
            precondition(!owner.isMoving && owner.targetWindowID == 7)
            delegate.phases.append("finished")
        }
    }
    defer { NotificationCenter.default.removeObserver(token) }
    await owner.move(to: CGPoint(x: 100, y: 200), aboveWindowID: 7, relativeToWindow: true,
        nextInteractionTiming: .closeEnough, animated: false, fadeIn: false,
        isDelegate: false, environment: env)
    precondition(delegate.phases == ["delegate", "associate", "finished"])
    precondition(!owner.window.isVisible && !owner.isMoving)
    NotificationCenter.default.removeObserver(token)
    delegate.phases = []
    owner.isMoving = true
    env.associate = { window, id, _ in
        precondition(owner.targetWindowID == 7 && owner.isMoving)
        delegate.phases.append("associate")
        window.correspondingWindowID = id
    }
    await owner.move(to: CGPoint(x: 120, y: 220), aboveWindowID: nil, relativeToWindow: false,
        nextInteractionTiming: .finished, animated: false, fadeIn: false,
        isDelegate: true, environment: env)
    precondition(delegate.phases == ["associate"] && owner.isMoving && owner.targetWindowID == 7)
}

@MainActor
private func runAppControllerVirtualCursorChecks() {
    let target = Target(NSRunningApplication.current)
    let originalFactory = ComputerUseCursorStyle.current
    defer { ComputerUseCursorStyle.current = originalFactory }
    let style = SoftwareCursorStyle()
    var styleCalls = 0
    var bindCalls = 0
    ComputerUseCursorStyle.current = { styleCalls += 1; return style }
    precondition(target.virtualCursor == nil)
    let cursor = target.createVirtualCursorIfNeeded(bind: { cursor, pid in
        bindCalls += 1
        precondition(pid == getpid() && target.virtualCursor === cursor)
        precondition(cursor.style === style && cursor.correspondingApplicationPID == nil)
        // Publication before binding also makes reentrant lookup reuse it.
        let cached = target.createVirtualCursorIfNeeded(make: { preconditionFailure() },
            bind: { _, _ in preconditionFailure() })
        precondition(cached === cursor)
        cursor.correspondingApplicationPID = pid
    })
    let cached = target.createVirtualCursorIfNeeded(make: { preconditionFailure() },
        bind: { _, _ in preconditionFailure() })
    precondition(cached === cursor && cursor.style === style)
    precondition(styleCalls == 1 && bindCalls == 1 && cursor.correspondingApplicationPID == getpid())
    precondition(cursor.window.appMonitor == nil && !cursor.window.isVisible)
}

@MainActor
private func runElementCursorPositionPreparationChecks() async throws {
    enum Failure: Error { case geometry }
    for hasPoint in [false, true] {
        for hasTiming in [false, true] {
            for enabled in [false, true] {
                for scrolled in [false, true] {
                    var phases: [String] = []
                    let point = CGPoint(x: 14, y: 29)
                    let prepared = try await prepareElementCursorPosition(
                        timing: hasTiming ? .finished : nil,
                        clickablePoint: { requested in
                            precondition(requested)
                            phases.append("geometry")
                            await Task.yield()
                            return (hasPoint ? point : nil, scrolled)
                        }, cursorFeatureEnabled: { phases.append("feature"); return enabled })
                    precondition(prepared.didScroll == scrolled)
                    precondition(phases == (hasPoint && hasTiming ? ["geometry", "feature"] : ["geometry"]))
                    let moves = hasPoint && hasTiming && enabled
                    precondition(prepared.point == (moves ? point : nil))
                    precondition(prepared.timing == (moves ? .finished : nil))
                }
            }
        }
    }
    do {
        _ = try await prepareElementCursorPosition(timing: nil,
            clickablePoint: { requested in precondition(requested); throw Failure.geometry },
            cursorFeatureEnabled: { preconditionFailure("Feature read after geometry failure") })
        preconditionFailure("Geometry error suppressed")
    } catch Failure.geometry {}
}

private func runUIElementScrollPlanChecks() throws {
    enum Failure: Error { case operation, poll }
    // Leaf action suppresses its cell ancestor; a scroll area resets that
    // suppression, allowing the outer ancestor's attribute request.
    let operations = collectUIElementScrollOperations(from: 0,
        isBoundary: { $0 == 5 }, hasScrollAction: { $0 == 0 },
        isCell: { $0 == 1 || $0 == 3 }, isScrollAttributeSettable: { _ in true },
        isScrollArea: { $0 == 2 || $0 == 4 }, clipsChildren: { $0 == 2 || $0 == 4 }, parent: { $0 + 1 })
    var phases: [String] = []
    let frame = CGRect(x: 1, y: 2, width: 3, height: 4)
    let requested = try executeUIElementScrollOperations(operations, frame: frame,
        performAction: { phases.append("action\($0)") },
        setScrollAttribute: { phases.append("attribute\($0)") },
        scrollFrame: { id, actual in precondition(actual == frame); phases.append("frame\(id)"); return false },
        pollForGeometryChange: { phases.append("poll"); throw Failure.poll })
    precondition(requested && phases == ["frame4", "attribute3", "frame2", "action0", "poll"])
    phases = []
    let empty = collectUIElementScrollOperations(from: 0, isBoundary: { _ in true },
        hasScrollAction: { _ in preconditionFailure() }, isCell: { _ in preconditionFailure() },
        isScrollAttributeSettable: { _ in preconditionFailure() }, isScrollArea: { _ in preconditionFailure() },
        clipsChildren: { _ in preconditionFailure() }, parent: { _ in preconditionFailure() })
    precondition(empty.isEmpty)
    let noChange = try executeUIElementScrollOperations([.frame(1), .frame(2)], frame: frame,
        performAction: { _ in preconditionFailure() }, setScrollAttribute: { _ in preconditionFailure() },
        scrollFrame: { id, _ in phases.append("frame\(id)"); return false },
        pollForGeometryChange: { preconditionFailure() })
    precondition(!noChange && phases == ["frame1", "frame2"])
    do {
        _ = try executeUIElementScrollOperations([.action(1), .attribute(2)], frame: frame,
            performAction: { _ in throw Failure.operation },
            setScrollAttribute: { _ in preconditionFailure() }, scrollFrame: { _, _ in preconditionFailure() },
            pollForGeometryChange: { preconditionFailure() })
        preconditionFailure("Operation error suppressed")
    } catch Failure.operation {}
}

private func runScrollVisibilityConditionChecks() {
    var phases: [String] = []
    precondition(!uiElementScrollCenterIsVisible(readFrame: { fresh in
        precondition(fresh); phases.append("frame"); return nil
    }, clippingFrame: { _ in preconditionFailure() }))
    precondition(phases == ["frame"])
    precondition(!uiElementScrollCenterIsVisible(readFrame: { _ in .zero }, clippingFrame: { fresh in
        precondition(fresh); return nil
    }))
    precondition(uiElementScrollCenterIsVisible(readFrame: { _ in CGRect(x: 90, y: 90, width: 40, height: 40) },
        clippingFrame: { _ in CGRect(x: 100, y: 100, width: 20, height: 20) }))
    precondition(!uiElementScrollCenterIsVisible(readFrame: { _ in CGRect(x: 90, y: 90, width: 40, height: 40) },
        clippingFrame: { _ in CGRect(x: 0, y: 0, width: 20, height: 20) }))
    // A group that clips children resets suppression even though no frame
    // operation is collected for it. The outer cell is therefore eligible.
    let operations = collectUIElementScrollOperations(from: 0, isBoundary: { $0 == 3 },
        hasScrollAction: { $0 == 0 }, isCell: { $0 == 2 }, isScrollAttributeSettable: { _ in true },
        isScrollArea: { _ in false }, clipsChildren: { $0 == 1 }, parent: { $0 + 1 })
    precondition(operations.count == 2)
    guard case .attribute(2) = operations[0], case .action(0) = operations[1] else { preconditionFailure() }
}

private func runScrollBarPositionChecks() {
    func position(_ a: CGFloat, _ b: CGFloat, current: CGFloat? = 0.5,
        contentMin: CGFloat = -400, contentSize: CGFloat = 1000) -> CGFloat? {
        scrollBarPositionForVisibleTarget(targetMin: a, targetMax: b,
            viewportMin: 100, viewportMax: 300, viewportSize: 200,
            contentMin: contentMin, contentSize: contentSize, currentValue: current)
    }
    precondition(position(120, 180) == nil)
    // Small offscreen targets are centered; large ones align the nearest edge.
    precondition(abs(position(320, 360)! - 0.675) < 1e-12)
    precondition(abs(position(20, 60)! - 0.3) < 1e-12)
    precondition(abs(position(50, 350)! - 0.4375) < 1e-12)
    precondition(abs(position(150, 450)! - 0.6875) < 1e-12)
    precondition(abs(position(320, 360, current: nil)! - 0.8) < 1e-12)
    precondition(position(320, 360, current: 2) == 1)
    precondition(position(20, 60, current: -2) == 0)
    precondition(position(320, 360, contentSize: 200) == nil)
    precondition(position(320, 360, contentSize: 100) == nil)
    precondition(position(320, 360, contentSize: CGFloat.nan) == nil)
    precondition(position(CGFloat.nan, CGFloat.nan) == nil)
    precondition(position(320, 360, current: CGFloat.nan)!.isNaN)
    precondition(position(320, 360, current: nil, contentMin: CGFloat.nan)!.isNaN)
}

private func runScrollBarValueWritingChecks() throws {
    enum Failure: Error { case write }
    let ax = AXUIElementCreateApplication(getpid())
    let bar = ScrollBarUIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
    var writes = 0
    for value: CGFloat in [-0.25, 0.5, 1.25, .nan] {
        try bar.setValue(value, write: { element, encoded, attribute in
            precondition(CFEqual(element, ax) && attribute == UIElementAttribute(kAXValueAttribute))
            let number = encoded.value as! NSNumber
            precondition(value.isNaN ? number.doubleValue.isNaN : number.doubleValue == Double(value))
            writes += 1
        })
    }
    precondition(writes == 4)
    do {
        try bar.setValue(0.7, write: { _, _, _ in throw Failure.write })
        preconditionFailure("Scrollbar write failure suppressed")
    } catch Failure.write {}
    for frame in [CGRect.infinite, CGRect.null, CGRect.zero] {
        precondition(prepareScrollFrameAdjustment(target: frame,
            containerFrame: { preconditionFailure("Invalid target read container") }) == nil)
    }
    let target = CGRect(x: 10, y: 20, width: 30, height: 40)
    precondition(prepareScrollFrameAdjustment(target: target, containerFrame: { nil }) == nil)
    precondition(prepareScrollFrameAdjustment(target: target,
        containerFrame: { CGRect(x: 0, y: 0, width: 100, height: 100) }) == nil)
    let partial = CGRect(x: 0, y: 0, width: 20, height: 30)
    precondition(prepareScrollFrameAdjustment(target: target, containerFrame: { partial }) == partial)
}

private func runScrollBarPositionApplicationChecks() throws {
    enum Failure: Error { case write }
    precondition(clampScrollBarPosition(-0.5) == 0)
    precondition(clampScrollBarPosition(1.5) == 1)
    precondition(clampScrollBarPosition(0.5) == 0.5)
    precondition(clampScrollBarPosition(CGFloat.nan).isNaN)
    precondition(clampScrollBarPosition(CGFloat.infinity) == 1)
    precondition(clampScrollBarPosition(-CGFloat.infinity) == 0)
    var phases: [String] = []
    func apply(_ min: CGFloat, _ max: CGFloat, contentSize: CGFloat = 1000) throws -> Bool {
        try applyScrollBarPosition(targetMin: min, targetMax: max,
            viewportMin: 100, viewportMax: 300, viewportSize: 200,
            contentGeometry: { phases.append("content"); return (-400, contentSize) },
            currentValue: { phases.append("value"); return 0.5 },
            write: { position in precondition(abs(position - 0.675) < 1e-12); phases.append("write") })
    }
    let applied = try apply(320, 360)
    precondition(applied)
    precondition(phases == ["content", "value", "write"])
    phases = []
    let contained = try apply(120, 180)
    precondition(!contained && phases.isEmpty)
    let zeroRange = try apply(320, 360, contentSize: 200)
    precondition(!zeroRange)
    precondition(phases == ["content", "value"])
    do {
        _ = try applyScrollBarPosition(targetMin: 320, targetMax: 360,
            viewportMin: 100, viewportMax: 300, viewportSize: 200,
            contentGeometry: { (-400, 1000) }, currentValue: { nil },
            write: { value in precondition(abs(value - 0.8) < 1e-12); throw Failure.write })
        preconditionFailure("Write error suppressed")
    } catch Failure.write {}
}

private func runScrollContentFrameChecks() {
    let roles: [Int: UIElementRole] = [0: .scrollArea, 1: .group, 2: .scrollBar, 3: .scrollArea,
        4: .group, 5: .button, 6: .button, 7: .button]
    let frames: [Int: CGRect] = [0: CGRect(x: -999, y: -999, width: 9999, height: 9999),
        1: CGRect(x: 0, y: 0, width: 10, height: 10), 2: CGRect(x: 0, y: 0, width: 9999, height: 9999),
        3: CGRect(x: 20, y: 20, width: 10, height: 10), 4: CGRect(x: 40, y: 40, width: 10, height: 10),
        5: CGRect(x: -10, y: -20, width: 5, height: 5), 6: .zero,
        7: CGRect(x: 500, y: 500, width: 500, height: 500)]
    let tree = [0: [1, 2, 3, 4], 1: [5, 6, 1], 2: [7], 3: [7], 4: [7], 6: [5]]
    var reads: [Int] = []
    var frameReads: [Int] = []
    var actionReads: [Int] = []
    let bounds = uiElementScrollContentFrame(of: 0, role: { roles[$0]! }, frame: { id in
        frameReads.append(id); return frames[id]
    }, children: { id in reads.append(id); return tree[id] ?? [] },
        hasPageScrollAction: { id in actionReads.append(id); return id == 4 })
    precondition(bounds == CGRect(x: -10, y: -20, width: 60, height: 70))
    precondition(reads == [0, 1, 6, 5])
    precondition(frameReads == [4, 3, 1, 6, 5])
    precondition(actionReads == [4, 1])
    let empty = uiElementScrollContentFrame(of: 0, role: { _ in preconditionFailure() },
        frame: { _ in preconditionFailure() }, children: { _ in [] },
        hasPageScrollAction: { _ in preconditionFailure() })
    precondition(empty.isNull)
    // Missing frame does not stop descent into an ordinary node.
    let nested = uiElementScrollContentFrame(of: 0, role: { _ in .button },
        frame: { $0 == 2 ? CGRect(x: 1, y: 2, width: 3, height: 4) : nil },
        children: { $0 < 2 ? [$0 + 1] : [] }, hasPageScrollAction: { _ in preconditionFailure() })
    precondition(nested == CGRect(x: 1, y: 2, width: 3, height: 4))
}

private func runScrollFrameAdjustmentChecks() throws {
    enum Failure: Error { case write }
    var phases: [String] = []
    let target = CGRect(x: 320, y: 320, width: 40, height: 40)
    let viewport = CGRect(x: 100, y: 100, width: 200, height: 200)
    let content = CGRect(x: -400, y: -400, width: 1000, height: 1000)
    let changed = try adjustUIElementScrollFrame(target: target,
        containerFrame: { phases.append("viewport"); return viewport },
        scrollBar: { axis in phases.append("bar\(axis)"); return axis },
        enabled: { axis in phases.append("enabled\(axis)"); return nil },
        contentFrame: { phases.append("content"); return content },
        currentValue: { axis in phases.append("value\(axis)"); return 0.5 },
        write: { axis, value in precondition(abs(value - 0.675) < 1e-12); phases.append("write\(axis)") })
    precondition(changed)
    precondition(phases == ["viewport", "barvertical", "enabledvertical", "content", "valuevertical", "writevertical",
        "barhorizontal", "enabledhorizontal", "content", "valuehorizontal", "writehorizontal"])
    var writes: [ScrollFrameAxis] = []
    let partial = try adjustUIElementScrollFrame(target: target, containerFrame: { viewport },
        scrollBar: { $0 }, enabled: { $0 == .vertical ? false : true }, contentFrame: { content },
        currentValue: { axis in precondition(axis == .horizontal); return nil },
        write: { axis, value in precondition(abs(value - 0.8) < 1e-12); writes.append(axis) })
    precondition(partial && writes == [.horizontal])
    let invalid = try adjustUIElementScrollFrame(target: CGRect.null,
        containerFrame: { preconditionFailure() }, scrollBar: { _ -> Int? in preconditionFailure() },
        enabled: { _ in preconditionFailure() }, contentFrame: { preconditionFailure() },
        currentValue: { _ in preconditionFailure() }, write: { _, _ in preconditionFailure() })
    precondition(!invalid)
    do {
        _ = try adjustUIElementScrollFrame(target: target, containerFrame: { viewport },
            scrollBar: { axis in precondition(axis == .vertical); return axis }, enabled: { _ in true },
            contentFrame: { content }, currentValue: { _ in 0.5 }, write: { _, _ in throw Failure.write })
        preconditionFailure("Axis write failure suppressed")
    } catch Failure.write {}
}

private func runAXNumberValueChecks() throws {
    let ax = AXUIElementCreateApplication(getpid())
    let attribute = UIElementAttribute(kAXValueAttribute)
    func partial(_ value: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    let cached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [attribute],
        attributes: [attribute: partial(NSNumber(value: 0.4))], transactionAttributes: nil))
    let value = cached.numberValue(for: attribute, ignoringTypeMismatch: false,
        read: { preconditionFailure("Valid cached number read AX") }, reportError: { _ in preconditionFailure() })
    precondition(value?.doubleValue == 0.4)
    let invalid = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [attribute],
        attributes: [attribute: partial("bad" as NSString)], transactionAttributes: nil))
    var reports = 0
    let fresh = invalid.numberValue(for: attribute, ignoringTypeMismatch: false,
        read: { (.success, partial(NSNumber(value: 0.6))) }, reportError: { _ in reports += 1 })
    precondition(fresh?.doubleValue == 0.6 && reports == 0)
    let mismatch = invalid.numberValue(for: attribute, ignoringTypeMismatch: false,
        read: { (.success, partial("bad" as NSString)) }, reportError: { _ in reports += 1 })
    precondition(mismatch == nil && reports == 1)
    let ignored = invalid.numberValue(for: attribute, ignoringTypeMismatch: true,
        read: { (.success, partial("bad" as NSString)) }, reportError: { _ in preconditionFailure() })
    precondition(ignored == nil)
    let decoded = try decodeAXNumber(NSNumber(value: 0.75), throwingOnFailure: true)
    precondition(decoded?.doubleValue == 0.75)
}

private func runScrollingClickablePointCompositionChecks() async throws {
    for (ids, expected): ([Int], String) in [
        ([], ""), ([0], "0"), ([3, 1, 2, 1, 8, 10, 9], "1-3, 8-10"),
        ([4, 2, 4], "2, 4"), ([-1, -3, -2, 1], "-3--1, 1"),
        ([Int.max, Int.max], String(Int.max)),
        ([Int.min, Int.min + 1, Int.max], "\(Int.min)-\(Int.min + 1), \(Int.max)")
    ] {
        checkEqual(removedElementIDRanges(ids), expected)
        checkEqual(removedElementIDSummary(ids), ids.isEmpty ? nil : "Removed element IDs: " + expected)
    }
    func snapshotNode(_ id: Int, _ children: [UIElementRender<Int>] = []) -> UIElementRender<Int> {
        .init(id: id + 100, elementID: id, text: "node\(id)", detailText: id == 0 ? "" : nil,
            sourcePath: nil, children: children)
    }
    let deepest = snapshotNode(42)
    let child = snapshotNode(0, [deepest])
    let snapshotSource = UIElementRenderTree(isFocus: true,
        roots: [snapshotNode(1, [child]), snapshotNode(2, [snapshotNode(42)])])
    let snapshot = try snapshotSource.snapshot(subjectID: "lineage")
    checkEqual(snapshotSource.differenceFullTreeLineCount(), 5)
    let budgetCursor = UIElementTraversalCursor(item: child, path: IndexPath(index: 0))
    let budgetRoot = snapshotNode(7, [snapshotNode(8), snapshotNode(9, [snapshotNode(10)])])
    let subtreeChange = UIElementRenderDifference<Int>.Change.insert(offset: 99,
        new: .init(item: budgetRoot, path: IndexPath(indexes: [0, 2])))
    checkEqual(subtreeChange.lines(indent: " ", options: []),
        ["+ 7 node7", "+  9 node9", "+   10 node10", "+  8 node8"])
    checkEqual(subtreeChange.lines(indent: " ", options: [.withoutInsertionSubtree]), ["+ 7 node7"])
    let removalChange = UIElementRenderDifference<Int>.Change.remove(offset: 999,
        old: .init(item: budgetRoot, path: IndexPath(index: 0)))
    checkEqual(removalChange.removedElementIDs(), [7, 9, 10, 8])
    checkEqual(subtreeChange.removedElementIDs(), [])
    let repeatedRemoval = UIElementRenderDifference<Int>.Change.remove(offset: 0,
        old: .init(item: snapshotNode(0, [snapshotNode(0), snapshotNode(2)]), path: IndexPath(index: 0)))
    checkEqual(repeatedRemoval.removedElementIDs(), [0, 2, 0])
    checkEqual(removedElementIDSummary(repeatedRemoval.removedElementIDs()), "Removed element IDs: 0, 2")
    checkEqual(formatPreparedDifferenceLines(ordinary: [subtreeChange],
        summarizedRemovals: [repeatedRemoval], options: [.withoutInsertionSubtree]),
        ["Removed element IDs: 0, 2", "+\t7 node7"])
    checkEqual(formatPreparedDifferenceLines(ordinary: [subtreeChange],
        summarizedRemovals: [], options: [.withoutInsertionSubtree]), ["+\t7 node7"])
    checkEqual(formatPreparedDifferenceLines(ordinary: [],
        summarizedRemovals: [repeatedRemoval], options: []), ["Removed element IDs: 0, 2"])
    for (limit, expectedCount, expectedPending) in [
        (0, 0, [7]), (1, 1, [8, 9]), (2, 2, [8, 10]),
        (3, 3, [8]), (4, 4, []), (5, 4, [])
    ] {
        let prefix = countDifferenceBudgetPrefix(pending: .init([budgetRoot]), count: 0, remaining: limit)
        checkEqual(prefix.count, expectedCount)
        checkEqual(prefix.pending.map(\.id), expectedPending.map { $0 + 100 })
    }
    let alreadyCharged = countDifferenceBudgetPrefix(pending: .init([budgetRoot]), count: 1, remaining: 0)
    checkEqual(alreadyCharged.count, 1)
    checkTrue(alreadyCharged.pending.first === budgetRoot)
    let budgetChanges: [UIElementRenderDifference<Int>.Change] = [
        .none(offset: 0, new: budgetCursor, old: budgetCursor),
        .insert(offset: 0, new: budgetCursor),
        .update(offset: 0, new: budgetCursor, old: budgetCursor),
        .remove(offset: 0, old: budgetCursor)
    ]
    var exceededEvents: [AccessibilityDifferenceLineBudgetExceeded] = []
    checkEqual(budgetChanges.map { $0.differenceOrderingKey.rank }, [0, 2, 3, 1])
    let orderedChanges = budgetChanges.sorted { $0.precedesInDifference($1) }
    checkEqual(orderedChanges.map { $0.differenceOrderingKey.rank }, [0, 1, 2, 3])
    checkTrue(!budgetChanges[1].precedesInDifference(budgetChanges[1]))
    let combinedLines = renderBudgetedDifferenceLines(budgetChanges, options: [.withoutInsertionSubtree],
        summarizesRemovedElementIDs: true, ignoreDifferenceLineBudget: true,
        fullTreeLineCount: 10, onLineBudgetExceeded: { _ in checkTrue(false) })
    checkEqual(combinedLines, ["Removed element IDs: 0, 42", "+0 node0 ", "~0 node0 "])
    checkTrue(budgetChanges.allSatisfy { $0.differenceOrderingKey.path == budgetCursor.path })
    checkEqual(budgetChanges.map { $0.rootDifferenceLine(indent: "\t", options: []) },
        [nil, "+0 node0 ", "~0 node0 ", "-0 node0 "])
    let nestedBudgetCursor = UIElementTraversalCursor(item: deepest, path: IndexPath(indexes: [0, 0, 0]))
    let nestedUpdate = UIElementRenderDifference<Int>.Change.update(offset: 999,
        new: nestedBudgetCursor, old: budgetCursor)
    checkEqual(nestedUpdate.rootDifferenceLine(indent: " ", options: []), "~  42 node42")
    checkEqual(nestedUpdate.rootDifferenceLine(indent: " ", options: [.withoutElementID]), "~  node42")
    var classifiedEvents: [AccessibilityDifferenceLineBudgetExceeded] = []
    let classified = prepareDifferenceLineChanges(budgetChanges, options: [],
        summarizesRemovedElementIDs: true, ignoreDifferenceLineBudget: false,
        fullTreeLineCount: 4, onLineBudgetExceeded: { classifiedEvents.append($0) })
    checkEqual(classified?.ordinary.count, 3)
    checkEqual(classified?.removals.count, 1)
    checkTrue(classifiedEvents.isEmpty)
    let summaryRejected = prepareDifferenceLineChanges([budgetChanges[2], budgetChanges[3]], options: [],
        summarizesRemovedElementIDs: true, ignoreDifferenceLineBudget: false,
        fullTreeLineCount: 1, onLineBudgetExceeded: { classifiedEvents.append($0) })
    checkTrue(summaryRejected == nil)
    checkEqual(classifiedEvents, [.removedElementSummary(fullTreeLineCount: 1)])
    let ignoring = prepareDifferenceLineChanges(budgetChanges, options: [],
        summarizesRemovedElementIDs: false, ignoreDifferenceLineBudget: true,
        fullTreeLineCount: 0, onLineBudgetExceeded: { classifiedEvents.append($0) })
    checkEqual(ignoring?.ordinary.count, 4)
    checkEqual(ignoring?.removals.count, 0)
    var availableBudget = 1
    checkTrue(!budgetChanges[1].consumeDifferenceBudget(options: [], ignoreDifferenceLineBudget: false,
        remaining: &availableBudget, fullTreeLineCount: 77, onLineBudgetExceeded: { exceededEvents.append($0) }))
    checkEqual(availableBudget, 1)
    checkEqual(exceededEvents, [.difference(fullTreeLineCount: 77)])
    availableBudget = 2
    checkTrue(budgetChanges[1].consumeDifferenceBudget(options: [], ignoreDifferenceLineBudget: false,
        remaining: &availableBudget, fullTreeLineCount: 77, onLineBudgetExceeded: { exceededEvents.append($0) }))
    checkEqual(availableBudget, 0)
    availableBudget = 0
    checkTrue(budgetChanges[2].consumeDifferenceBudget(options: [], ignoreDifferenceLineBudget: false,
        remaining: &availableBudget, fullTreeLineCount: 77, onLineBudgetExceeded: { exceededEvents.append($0) }))
    checkEqual(availableBudget, -1)
    checkTrue(budgetChanges[1].consumeDifferenceBudget(options: [], ignoreDifferenceLineBudget: true,
        remaining: &availableBudget, fullTreeLineCount: 77, onLineBudgetExceeded: { exceededEvents.append($0) }))
    checkEqual(availableBudget, -1)
    checkEqual(exceededEvents.count, 1)
    for summarizes in [false, true] {
        for hasRemovals in [false, true] {
            for remaining in [-1, 0, 1, 2] {
                var summaryEvents: [AccessibilityDifferenceLineBudgetExceeded] = []
                let accepted = checkRemovalSummaryBudget(summarizesRemovedElementIDs: summarizes,
                    hasSummarizedRemovals: hasRemovals, remaining: remaining, fullTreeLineCount: 77,
                    onLineBudgetExceeded: { summaryEvents.append($0) })
                let rejected = summarizes && hasRemovals && remaining < 1
                checkEqual(accepted, !rejected)
                checkEqual(summaryEvents, rejected ? [.removedElementSummary(fullTreeLineCount: 77)] : [])
            }
        }
    }
    for options: UIElementRenderLineOptions in [[], .withoutInsertionSubtree, .withoutRemovalSubtree,
        [.withoutInsertionSubtree, .withoutRemovalSubtree]] {
        for (index, change) in budgetChanges.enumerated() {
            let seed = change.differenceBudgetTraversal(options: options)
            let queued = (index == 1 && !options.contains(.withoutInsertionSubtree))
                || (index == 3 && !options.contains(.withoutRemovalSubtree))
            checkEqual(seed.count, index == 0 || queued ? 0 : 1)
            checkEqual(seed.pending.count, queued ? 1 : 0)
            if queued { checkTrue(seed.pending.first === child) }
        }
    }
    let emptyText = UIElementRender<Int>(id: 91, elementID: 91, text: "", detailText: nil,
        sourcePath: nil, children: [])
    let multiline = UIElementRender<Int>(id: 92, elementID: 92, text: "first\nsecond", detailText: "third\nfourth",
        sourcePath: nil, children: [emptyText, emptyText])
    checkEqual(UIElementRenderTree(isFocus: false, roots: [multiline]).differenceFullTreeLineCount(), 3)
    checkEqual(UIElementRenderTree<Int>(isFocus: false, roots: []).differenceFullTreeLineCount(), 0)
    checkEqual(snapshot.subjectID, "lineage"); checkTrue(snapshot.isFocus)
    checkEqual(snapshot.renders.map(\.id), [1, 2, 0, 42, 42])
    checkEqual(snapshot.renders.map(\.parentIndex), [nil, nil, 0, 1, 2])
    checkEqual(snapshot.renders[2].detailText, "")
    let rebuilt = snapshot.renderTree()
    checkTrue(rebuilt.isFocus)
    checkEqual(rebuilt.roots.map(\.id), [1, 2])
    checkTrue(rebuilt.roots.allSatisfy { $0.sourcePath == nil && $0.elementID == $0.id })
    checkTrue(rebuilt.roots[1].children[0] !== rebuilt.roots[0].children[0].children[0])
    checkEqual(try rebuilt.snapshot(subjectID: snapshot.subjectID), snapshot)
    // The native prefix-root assumption is observable for non-BFS input; do
    // not replace it with a filter that invents different recovery behavior.
    let nonBFS = UIElementRenderTreeSnapshot(subjectID: "ignored", isFocus: false, renders: [
        .init(id: 10, text: "root", detailText: nil, parentIndex: nil),
        .init(id: 11, text: "child", detailText: nil, parentIndex: 0),
        .init(id: 12, text: "late root", detailText: nil, parentIndex: nil)])
    let nonBFSRoots = nonBFS.renderTree().roots
    checkEqual(nonBFSRoots.map(\.id), [10, 11])
    checkTrue(nonBFSRoots[0].children[0] === nonBFSRoots[1])
    checkTrue(UIElementRenderTreeSnapshot(subjectID: "", isFocus: false, renders: []).renderTree().roots.isEmpty)
    checkTrue(try UIElementRenderTree<Int>(isFocus: false, roots: []).snapshot(subjectID: "").renders.isEmpty)
    enum SnapshotReadFailure: Error { case rejected }
    for failure in [0, 1, 2] {
        var trace: [String] = []
        let prepared = prepareDifferenceLineTrees(baselineSnapshot: {
            trace.append("baseline")
            if failure == 1 { throw SnapshotReadFailure.rejected }
            return 10
        }, currentSnapshot: {
            trace.append("current")
            if failure == 2 { throw SnapshotReadFailure.rejected }
            return 20
        }, rebuild: { value in trace.append("rebuild\(value)"); return value + 1 })
        if failure == 0 {
            checkEqual(prepared?.baseline, 11); checkEqual(prepared?.current, 21)
            checkEqual(trace, ["baseline", "rebuild10", "current", "rebuild20"])
        } else {
            checkTrue(prepared == nil)
            checkEqual(trace, failure == 1 ? ["baseline"] : ["baseline", "rebuild10", "current"])
        }
    }
    deepest.elementID = nil
    do {
        _ = try snapshotSource.snapshot(subjectID: "lineage")
        unexpectedFailure()
    } catch is UIElementRenderTreeSnapshotError {}
    for text in ["", "selected", " ", "中文🙂"] {
        let attribute = UIElementAttribute("AXSelectedText")
        let partial = AXPartialValue(value: AXEncodedValue(value: text as NSString),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        let element: any UIElementProtocol = UIElement(
            axElement: AXUIElementCreateApplication(2147480022),
            cache: UIElementCache(supportedAttributes: [attribute],
                attributes: [attribute: partial], transactionAttributes: nil))
        checkEqual(element.selectedText, text.isEmpty ? nil : text)
    }
    for text in ["selected", " ", "中文🙂"] {
        checkEqual(uiElementSelectedText(readText: { text }, readMarkerRange: { () -> Int? in unexpectedFailure() },
            readMarkerText: { _ in unexpectedFailure() }), text)
    }
    for direct: String? in [nil, ""] {
        for markerText: String? in [nil, "", " ", "marker"] {
            var reads: [String] = []
            let selected = uiElementSelectedText(readText: { reads.append("text"); return direct },
                readMarkerRange: { reads.append("range"); return 7 }, readMarkerText: { marker in
                    checkEqual(marker, 7); reads.append("markerText"); return markerText
                })
            checkEqual(selected, markerText.flatMap { $0.isEmpty ? nil : $0 })
            checkEqual(reads, ["text", "range", "markerText"])
        }
    }
    enum MarkerReadFailure: Error { case rejected }
    checkTrue(uiElementSelectedText(readText: { nil }, readMarkerRange: { 1 },
        readMarkerText: { _ in throw MarkerReadFailure.rejected }) == nil)
    checkTrue(uiElementSelectedText(readText: { "" }, readMarkerRange: { () -> Int? in nil },
        readMarkerText: { _ in unexpectedFailure() }) == nil)
    for text in ["", "selected"] {
        var scrollDispatchTrace: [String] = []
        enum ContentAcquisitionFailure: Error { case rejected }
        for fails in [false, true] {
            var acquisitionTrace: [String] = []
            do {
                let content = try await acquireScreenshotContent(currentProcessOnly: false, supportsCurrentProcess: true,
                    includedWindowIDs: [7], visibleWindowIDs: { acquisitionTrace.append("visibility"); return [] },
                    acquire: { scope in
                        acquisitionTrace.append("acquire"); checkEqual(scope, .all)
                        await Task.yield()
                        if fails { throw ContentAcquisitionFailure.rejected }
                        return 42
                    })
                checkTrue(!fails); checkEqual(content, 42)
            } catch ContentAcquisitionFailure.rejected { checkTrue(fails) }
            checkEqual(acquisitionTrace, ["visibility", "acquire"])
        }
        for supported in [false, true] {
            checkEqual(screenshotContentScope(currentProcessOnly: true, supportsCurrentProcess: supported,
                includedWindowIDs: [7], visibleWindowIDs: { unexpectedFailure() }), supported ? .currentProcess : .all)
        }
        checkEqual(screenshotContentScope(currentProcessOnly: false, supportsCurrentProcess: false,
            includedWindowIDs: nil, visibleWindowIDs: { unexpectedFailure() }), .onScreenExcludingDesktop)
        for (ids, visible, expected) in [
            ([UInt32](), [UInt32](), ScreenshotContentScope.onScreenExcludingDesktop),
            ([7, 7], [8, 7], .onScreenExcludingDesktop),
            ([7, 9], [7, 8], .all), ([7], [], .all)
        ] {
            var visibilityReads = 0
            checkEqual(screenshotContentScope(currentProcessOnly: false, supportsCurrentProcess: true,
                includedWindowIDs: ids, visibleWindowIDs: { visibilityReads += 1; return visible }), expected)
            checkEqual(visibilityReads, 1)
        }
        for ids: [UInt32]? in [nil, [], [7], [99], [7, 8], [7, 7]] {
            var selectionTrace: [String] = []
            let selected = selectScreenshotWindow(includedWindowIDs: ids, appName: "App",
                windows: { () -> [Int] in selectionTrace.append("windows"); return [8, 7] },
                windowID: { UInt32($0) }, matchingApp: { name in
                    checkEqual(name, "App"); selectionTrace.append("app"); return 9
                })
            if ids == nil || ids?.isEmpty == true {
                checkEqual(selected, 9); checkEqual(selectionTrace, ["app"])
            } else if ids?.count == 1 {
                checkEqual(selected, ids == [7] ? 7 : nil); checkEqual(selectionTrace, ["windows"])
            } else { checkTrue(selected == nil); checkTrue(selectionTrace.isEmpty) }
        }
        checkTrue(selectScreenshotWindow(includedWindowIDs: nil, appName: nil,
            windows: { () -> [Int] in unexpectedFailure() }, windowID: { UInt32($0) },
            matchingApp: { _ in unexpectedFailure() }) == nil)
        for shadow in [false, true] {
            for opaque in [false, true] {
                let rect = CGRect(x: 5, y: 6, width: 70, height: 80)
                let config = screenshotStreamConfiguration(width: 123, height: 456, sourceRect: rect,
                    shouldBeOpaque: opaque, includeWindowShadow: shadow)
                checkEqual(config.width, 123); checkEqual(config.height, 456)
                checkEqual(config.sourceRect, rect)
                checkEqual(config.ignoreShadowsSingleWindow, !shadow)
                checkTrue(config.ignoreShadowsDisplay); checkTrue(!config.showsCursor)
                checkEqual(config.shouldBeOpaque, opaque)
            }
        }
        let bridgeContext = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8,
            bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let bridgeImage = bridgeContext.makeImage()!
        checkTrue(windowCaptureImages([] as CFArray)?.isEmpty == true)
        // Native uses Swift's CF bridge, which accepts non-image CF objects.
        // Check type IDs only; never invoke CGImage methods on these fixtures.
        let nonImageBridge = windowCaptureImages(["invalid"] as CFArray)!
        checkEqual(nonImageBridge.count, 1)
        checkEqual(CFGetTypeID(nonImageBridge[0]), CFStringGetTypeID())
        let mixedBridge = windowCaptureImages([bridgeImage, "invalid"] as CFArray)!
        checkEqual(mixedBridge.count, 2)
        checkEqual(CFGetTypeID(mixedBridge[0]), CGImage.typeID)
        checkEqual(CFGetTypeID(mixedBridge[1]), CFStringGetTypeID())
        var retainedBridgeImages: [CGImage]?
        do {
            let originalArray = [bridgeImage, bridgeImage] as CFArray
            retainedBridgeImages = windowCaptureImages(originalArray)
        }
        checkEqual(retainedBridgeImages?.count, 2)
        checkTrue(retainedBridgeImages?[0] === bridgeImage)
        checkTrue(retainedBridgeImages?[1] === bridgeImage)
        for returnedImages: [Int]? in [nil, [], [4], [4, 5]] {
            var acceleratedTrace: [String] = []
            let expectedRect = CGRect(x: -20, y: 30, width: 400, height: 200)
            let expectedConnection = OpaquePointer(bitPattern: 7)
            let image = captureAcceleratedWindowScreenshot([8, 9], rect: expectedRect,
                mainConnection: { acceleratedTrace.append("connection"); return expectedConnection },
                capture: { windows, options, rect, connection in
                    acceleratedTrace.append("capture")
                    checkEqual(windows, [8, 9]); checkEqual(options, .ignoreGlobalClipShape)
                    checkEqual(rect, expectedRect); checkEqual(connection, expectedConnection)
                    return returnedImages
                })
            checkEqual(image, returnedImages?.first)
            checkEqual(acceleratedTrace, ["connection", "capture"])
        }
        checkEqual(WindowServerCaptureOptions.ignoreGlobalClipShape.rawValue, 0x800)
        checkTrue(WindowServerSPI.captureWindowImagesInRect([7], options: .ignoreGlobalClipShape,
            rect: .zero, connection: nil, capture: nil) == nil)
        checkTrue(WindowServerSPI.captureWindowImagesInRect([], options: .ignoreGlobalClipShape,
            rect: .zero, connection: nil, capture: { _, _, _, _, _ in unexpectedFailure() }) == nil)
        let captureRect = CGRect(x: -20, y: 30, width: 400, height: 200)
        for returnsNil in [false, true] {
            var captureCalls = 0
            let images = WindowServerSPI.captureWindowImagesInRect([7, 8, 7], options: .ignoreGlobalClipShape,
                rect: captureRect, connection: nil, capture: { connection, pointer, count, options, rect in
                    captureCalls += 1; checkTrue(connection == nil)
                    checkEqual(Array(UnsafeBufferPointer(start: pointer, count: Int(count))), [7, 8, 7])
                    checkEqual(options, 0x800); checkEqual(rect, captureRect)
                    return returnsNil ? nil : []
                })
            checkEqual(captureCalls, 1)
            if returnsNil { checkTrue(images == nil) } else { checkTrue(images?.isEmpty == true) }
        }
        let fractionalPixels = screenshotPixelDimensions(CGSize(width: 0.1, height: 100.01))
        checkEqual(fractionalPixels?.width, 1); checkEqual(fractionalPixels?.height, 101)
        for invalid: CGFloat in [0, -1, .nan, .infinity, -.infinity, CGFloat.greatestFiniteMagnitude] {
            checkTrue(screenshotPixelDimensions(CGSize(width: invalid, height: 10)) == nil)
            checkTrue(screenshotPixelDimensions(CGSize(width: 10, height: invalid)) == nil)
        }
        checkEqual(screenshotPixelDimensions(CGSize(width: 9000, height: 9000))?.width, 9000)
        for skipScreenshot in [false, true] {
            for hasMenuBarItem in [false, true] {
                var retainedGeometry = AppControllerGeometryState()
                retainedGeometry.visibleRect = CGRect(x: 1, y: 2, width: 3, height: 4)
                retainedGeometry.scalingFactor = 7
                retainedGeometry.scaledScreenSize = CGSize(width: 8, height: 9)
                retainedGeometry.cursorPositionInScaledCoordinates = .init(x: 10, y: 11)
                var captureGeometryTrace: [String] = []
                let skipped = skipScreenshot || hasMenuBarItem
                let output = retainedGeometry.prepareCapture(skipScreenshot: skipScreenshot, hasMenuBarItem: hasMenuBarItem,
                    readSizingOptions: { captureGeometryTrace.append("config"); return (false, true) },
                    readBounds: { captureGeometryTrace.append("bounds"); return CGRect(x: -10, y: 20, width: 400, height: 200) },
                    readPixelScale: { captureGeometryTrace.append("scale"); return 2 })
                checkEqual(captureGeometryTrace, skipped ? ["config"] : ["config", "bounds", "scale"])
                checkEqual(output, skipped ? .zero : CGSize(width: 800, height: 400))
                checkEqual(retainedGeometry.scalingFactor, skipped ? 7 : 0.5)
                checkEqual(retainedGeometry.scaledScreenSize, skipped ? CGSize(width: 8, height: 9) : output)
                checkEqual(retainedGeometry.visibleRect, skipped ? CGRect(x: 1, y: 2, width: 3, height: 4)
                    : CGRect(x: -10, y: 20, width: 400, height: 200))
                checkEqual(retainedGeometry.cursorPositionInScaledCoordinates, .init(x: 10, y: 11))
            }
        }
        var geometryState = AppControllerGeometryState()
        checkTrue(geometryState.visibleRect.isNull)
        checkEqual(geometryState.scalingFactor, 0)
        checkEqual(geometryState.scaledScreenSize, .zero)
        checkEqual(geometryState.cursorPositionInScaledCoordinates, .init(x: 0, y: 0))
        geometryState.cursorPositionInScaledCoordinates = .init(x: 7, y: -3)
        let stateRect = CGRect(x: -20, y: 30, width: 400, height: 200)
        checkEqual(geometryState.update(visibleRect: stateRect, pixelScale: 2,
            useLegacyScreenshotSizing: false, normalizeScreenshotToPointResolution: true), CGSize(width: 800, height: 400))
        checkEqual(geometryState.visibleRect, stateRect)
        checkEqual(geometryState.scalingFactor, 0.5)
        checkEqual(geometryState.scaledScreenSize, CGSize(width: 800, height: 400))
        checkEqual(geometryState.cursorPositionInScaledCoordinates, .init(x: 7, y: -3))
        var geometryWriteTrace: [String] = []
        var updatedRect: CGRect?
        var updatedScale: CGFloat?
        var updatedSize: CGSize?
        let geometryRect = CGRect(x: -20, y: 40, width: 400, height: 200)
        let updatedGeometrySize = updateAppControllerGeometry(visibleRect: geometryRect, pixelScale: 2,
            useLegacyScreenshotSizing: false, normalizeScreenshotToPointResolution: true,
            writeVisibleRect: { rect in
                geometryWriteTrace.append("rect"); updatedRect = rect
                checkTrue(updatedScale == nil && updatedSize == nil)
            }, writeScalingFactor: { scale in
                geometryWriteTrace.append("scale"); checkEqual(updatedRect, geometryRect)
                checkTrue(updatedSize == nil); updatedScale = scale
            }, writeScaledScreenSize: { size in
                geometryWriteTrace.append("size"); checkEqual(updatedScale, 0.5); updatedSize = size
            })
        checkEqual(geometryWriteTrace, ["rect", "scale", "size"])
        checkEqual(updatedGeometrySize, CGSize(width: 800, height: 400))
        checkEqual(updatedSize, updatedGeometrySize)
        let screenFrames = [CGRect(x: 0, y: 0, width: 100, height: 100),
            CGRect(x: 100, y: 0, width: 200, height: 100)]
        for (bounds, preferred, expected) in [
            (CGRect(x: 90, y: 0, width: 100, height: 50), Optional<Int>.none, Optional(1)),
            (CGRect(x: 90, y: 0, width: 100, height: 50), Optional(0), Optional(0)),
            (CGRect(x: 90, y: 0, width: 20, height: 50), Optional<Int>.none, Optional(0)),
            (CGRect(x: 900, y: 0, width: 20, height: 50), Optional<Int>.none, Optional(0))
        ] {
            checkEqual(bestWindowScreen(for: bounds, preferred: preferred,
                screens: { [0, 1] }, frame: { screenFrames[$0] }), expected)
        }
        checkTrue(bestWindowScreen(for: .zero, preferred: Optional<Int>.none,
            screens: { [] }, frame: { _ in unexpectedFailure() }) == nil)
        checkEqual(bestWindowScreen(for: CGRect(x: 10, y: 10, width: 10, height: 10), preferred: 0,
            screens: { () -> [Int] in unexpectedFailure() }, frame: { screenFrames[$0] }), 0)
        for resize in [false, true] {
            for preferPoints in [false, true] {
                let geometry = appControllerScaledGeometry(visibleRect: CGRect(x: -10, y: 20, width: 400, height: 200),
                    pixelScale: 2, useLegacyScreenshotSizing: resize, normalizeScreenshotToPointResolution: preferPoints)
                let usesPoints = resize && preferPoints
                checkEqual(geometry.size, usesPoints ? CGSize(width: 400, height: 200) : CGSize(width: 800, height: 400))
                checkEqual(geometry.scalingFactor, usesPoints ? 1 : 0.5)
            }
        }
        let largeGeometry = appControllerScaledGeometry(visibleRect: CGRect(x: 0, y: 0, width: 4000, height: 2000),
            pixelScale: 2, useLegacyScreenshotSizing: true, normalizeScreenshotToPointResolution: true)
        checkEqual(largeGeometry.size, CGSize(width: 1536, height: 768))
        checkEqual(largeGeometry.scalingFactor, 1 / (0.512 * 0.75))
        enum ResolvedMoveFailure: Error { case denied, window }
        for mode in 0..<3 {
            var moveTailTrace: [String] = []
            var tailPosition = AppControllerCursorPosition(x: 0, y: 0)
            do {
                try await performResolvedControllerMouseMove(target: 42,
                    validateProcess: { target in
                        moveTailTrace.append("validate"); checkEqual(target, 42)
                        if mode == 1 { throw ResolvedMoveFailure.denied }
                    }, readWindowID: { target in
                        moveTailTrace.append("window"); checkEqual(target, 42)
                        if mode == 2 { throw ResolvedMoveFailure.window }
                        return 0
                    }, createCursor: {
                        moveTailTrace.append("create"); tailPosition = .init(x: 3, y: -2); return 7
                    }, readPosition: { moveTailTrace.append("position"); return tailPosition },
                    readScale: { moveTailTrace.append("scale"); return 2 },
                    readVisibleRect: { moveTailTrace.append("rect"); return CGRect(x: -10, y: 20, width: 300, height: 400) },
                    move: { cursor, point, window in
                        moveTailTrace.append("move"); checkEqual(cursor, 7); checkEqual(window, 0)
                        checkEqual(point, CGPoint(x: -4, y: 16))
                        await Task.yield(); moveTailTrace.append("moved")
                    })
                checkEqual(mode, 0)
            } catch let error as ResolvedMoveFailure {
                switch error { case .denied: checkEqual(mode, 1); case .window: checkEqual(mode, 2) }
            }
            let expected = mode == 0 ? ["validate", "window", "create", "position", "scale", "rect", "move", "moved"]
                : mode == 1 ? ["validate"] : ["validate", "window"]
            checkEqual(moveTailTrace, expected)
        }
        enum MovePreparationFailure: Error { case resolution }
        for requested: AppControllerCursorPosition? in [nil, .init(x: -2, y: 3)] {
            var moveTrace: [String] = []
            var storedPosition: AppControllerCursorPosition?
            do {
                _ = try prepareControllerMouseMove(to: requested,
                    writePosition: { moveTrace.append("write"); storedPosition = $0 },
                    readScale: { moveTrace.append("scale"); return 2 },
                    readVisibleRect: { moveTrace.append("rect"); return CGRect(x: -10, y: 20, width: 300, height: 400) },
                    orderedWindows: { moveTrace.append("windows"); return [7] },
                    resolve: { (point: CGPoint, windows: [Int]) throws -> Int in
                        moveTrace.append("resolve"); checkEqual(windows, [7])
                        checkEqual(point, requested == nil ? CGPoint(x: -10, y: 20) : CGPoint(x: -14, y: 26))
                        throw MovePreparationFailure.resolution
                    })
                preconditionFailure("Expected resolution failure")
            } catch MovePreparationFailure.resolution {}
            checkEqual(storedPosition, requested ?? .init(x: 0, y: 0))
            checkEqual(moveTrace, ["write", "scale", "rect", "windows", "resolve"])
        }
        var controllerTrace: [String] = []
        var scrollControllerPosition = AppControllerCursorPosition(x: 1, y: 2)
        try await performControllerScroll(deltaX: -3, deltaY: 4,
            readPosition: { controllerTrace.append("position"); return scrollControllerPosition },
            readScale: { controllerTrace.append("scale"); return 2 },
            readVisibleRect: { controllerTrace.append("rect"); return CGRect(x: -10, y: 20, width: 300, height: 400) },
            orderedWindows: { controllerTrace.append("windows"); return [7] },
            resolve: { point, windows in
                controllerTrace.append("resolve"); checkEqual(point, CGPoint(x: -8, y: 24))
                checkEqual(windows, [7]); return 42
            }, validateProcess: { destination in
                controllerTrace.append("validate"); checkEqual(destination, 42)
                scrollControllerPosition = .init(x: 5, y: 6)
            }, send: { destination, point, x, y in
                controllerTrace.append("send"); checkEqual(destination, 42)
                checkEqual(point, CGPoint(x: 0, y: 32)); checkEqual(x, -3); checkEqual(y, 4)
                await Task.yield(); controllerTrace.append("sent")
            })
        checkEqual(controllerTrace, ["position", "scale", "rect", "windows", "resolve", "validate",
            "scale", "rect", "position", "send", "sent"])
        enum CoordinateScrollFailure: Error { case movement }
        for shouldFail in [false, true] {
            var coordinateTrace: [String] = []
            do {
                try await performCoordinateScroll(point: CGPoint(x: -2.9, y: 7.9), direction: .right, pages: 0.5,
                    moveMouse: { position, timing in
                        coordinateTrace.append("move")
                        checkEqual(position, AppControllerCursorPosition(x: -2, y: 7))
                        checkEqual(timing, .finished)
                        if shouldFail { throw CoordinateScrollFailure.movement }
                        await Task.yield(); coordinateTrace.append("moved")
                    }, readVisibleRect: {
                        coordinateTrace.append("rect"); return CGRect(x: 500, y: 600, width: 240, height: 900)
                    }, scroll: { x, y in coordinateTrace.append("scroll"); checkEqual(x, 120); checkEqual(y, 0) })
                checkTrue(!shouldFail)
            } catch CoordinateScrollFailure.movement { checkTrue(shouldFail) }
            checkEqual(coordinateTrace, shouldFail ? ["move"] : ["move", "moved", "rect", "scroll"])
        }
        enum ElementScrollFailure: Error { case point, movement }
        for mode in 0..<4 {
            var trace: [String] = []
            do {
                try await performElementScroll(direction: .down, pages: 0.5,
                    readFrame: { trace.append("frame"); return CGRect(x: 0, y: 0, width: 200, height: 300) },
                    readVisibleRect: { trace.append("rect"); return CGRect(x: -10, y: 20, width: 800, height: 900) },
                    clickablePoint: {
                        trace.append("point")
                        if mode == 2 { throw ElementScrollFailure.point }
                        return mode == 0 ? nil : CGPoint(x: -15, y: 27)
                    }, readScale: { trace.append("scale"); return 2 },
                    moveMouse: { position, timing in
                        trace.append("move")
                        checkEqual(position, AppControllerCursorPosition(x: -2, y: 3))
                        checkEqual(timing, .finished)
                        if mode == 3 { throw ElementScrollFailure.movement }
                        await Task.yield(); trace.append("moved")
                    }, scroll: { x, y in
                        trace.append("scroll"); checkEqual(x, 0); checkEqual(y, -150)
                    })
                checkTrue(mode < 2)
            } catch let error as ElementScrollFailure {
                switch error { case .point: checkEqual(mode, 2); case .movement: checkEqual(mode, 3) }
            }
            let expected: [String]
            switch mode {
            case 0: expected = ["frame", "point", "scroll"]
            case 1: expected = ["frame", "point", "scale", "rect", "move", "moved", "scroll"]
            case 2: expected = ["frame", "point"]
            default: expected = ["frame", "point", "scale", "rect", "move"]
            }
            checkEqual(trace, expected)
        }
        let scrollFrame = CGRect(x: -10, y: 20, width: -40, height: -50)
        let scrollPoint = CGPoint(x: -15, y: 27)
        checkEqual(elementScrollCursorPosition(clickablePoint: scrollPoint, scalingFactor: 2,
            visibleRect: scrollFrame), AppControllerCursorPosition(x: -2, y: 3))
        for scale: CGFloat in [0, -2, .nan, -.infinity] {
            checkEqual(elementScrollCursorPosition(clickablePoint: scrollPoint, scalingFactor: scale,
                visibleRect: scrollFrame), AppControllerCursorPosition(x: -5, y: 7))
        }
        checkEqual(elementScrollCursorPosition(clickablePoint: scrollPoint, scalingFactor: .infinity,
            visibleRect: scrollFrame), AppControllerCursorPosition(x: 0, y: 0))
        for frame: CGRect? in [nil, .zero, CGRect(x: 8, y: 9, width: -20, height: 70)] {
            var sizeReads: [String] = []
            let size = elementScrollPageSize(readFrame: { sizeReads.append("frame"); return frame },
                readVisibleRect: { sizeReads.append("visible"); return CGRect(x: 0, y: 0, width: 400, height: 600) })
            checkEqual(size, frame?.size ?? CGSize(width: 400, height: 600))
            checkEqual(sizeReads, frame == nil ? ["frame", "visible"] : ["frame"])
        }
        for direction in [AppControllerScrollDirection.up, .down, .left, .right] {
            let vertical = direction == .up || direction == .down
            checkEqual(direction.pageExtent(size: CGSize(width: 240, height: 360)), vertical ? 360 : 240)
            for dimension in [-20.0, 0, 99.5, 100] {
                checkEqual(direction.pageExtent(size: CGSize(width: dimension, height: dimension)), 100)
            }
            checkTrue(direction.pageExtent(size: CGSize(width: Double.nan, height: Double.nan)).isNaN)
        }
        for (direction, x, y) in [(AppControllerScrollDirection.up, 0, 3), (.down, 0, -3),
            (.left, -3, 0), (.right, 3, 0)] {
            let delta = direction.deltas(pages: 0.5, pageExtent: 5)
            checkEqual(delta.x, x); checkEqual(delta.y, y)
        }
        checkEqual(AppControllerScrollDirection.right.deltas(pages: 0.01, pageExtent: 1).x, 0)
        checkEqual(AppControllerScrollDirection.right.deltas(pages: -0.5, pageExtent: 5).x, -3)
        var targetTrace: [String] = []
        var positionReadCount = 0
        let preparedScroll = try prepareControllerScrollTarget(readPosition: {
            targetTrace.append("position"); positionReadCount += 1
            return AppControllerCursorPosition(x: positionReadCount, y: 3)
        }, readScale: { targetTrace.append("scale"); return 2 },
            readVisibleRect: { targetTrace.append("rect"); return CGRect(x: -10, y: 20, width: 30, height: 40) },
            orderedWindows: { targetTrace.append("windows"); return [7] },
            resolve: { point, windows in
                checkEqual(point, CGPoint(x: -8, y: 26)); checkEqual(windows, [7])
                targetTrace.append("resolve"); return 42
            }, validateProcess: { target in checkEqual(target, 42); targetTrace.append("validate") })
        checkEqual(preparedScroll.target, 42); checkEqual(preparedScroll.point, CGPoint(x: -6, y: 26))
        checkEqual(targetTrace, ["position", "scale", "rect", "windows", "resolve", "validate", "scale", "rect", "position"])
        enum ScrollTargetFailure: Error { case windows, resolve, denied }
        for failure in [ScrollTargetFailure.windows, .resolve, .denied] {
            var failedTrace: [String] = []
            do {
                _ = try prepareControllerScrollTarget(readPosition: {
                    failedTrace.append("position"); return .init(x: 1, y: 2)
                }, readScale: { failedTrace.append("scale"); return 1 },
                    readVisibleRect: { failedTrace.append("rect"); return .zero },
                    orderedWindows: { () throws -> [Int] in
                        failedTrace.append("windows")
                        if case .windows = failure { throw failure }; return []
                    }, resolve: { _, windows in
                        checkTrue(windows.isEmpty); failedTrace.append("resolve")
                        if case .resolve = failure { throw failure }; return 42
                    }, validateProcess: { _ in failedTrace.append("validate"); throw failure })
                preconditionFailure("Expected target preparation failure")
            } catch let error as ScrollTargetFailure {
                switch (failure, error) {
                case (.windows, .windows), (.resolve, .resolve), (.denied, .denied): break
                default: preconditionFailure("Preparation changed error")
                }
            }
            let prefix = ["position", "scale", "rect", "windows"]
            switch failure {
            case .windows: checkEqual(failedTrace, prefix)
            case .resolve: checkEqual(failedTrace, prefix + ["resolve"])
            case .denied: checkEqual(failedTrace, prefix + ["resolve", "validate"])
            }
        }
        let controllerPosition = AppControllerCursorPosition(x: 12, y: -4)
        checkEqual(controllerPosition.applying(scalingFactor: 2, convertingToScreenFromWindowFrame: nil),
            CGPoint(x: 24, y: -8))
        checkEqual(controllerPosition.applying(scalingFactor: 0.5,
            convertingToScreenFromWindowFrame: CGRect(x: -100, y: 300, width: -40, height: -50)),
            CGPoint(x: -94, y: 298))
        try await dispatchControllerScroll(at: CGPoint(x: -4, y: 20), deltaX: -7, deltaY: 13,
            targetPID: 42, window: nil, makeEvent: { point, x, y, window in
                checkEqual(point, CGPoint(x: -4, y: 20)); checkEqual(x, -7); checkEqual(y, 13)
                checkTrue(window == nil); scrollDispatchTrace.append("make"); return 99
            }, sendEvent: { event, pid, delay in
                checkEqual(event, 99); checkEqual(pid, 42); checkEqual(delay, .milliseconds(10))
                scrollDispatchTrace.append("send")
            })
        checkEqual(scrollDispatchTrace, ["make", "send"])
        var concreteScrollPosts = 0
        var concreteScrollWaits = 0
        let concreteScrollInstant = ContinuousClock().now
        try await dispatchControllerScroll(at: CGPoint(x: -4, y: 20), deltaX: 0, deltaY: -13,
            targetPID: 42, window: nil, post: { event, pid in
                checkEqual(pid, 42); checkEqual(event.type, .scrollWheel)
                checkEqual(event.location, CGPoint(x: -4, y: 20))
                checkEqual(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1), -13)
                concreteScrollPosts += 1
            }, now: { concreteScrollInstant }, sleepUntil: { deadline in
                checkEqual(deadline, concreteScrollInstant.advanced(by: .milliseconds(10)))
                concreteScrollWaits += 1
            })
        checkEqual(concreteScrollPosts, 1); checkEqual(concreteScrollWaits, 1)
        let sendEvents = SynthesizedEvent(cgEvents: [CGEvent(source: nil)!, CGEvent(source: nil)!])
        var sendTrace: [String] = []
        let sendInstant = ContinuousClock().now
        try await sendEvents.send(to: 42, delay: .milliseconds(10), post: { _, pid in
            checkEqual(pid, 42); sendTrace.append("post")
        }, now: { sendTrace.append("now"); return sendInstant }, sleepUntil: { deadline in
            checkEqual(deadline, sendInstant.advanced(by: .milliseconds(10))); sendTrace.append("sleep")
        })
        checkEqual(sendTrace, ["post", "now", "sleep", "post", "now", "sleep"])
        sendTrace = []
        try await sendEvents.send(to: 42, delay: nil, post: { _, _ in sendTrace.append("post") },
            now: { unexpectedFailure() }, sleepUntil: { _ in unexpectedFailure() })
        checkEqual(sendTrace, ["post", "post"])
        try await SynthesizedEvent(cgEvents: []).send(to: 42, delay: .milliseconds(10),
            post: { _, _ in unexpectedFailure() }, now: { unexpectedFailure() },
            sleepUntil: { _ in unexpectedFailure() })
        enum SendWaitFailure: Error { case rejected }
        sendTrace = []
        do {
            try await sendEvents.send(to: 42, delay: .milliseconds(10),
                post: { _, _ in sendTrace.append("post") }, now: { sendInstant },
                sleepUntil: { _ in sendTrace.append("sleep"); throw SendWaitFailure.rejected })
            preconditionFailure("Expected send wait failure")
        } catch SendWaitFailure.rejected {}
        checkEqual(sendTrace, ["post", "sleep"])
        sendTrace = []
        do {
            try await sendEvents.send(to: 42, delay: .zero,
                post: { _, _ in sendTrace.append("post") }, now: { sendInstant },
                sleepUntil: { deadline in
                    checkEqual(deadline, sendInstant); sendTrace.append("cancel"); throw CancellationError()
                })
            preconditionFailure("Expected send cancellation")
        } catch is CancellationError {}
        checkEqual(sendTrace, ["post", "cancel"])
        let composed = selectionDescriptionPresentation(windowTitle: nil, applicationName: "",
            mode: .fullTree, tree: .fullTree(["0 button"]),
            focus: .init(selectedText: nil, lines: ["0 button"]), summarizesRemovedElementIDs: true)
        checkEqual(composed.text, "Window: \"Unknown\", App: .\n0 button\n\nThe focused UI element is 0 button")
        let diffComposed = selectionDescriptionPresentation(windowTitle: "", applicationName: nil,
            mode: .difference(from: .initial), tree: .difference([]),
            focus: .init(selectedText: text, lines: []), summarizesRemovedElementIDs: false)
        checkEqual(diffComposed, AccessibilityTreePresentation.unchanged(windowTitle: "",
            focusedElement: nil, selectedText: text, selectedElements: []))
        let focus = selectionDescriptionFocus(readSelectedText: { text },
            readFocusLines: { unexpectedFailure() })
        checkEqual(focus.selectedText, text)
        checkTrue(focus.lines.isEmpty)
        checkEqual(focus.presentationContext.selectedText, text)
        checkTrue(focus.presentationContext.focusedElement == nil)
        checkTrue(focus.presentationContext.selectedElements.isEmpty)
    }
    for lines: [String]? in [nil, [], [""], ["first\nsecond"], ["first", "second"]] {
        var trace: [String] = []
        let focus = selectionDescriptionFocus(readSelectedText: {
            trace.append("text"); return nil
        }, readFocusLines: { trace.append("lines"); return lines })
        checkTrue(focus.selectedText == nil)
        checkEqual(focus.lines, lines ?? [])
        checkEqual(focus.presentationContext.focusedElement, lines?.count == 1 ? lines?[0] : nil)
        checkEqual(focus.presentationContext.selectedElements, lines?.count == 1 ? [] : (lines ?? []))
        checkEqual(trace, ["text", "lines"])
    }
    for enabled in [false, true] {
        for didScroll in [false, true] {
            var trace: [String] = []
            var resolutions = 0
            let result = try await prepareInteractionElement(positionElement: enabled, resolve: {
                resolutions += 1; trace.append("resolve"); return resolutions
            }, activateFocusEnforcer: { trace.append("enforcer") }, position: { element in
                checkEqual(element, 1); trace.append("position"); return didScroll
            })
            checkEqual(result, enabled && didScroll ? 2 : 1)
            checkEqual(trace, ["resolve", "enforcer"] + (enabled ? ["position"] : [])
                + (enabled && didScroll ? ["resolve"] : []))
        }
    }
    enum PreparationFailure: Error { case rejected }
    var processTrace: [String] = []
    do {
        _ = try await prepareInteraction(positionElement: true,
            resolve: { processTrace.append("resolve"); return processTrace.count },
            activateFocusEnforcer: { processTrace.append("enforcer") },
            position: { _ in processTrace.append("position"); return true },
            validateProcess: { element in
                checkEqual(element, 4); processTrace.append("validate"); throw PreparationFailure.rejected
            })
        unexpectedFailure()
    } catch PreparationFailure.rejected {}
    checkEqual(processTrace, ["resolve", "enforcer", "position", "resolve", "validate"])
    for absent in 0...2 {
        var processReads: [String] = []
        try validateInteractionProcess(pid: 123, application: { pid -> Int32? in
            checkEqual(pid, 123); processReads.append("app"); return absent == 0 ? nil : pid
        }, bundleIdentifier: { _ in
            processReads.append("bundle"); return absent == 1 ? nil : "com.example.ordinary"
        }, securityBundleIdentifiers: {
            processReads.append("security"); return NativeForbiddenTargets.systemAuthentication
        }, reject: { _ in throw PreparationFailure.rejected })
        checkEqual(processReads, Array(["app", "bundle", "security"].prefix(absent + 1)))
    }
    for bundle in NativeForbiddenTargets.systemAuthentication {
        do {
            try validateInteractionProcess(pid: 123, application: { _ in 123 },
                bundleIdentifier: { _ in bundle },
                securityBundleIdentifiers: { NativeForbiddenTargets.systemAuthentication },
                reject: { rejected in checkEqual(rejected, bundle); throw PreparationFailure.rejected })
            unexpectedFailure()
        } catch PreparationFailure.rejected {}
    }
    var failedTrace: [String] = []
    do {
        _ = try await prepareInteractionElement(positionElement: true,
            resolve: { failedTrace.append("resolve"); return 1 },
            activateFocusEnforcer: { failedTrace.append("enforcer") },
            position: { _ in failedTrace.append("position"); throw PreparationFailure.rejected })
        unexpectedFailure()
    } catch PreparationFailure.rejected {}
    checkEqual(failedTrace, ["resolve", "enforcer", "position"])
    let protocolElement: any UIElementProtocol = RefetchReconstructionProbe(
        element: AXUIElementCreateApplication(2147480020), reconstructed: false)
    // Missing known-unsupported frame must propagate the native geometry error;
    // the default protocol entry cannot scroll or silently use position/size.
    do {
        _ = try await protocolElement.clickablePoint(reportError: { _ in unexpectedFailure() })
        unexpectedFailure()
    } catch UIElementGeometryError.elementHasNoFrame {}
    checkTrue(protocolElement.scrollContentFrame(reportError: { _ in unexpectedFailure() }).isNull)
    for scroll in [false, true] {
        do {
            _ = try await protocolElement.clickablePoint(scrollToVisible: scroll,
                reportError: { _ in unexpectedFailure() })
            unexpectedFailure()
        } catch UIElementGeometryError.elementHasNoFrame {}
    }
    var phases: [String] = []
    var current = CGRect(x: 500, y: 500, width: 20, height: 20)
    let clip = CGRect(x: 0, y: 0, width: 100, height: 100)
    let resolved = try await uiElementClickablePoint(scrollToVisible: true,
        preferredPoint: { nil }, frameBeforeScroll: { current },
        scrollFrameToVisible: { original in
            precondition(original.minX == 500)
            return try executeUIElementScrollOperations([.frame(1), .action(2)], frame: original,
                performAction: { _ in phases.append("action"); current = CGRect(x: 20, y: 30, width: 20, height: 20) },
                setScrollAttribute: { _ in preconditionFailure() },
                scrollFrame: { _, frame in precondition(frame == original); phases.append("frame"); return false },
                pollForGeometryChange: { phases.append("poll") })
        }, readFrameAttribute: { fresh in precondition(fresh); phases.append("freshFrame"); return current },
        clippingFrame: { fresh in precondition(fresh); phases.append("freshClip"); return clip })
    precondition(resolved.point == CGPoint(x: 30, y: 40) && resolved.didScroll)
    precondition(phases == ["frame", "action", "poll", "freshFrame", "freshClip"])
}

@MainActor
private func runElementPositionCompositionChecks() async throws {
    let owner = ComputerUseCursor(style: SoftwareCursorStyle(), motionConfiguration: .live)
    var phases: [String] = []
    var env = CursorWindowMoveEnvironment()
    env.associate = { window, id, _ in
        precondition(id == 7 && owner.targetWindowID == 7 && owner.isMoving)
        phases.append("move")
        window.correspondingWindowID = id
    }
    env.windowFrame = { _ in nil }
    env.zeroScreenFrame = { CGRect(x: 0, y: 0, width: 1000, height: 1000) }
    env.screenFrames = { [CGRect(x: 0, y: 0, width: 1000, height: 1000)] }
    let scrolled = try await positionElementCursor(timing: .finished, animated: false,
        clickablePoint: { scroll in precondition(scroll); phases.append("geometry"); return (CGPoint(x: 40, y: 60), true) },
        cursorFeatureEnabled: { phases.append("feature"); return true },
        createCursor: { phases.append("cursor"); return owner },
        selectedWindowID: { phases.append("selection"); return 7 }, environment: env)
    precondition(scrolled && phases == ["geometry", "feature", "cursor", "selection", "move"])
    precondition(!owner.isMoving && !owner.window.isVisible)
    let skipped = try await positionElementCursor(timing: nil, animated: true,
        clickablePoint: { scroll in precondition(scroll); return (CGPoint.zero, true) },
        cursorFeatureEnabled: { preconditionFailure() }, createCursor: { preconditionFailure() },
        selectedWindowID: { preconditionFailure() })
    precondition(skipped)
    let disabled = try await positionElementCursor(timing: .closeEnough, animated: true,
        clickablePoint: { _ in (CGPoint.zero, false) }, cursorFeatureEnabled: { false },
        createCursor: { preconditionFailure() }, selectedWindowID: { preconditionFailure() })
    precondition(!disabled)
}

private func runApplicationWindowStorageChecks() {
    let ax = AXUIElementCreateApplication(getpid())
    let other = AXUIElementCreateApplication(Int32.max)
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let window = WindowUIElement(axElement: other, cache: cache)
    let first = NativeWindowDescription([kCGWindowNumber as String: UInt32(7),
        kCGWindowOwnerPID as String: Int32(42)])
    let object = ApplicationWindow(cgWindow: first, axWindow: window, axApplication: app)
    let retained = object
    precondition(object.id == 7 && CFEqual(object.axWindow.axElement, other))
    precondition(CFEqual(object.axApplication.axElement, ax))
    object.cgWindow = NativeWindowDescription([kCGWindowNumber as String: UInt32(9)])
    object.axWindow = WindowUIElement(axElement: ax, cache: cache)
    precondition(retained === object && retained.id == 9)
    precondition(CFEqual(retained.axWindow.axElement, ax) && CFEqual(retained.axApplication.axElement, ax))
}

private func runSystemSelectionStorageChecks() throws {
    let ax = AXUIElementCreateApplication(getpid())
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let window = WindowUIElement(axElement: ax, cache: cache)
    func makeWindow(_ id: UInt32) -> ApplicationWindow {
        ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: id]),
            axWindow: window, axApplication: app)
    }
    func makeRevision() throws -> UIElementTreeRevision<TransformedUIElement> {
        try UIElementTreeRevision.root(UIElementTree(items: [], focusedElement: nil),
            focusTree: nil, lineageID: "selection") { _ in
                UIElementRenderTree(isFocus: false, roots: [])
            }
    }
    let first = makeWindow(7), second = makeWindow(9)
    let revision = try makeRevision(), replacement = try makeRevision()
    let selection = SystemSelection(applicationWindow: first, windowRevision: revision, invalidationMonitor: nil)
    var descriptionTrace: [String] = []
    let boundPresentation = selection.descriptionPresentation(mode: .fullTree, lineOptions: [],
        summarizesRemovedElementIDs: true, onLineBudgetExceeded: { _ in unexpectedFailure() },
        readWindowTitle: { owner in
            checkTrue(owner === first); descriptionTrace.append("title"); return "bound title"
        }, readApplicationName: { owner in
            checkTrue(owner === first); descriptionTrace.append("name"); return "bound app"
        }, readSelectedText: { _ in descriptionTrace.append("selected"); return nil })
    checkEqual(Array(descriptionTrace.prefix(2)), ["title", "name"])
    checkTrue(boundPresentation.text.hasPrefix("Window: \"bound title\", App: bound app.\n"))
    var llmTrace: [String] = []
    let boundText = selection.llmDescription(.fullTree, lineOptions: [],
        onLineBudgetExceeded: { _ in unexpectedFailure() }, readSummaryFeature: { unexpectedFailure() },
        readWindowTitle: { _ in llmTrace.append("title"); return "bound title" },
        readApplicationName: { _ in llmTrace.append("name"); return "bound app" },
        readSelectedText: { _ in unexpectedFailure() },
        readBundleIdentifier: { owner in checkTrue(owner === first); llmTrace.append("bundle"); return nil })
    checkEqual(boundText, boundPresentation.text)
    checkEqual(llmTrace, ["title", "name", "bundle"])
    for bundle: String? in [nil, "", "com.spotify.client.extra", "COM.SPOTIFY.CLIENT", "other"] {
        checkEqual(selectionDescriptionText(boundPresentation, bundleIdentifier: bundle), boundPresentation.text)
    }
    let spotifyDescription = selectionDescriptionText(boundPresentation, bundleIdentifier: "com.spotify.client")
    checkTrue(spotifyDescription.hasPrefix(boundPresentation.text + "\n\nNote: In order to be usable, Spotify app links"))
    checkTrue(spotifyDescription.contains("open.spotify.com instead of xpui.app.spotify.com"))
    checkEqual(boundPresentation.text.hasSuffix("\n"), true)
    checkEqual(first.appName(readLocalizedName: { pid in
        checkEqual(pid, first.cgWindow.ownerPID); return "localized"
    }), "localized")
    checkEqual(first.appName(readLocalizedName: { _ in "" }), "")
    checkEqual(first.appName(readLocalizedName: { _ in nil }), first.cgWindow.ownerName)
    checkEqual(applicationWindowTitle(cgTitle: "CG", readAXTitle: { unexpectedFailure() },
        isDesktopLevel: { unexpectedFailure() }, readBundleIdentifier: { unexpectedFailure() }), "CG")
    checkEqual(applicationWindowTitle(cgTitle: "", readAXTitle: { unexpectedFailure() },
        isDesktopLevel: { false }, readBundleIdentifier: { unexpectedFailure() }), "")
    checkEqual(applicationWindowTitle(cgTitle: nil, readAXTitle: { "AX" },
        isDesktopLevel: { unexpectedFailure() }, readBundleIdentifier: { unexpectedFailure() }), "AX")
    for candidate: String? in [nil, ""] {
        checkEqual(applicationWindowTitle(cgTitle: candidate, readAXTitle: { nil },
            isDesktopLevel: { true }, readBundleIdentifier: { "com.apple.finder" }), "Desktop")
        checkEqual(applicationWindowTitle(cgTitle: candidate, readAXTitle: { nil },
            isDesktopLevel: { true }, readBundleIdentifier: { "other" }), candidate)
    }
    let tree = try RefetchableSkyshotAXTree(systemSelection: selection, isAXTreeDiffingEnabled: true)
    var copied = tree.systemSelection
    copied.applicationWindow = second
    copied.windowRevision = replacement
    precondition(tree.applicationWindow === first && tree.systemSelection.windowRevision === revision)
    first.cgWindow = NativeWindowDescription([kCGWindowNumber as String: UInt32(11)])
    precondition(selection.applicationWindow.id == 11 && tree.applicationWindow.id == 11)
    tree.systemSelection = copied
    precondition(tree.applicationWindow === second && tree.systemSelection.windowRevision === replacement)
    precondition(tree.isAXTreeDiffingEnabled && tree.systemSelection.invalidationMonitor == nil)
    enum ExtractionFailure: Error { case rejected }
    let before = tree.systemSelection.windowRevision
    do {
        try tree.refetchTree { throw ExtractionFailure.rejected }
        preconditionFailure()
    } catch ExtractionFailure.rejected {}
    precondition(tree.systemSelection.windowRevision === before)
    var extractionCalls = 0
    let published = try tree.refetchTree {
        extractionCalls += 1
        precondition(tree.systemSelection.windowRevision === before)
        return selection
    }
    precondition(extractionCalls == 1 && published.windowRevision === revision)
    precondition(tree.systemSelection.windowRevision === revision && tree.applicationWindow === first)
    let disabled = try RefetchableSkyshotAXTree(systemSelection: selection, isAXTreeDiffingEnabled: false)
    precondition(!disabled.isAXTreeDiffingEnabled && disabled.applicationWindow === first)
    var stages: [String] = []
    let extractedOnly = try tree.extractRefetchSelection(readContext: { _ in
        stages.append("context")
        return FocusedUIElementContext(element: nil, applicationWindow: second)
    }, extract: { request in
        stages.append("extract")
        checkTrue(request.previousRevision === revision)
        return copied
    })
    checkEqual(stages, ["context", "extract"])
    checkTrue(extractedOnly.windowRevision === replacement)
    checkTrue(tree.systemSelection.windowRevision === revision && tree.applicationWindow === first)
    stages.removeAll()
    let refreshed = try tree.refetchTree(readContext: { application in
        checkEqual(application.axElement, app.axElement)
        stages.append("context")
        return FocusedUIElementContext(element: nil, applicationWindow: second)
    }, extract: { request in
        stages.append("extract")
        checkTrue(request.context.applicationWindow === second)
        checkTrue(request.previousRevision === revision && request.isAXTreeDiffingEnabled)
        checkTrue(request.treeCache == nil && request.rootElement == nil)
        checkEqual(request.contextType, .fullUIContext)
        checkTrue(request.performAccessibilityEnablement && !request.alwaysIncludeScreenshot)
        return copied
    })
    checkEqual(stages, ["context", "extract"])
    checkTrue(refreshed.windowRevision === replacement && tree.applicationWindow === second)
    do {
        _ = try tree.refetchTree(readContext: { _ in throw ExtractionFailure.rejected },
            extract: { _ in unexpectedFailure() })
        unexpectedFailure()
    } catch ExtractionFailure.rejected {}
    checkTrue(tree.systemSelection.windowRevision === replacement)
}

private func runAXWindowDescriptionResolutionChecks() {
    enum Failure: Error { case windowID }
    let frame = CGRect(x: 10, y: 20, width: 30, height: 40)
    func window(_ id: UInt32, pid: Int32 = 42, name: String? = "A", bounds: CGRect? = nil) -> NativeWindowDescription {
        var description: [String: Any] = [kCGWindowNumber as String: id, kCGWindowOwnerPID as String: pid,
            kCGWindowBounds as String: (bounds ?? frame).dictionaryRepresentation]
        if let name { description[kCGWindowName as String] = name }
        return NativeWindowDescription(description)
    }
    let first = window(1), second = window(2), otherName = window(3, name: "B")
    let direct = resolveAXWindowDescription(readWindowID: { 7 }, lookupWindow: { id in
        precondition(id == 7); return first
    }, fallback: { preconditionFailure("Direct match called fallback") })
    precondition(direct?.id == 1)
    let failed = resolveAXWindowDescription(readWindowID: { throw Failure.windowID },
        lookupWindow: { _ in preconditionFailure() }, fallback: { second })
    precondition(failed?.id == 2)
    let missing = resolveAXWindowDescription(readWindowID: { 7 }, lookupWindow: { _ in nil }, fallback: { nil })
    precondition(missing == nil)
    var ambiguities: [Int] = []
    func match(_ windows: [NativeWindowDescription], title: String = "A") -> UInt32? {
        matchAXWindowDescription(windows, processID: 42, frame: frame, title: title,
            reportAmbiguity: { ambiguities.append($0) })?.id
    }
    precondition(match([first], title: "different") == 1)
    precondition(match([otherName, second]) == 2)
    precondition(match([second, first]) == 2 && ambiguities == [2])
    precondition(match([first, second], title: "missing") == nil)
    precondition(match([window(4, pid: 99)]) == nil)
    precondition(match([window(5, bounds: frame.offsetBy(dx: 0.1, dy: 0))]) == nil)
}

private func runAXWindowDescriptionFallbackChecks() {
    enum Failure: Error { case pid }
    let desktop = NativeWindowDescription([kCGWindowNumber as String: UInt32(8), kCGWindowOwnerPID as String: Int32(42)])
    let ordinary = NativeWindowDescription([kCGWindowNumber as String: UInt32(9), kCGWindowOwnerPID as String: Int32(0),
        kCGWindowBounds as String: CGRect(x: 1, y: 2, width: 3, height: 4).dictionaryRepresentation])
    let found = resolveAXWindowDescriptionFallback(isScrollArea: { true }, applicationPID: { 42 },
        bundleIdentifier: { _ in "com.apple.finder" }, desktopWindows: { [desktop] }, isDesktopLevel: { _ in true },
        frame: { preconditionFailure() }, title: { preconditionFailure() }, ordinaryWindows: { preconditionFailure() },
        reportAmbiguity: { _ in preconditionFailure() })
    precondition(found?.id == 8)
    var phases: [String] = []
    let fallback = resolveAXWindowDescriptionFallback(isScrollArea: { false },
        applicationPID: { phases.append("pid"); throw Failure.pid }, bundleIdentifier: { _ in preconditionFailure() },
        desktopWindows: { preconditionFailure() }, isDesktopLevel: { _ in preconditionFailure() },
        frame: { phases.append("frame"); return ordinary.bounds }, title: { phases.append("title"); return "" },
        ordinaryWindows: { phases.append("windows"); return [ordinary] }, reportAmbiguity: { _ in preconditionFailure() })
    precondition(fallback?.id == 9 && phases == ["frame", "title", "pid", "windows"])
    let missingTitle = resolveAXWindowDescriptionFallback(isScrollArea: { false }, applicationPID: { preconditionFailure() },
        bundleIdentifier: { _ in preconditionFailure() }, desktopWindows: { preconditionFailure() },
        isDesktopLevel: { _ in preconditionFailure() }, frame: { ordinary.bounds }, title: { nil },
        ordinaryWindows: { preconditionFailure() }, reportAmbiguity: { _ in preconditionFailure() })
    precondition(missingTitle == nil)
}

private func runTreeInvalidationMonitorChecks() {
    enum Failure: Error { case registration, pid }
    final class Observer {}
    var phases: [String] = []
    let success = makeTreeInvalidationObserver(processID: { phases.append("pid"); return 42 },
        create: { pid in precondition(pid == 42); phases.append("create"); return Observer() },
        register: { _, notification in phases.append(notification.name as String) },
        start: { _, qos in precondition(qos == .utility); phases.append("start") })
    precondition(success != nil && phases == ["pid", "create", "AXLayoutChanged", "AXUIElementDestroyed", "start"])
    phases = []
    let failed = makeTreeInvalidationObserver(processID: { 42 }, create: { _ in Observer() },
        register: { _, _ in phases.append("register"); throw Failure.registration },
        start: { _, _ in preconditionFailure() })
    precondition(failed == nil && phases == ["register"])
    let ax = AXUIElementCreateApplication(getpid())
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let monitor = UIElementTreeInvalidationMonitor(app: ApplicationUIElement(axElement: ax, cache: cache),
        processID: { _ in throw Failure.pid })
    precondition(monitor.observer == nil)
    monitor.state.withLock { precondition(!$0.layoutChanged && $0.destroyedElements.isEmpty) }
    recordTreeInvalidation(.uiElementDestroyed, element: ax, state: monitor.state)
    recordTreeInvalidation(.uiElementDestroyed, element: ax, state: monitor.state)
    monitor.state.withLock { precondition(!$0.layoutChanged && $0.destroyedElements.count == 1) }
    recordTreeInvalidation(AXNotification("AXLayoutChanged"), element: ax, state: monitor.state)
    recordTreeInvalidation(.windowMoved, element: ax, state: monitor.state)
    monitor.state.withLock { precondition($0.layoutChanged && $0.destroyedElements.count == 1) }
}

private func runRefetchableElementResolutionChecks() throws {
    enum Failure: Error { case monitor, invalidElement, refresh }
    let target = AXUIElementCreateApplication(getpid())
    let other = AXUIElementCreateApplication(Int32.max)
    for layout in [false, true] {
        for destroyed in [false, true] {
            for validate in [false, true] {
                for ignore in [false, true] {
                    var phases: [String] = []
                    let state = UIElementTreeInvalidationMonitor.State(layoutChanged: layout,
                        destroyedElements: destroyed ? [target] : [other])
                    let result = try resolveRefetchableElement(17, validateElement: validate, ignoreValueChange: ignore,
                        invalidationState: { phases.append("state"); return state },
                        identity: { value in precondition(value == 17); phases.append("identity"); return target },
                        refetch: { value, flag in
                            precondition(value == 17 && flag == ignore); phases.append("refresh"); return 23
                        }, readRoleError: { _ in phases.append("validate"); return .success },
                        invalidElementError: { preconditionFailure() },
                        wrap: { value in phases.append("wrap"); return value })
                    if layout || destroyed {
                        precondition(result == 23)
                        precondition(phases == (layout ? ["state", "refresh"] : ["state", "identity", "refresh"]))
                    } else {
                        precondition(result == 17)
                        precondition(phases == (validate ? ["state", "identity", "validate", "wrap"] : ["state", "identity", "wrap"]))
                    }
                }
            }
        }
    }
    // A successful role decode is not required; only invalidUIElement fails
    // validation. cannotComplete/attributeUnsupported must not trigger refresh.
    for error in [AXError.success, .cannotComplete, .attributeUnsupported, .invalidUIElement] {
        var wrapped = false
        do {
            _ = try resolveRefetchableElement(target, validateElement: true, ignoreValueChange: false,
                invalidationState: { .init() }, identity: { $0 },
                refetch: { _, _ -> Int in preconditionFailure() }, readRoleError: { _ in error },
                invalidElementError: { Failure.invalidElement }, wrap: { _ in wrapped = true; return 7 })
            precondition(error != .invalidUIElement && wrapped)
        } catch Failure.invalidElement { precondition(error == .invalidUIElement && !wrapped) }
    }
    do {
        _ = try resolveRefetchableElement(target, validateElement: true, ignoreValueChange: false,
            invalidationState: { throw Failure.monitor }, identity: { _ in preconditionFailure() },
            refetch: { _, _ -> Int in preconditionFailure() }, readRoleError: { _ in preconditionFailure() },
            invalidElementError: { preconditionFailure() }, wrap: { _ in preconditionFailure() })
        preconditionFailure()
    } catch Failure.monitor {}
    do {
        _ = try resolveRefetchableElement(target, validateElement: true, ignoreValueChange: true,
            invalidationState: { .init(layoutChanged: true) }, identity: { _ in preconditionFailure() },
            refetch: { _, ignore -> Int in precondition(ignore); throw Failure.refresh },
            readRoleError: { _ in preconditionFailure() }, invalidElementError: { preconditionFailure() },
            wrap: { _ in preconditionFailure() })
        preconditionFailure()
    } catch Failure.refresh {}
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let monitor = UIElementTreeInvalidationMonitor(app: ApplicationUIElement(axElement: target, cache: cache),
        processID: { _ in throw Failure.monitor })
    recordTreeInvalidation(.uiElementDestroyed, element: target, state: monitor.state)
    let snapshot = monitor.invalidationStateSnapshot()
    recordTreeInvalidation(AXNotification("AXLayoutChanged"), element: target, state: monitor.state)
    precondition(!snapshot.layoutChanged && snapshot.destroyedElements.contains(target))
    let next = monitor.invalidationStateSnapshot()
    precondition(next.layoutChanged && next.destroyedElements.contains(target))
    precondition(monitor.invalidationStateSnapshot().layoutChanged)
}

private func runRefetchableElementMatchingChecks() {
    let ax = AXUIElementCreateApplication(getpid())
    let other = AXUIElementCreateApplication(Int32.max)
    let fields = ["AXRole", "AXSubrole", "AXRoleDescription", "AXTitle", "AXValue", "AXValueDescription",
        "AXDescription", "AXPlaceholderValue", "AXHelp", "AXIdentifier", "AXURL"]
    func partial(_ value: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    var values: [UIElementAttribute: AXPartialValue] = [:]
    for field in fields {
        values[UIElementAttribute(field)] = partial((field == "AXRole" ? "AXButton" : field) as NSString)
    }
    values[UIElementAttribute("AXURL")] = partial(NSURL(string: "https://example.com/a")!)
    func element(_ attributes: [UIElementAttribute: AXPartialValue], identity: AXUIElement = ax) -> UIElement {
        UIElement(axElement: identity, cache: UIElementCache(supportedAttributes: [], attributes: attributes,
            transactionAttributes: nil))
    }
    let original = element(values)
    precondition(refetchableElementMatches(original, candidate: original, ignoreValueChange: false))
    // Comparator does not substitute identity equality for attribute equality.
    precondition(refetchableElementMatches(original, candidate: element(values, identity: other), ignoreValueChange: false))
    for field in fields {
        var changed = values
        changed[UIElementAttribute(field)] = field == "AXURL" ? partial(NSURL(string: "https://example.com/b")!) :
            partial((field == "AXRole" ? "AXTextField" : "changed") as NSString)
        let candidate = element(changed)
        precondition(!refetchableElementMatches(original, candidate: candidate, ignoreValueChange: false))
        precondition(refetchableElementMatches(original, candidate: candidate, ignoreValueChange: true) == (field == "AXValue"))
        changed.removeValue(forKey: UIElementAttribute(field))
        precondition(!refetchableElementMatches(original, candidate: element(changed), ignoreValueChange: false))
    }
    let roleOnly = [UIElementAttribute("AXRole"): partial("AXButton" as NSString)]
    precondition(refetchableElementMatches(element(roleOnly), candidate: element(roleOnly), ignoreValueChange: false))
    var emptyTitle = roleOnly
    emptyTitle[UIElementAttribute("AXTitle")] = partial("" as NSString)
    precondition(!refetchableElementMatches(element(roleOnly), candidate: element(emptyTitle), ignoreValueChange: true))
    var changedState = values
    changedState[UIElementAttribute("AXEnabled")] = partial(NSNumber(value: false))
    changedState[UIElementAttribute("AXFocused")] = partial(NSNumber(value: true))
    precondition(refetchableElementMatches(original, candidate: element(changedState), ignoreValueChange: false))
}

private func runRefetchableElementRecoveryChecks() throws {
    enum Failure: Error { case old(Int), missing, ambiguous(Int), refresh }
    func failure(_ reason: ElementRefreshLookupFailure) -> any Error {
        switch reason {
        case .previousMatchNotUnique(let count): return Failure.old(count)
        case .noRefreshedMatch: return Failure.missing
        case .refreshedMatchNotUnique(let count): return Failure.ambiguous(count)
        }
    }
    for ignore in [false, true] {
        var phases: [String] = []
        let fresh = try recoverRefetchableElement(7, ignoreValueChange: ignore,
            reconstruct: { value in precondition(value == 7); phases.append("reconstruct"); return 8 },
            matches: { old, new, flag in precondition(old == 7 && new == 8 && flag == ignore); phases.append("compare"); return true },
            currentSelection: { () -> Int in preconditionFailure() },
            matchingElements: { _, _, _ -> [Int] in preconditionFailure() },
            refetchTree: { preconditionFailure() }, lookupError: { _ in preconditionFailure() },
            wrapFresh: { value in phases.append("fresh"); return value }, wrapCandidate: { _ -> Int in preconditionFailure() })
        precondition(fresh == 8 && phases == ["reconstruct", "compare", "fresh"])
        for oldCount in [0, 1, 2] {
            for newCount in [0, 1, 2] {
                phases = []
                do {
                    let result = try recoverRefetchableElement(7, ignoreValueChange: ignore,
                        reconstruct: { _ in phases.append("reconstruct"); return 8 },
                        matches: { _, _, _ in phases.append("compare"); return false },
                        currentSelection: { phases.append("selection"); return 1 },
                        matchingElements: { selection, old, flag in
                            precondition(old == 7)
                            if selection == 1 {
                                precondition(!flag); phases.append("old"); return Array(repeating: 17, count: oldCount)
                            }
                            precondition(selection == 2 && flag == ignore)
                            phases.append("new"); return Array(repeating: 23, count: newCount)
                        }, refetchTree: { phases.append("refresh"); return 2 }, lookupError: failure,
                        wrapFresh: { _ -> Int in preconditionFailure() }, wrapCandidate: { value in phases.append("wrap"); return value })
                    precondition(oldCount == 1 && newCount == 1 && result == 23)
                } catch Failure.old(let count) { precondition(oldCount != 1 && count == oldCount) }
                  catch Failure.missing { precondition(oldCount == 1 && newCount == 0) }
                  catch Failure.ambiguous(let count) { precondition(oldCount == 1 && newCount == 2 && count == 2) }
                var expected = ["reconstruct", "compare", "selection", "old"]
                if oldCount == 1 { expected += ["refresh", "new"]; if newCount == 1 { expected.append("wrap") } }
                precondition(phases == expected)
            }
        }
    }
    do {
        _ = try recoverRefetchableElement(7, ignoreValueChange: false,
            reconstruct: { $0 }, matches: { _, _, _ in false }, currentSelection: { 1 },
            matchingElements: { _, _, _ in [17] }, refetchTree: { () throws -> Int in throw Failure.refresh },
            lookupError: failure, wrapFresh: { _ -> Int in preconditionFailure() }, wrapCandidate: { _ in preconditionFailure() })
        preconditionFailure()
    } catch Failure.refresh {}
}

private struct RefetchableWriteProbe: UIElementProtocol {
    static var role: UIElementRole? { nil }
    let axElement: AXUIElement
    let cache: UIElementCache
    let write: (Any, UIElementAttribute) throws -> Void
    init(element: AXUIElement) { preconditionFailure("Probe requires explicit cache and writer") }
    init(axElement: AXUIElement, cache: UIElementCache, write: @escaping (Any, UIElementAttribute) throws -> Void) {
        self.axElement = axElement; self.cache = cache; self.write = write
    }
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute) throws { try write(value, attribute) }
}

private func runRefetchableUIElementStorageChecks() throws {
    enum Failure: Error { case write, refresh }
    let first = AXUIElementCreateApplication(getpid()), second = AXUIElementCreateApplication(Int32.max)
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let nextCache = UIElementCache(supportedAttributes: [UIElementAttribute("AXTitle")], attributes: [:], transactionAttributes: nil)
    let window = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: WindowUIElement(axElement: first, cache: cache), axApplication: ApplicationUIElement(axElement: first, cache: cache))
    let revision = try UIElementTreeRevision.root(UIElementTree<TransformedUIElement>(items: [], focusedElement: nil),
        focusTree: nil, lineageID: "wrapper") { _ in UIElementRenderTree(isFocus: false, roots: []) }
    let selection = SystemSelection(applicationWindow: window, windowRevision: revision, invalidationMonitor: nil)
    let tree = try RefetchableSkyshotAXTree(systemSelection: selection, isAXTreeDiffingEnabled: true)
    let otherTree = try RefetchableSkyshotAXTree(systemSelection: selection, isAXTreeDiffingEnabled: false)
    var phases: [String] = []
    var throwWrite = false
    let original = RefetchableWriteProbe(axElement: first, cache: cache) { value, attribute in
        precondition(value as? String == "new" && attribute == UIElementAttribute("AXValue"))
        phases.append("write")
        if throwWrite { throw Failure.write }
    }
    let replacement = UIElement(axElement: second, cache: nextCache)
    let wrapper = RefetchableUIElement(element: original, containingTree: tree)
    let retained = wrapper
    precondition(CFEqual(wrapper.axElement, first) && wrapper.cache.supportedAttributes.isEmpty)
    for validate in [false, true] {
        for ignore in [false, true] {
            wrapper.element = original
            try wrapper.refetchIfNeeded(validateElement: validate, ignoreValueChange: ignore) { owner, old, v, i in
                precondition(owner === tree && CFEqual(old.axElement, first) && v == validate && i == ignore)
                return RefetchableUIElement(element: replacement, containingTree: otherTree)
            }
            precondition(retained === wrapper && wrapper.containingTree === tree && CFEqual(wrapper.axElement, second))
            precondition(wrapper.cache.supportedAttributes == nextCache.supportedAttributes)
        }
    }
    wrapper.element = original
    try wrapper.setValue("new", forAttribute: UIElementAttribute("AXValue")) { owner, old, validate, ignore in
        phases.append("refresh")
        precondition(owner === tree && CFEqual(old.axElement, first) && validate && ignore)
        return RefetchableUIElement(element: replacement, containingTree: tree)
    }
    precondition(phases == ["write", "refresh"] && CFEqual(wrapper.axElement, second))
    wrapper.element = original; phases = []; throwWrite = true
    do {
        try wrapper.setValue("new", forAttribute: UIElementAttribute("AXValue")) { _, _, _, _ in preconditionFailure() }
        preconditionFailure()
    } catch Failure.write {}
    precondition(phases == ["write"] && CFEqual(wrapper.axElement, first))
    throwWrite = false; phases = []
    do {
        try wrapper.setValue("new", forAttribute: UIElementAttribute("AXValue")) { _, _, _, _ in
            phases.append("refresh"); throw Failure.refresh
        }
        preconditionFailure()
    } catch Failure.refresh {}
    precondition(phases == ["write", "refresh"] && CFEqual(wrapper.axElement, first))
    phases = []
    do {
        try wrapper.setValue("new", forAttribute: UIElementAttribute("AXValue"),
            extractSelection: { unexpectedFailure() })
        unexpectedFailure()
    } catch RefetchableSkyshotAXTree.Error.noInvalidationMonitorProvided {}
    checkEqual(phases, ["write"])
    checkEqual(wrapper.axElement, first)
    throwWrite = true; phases = []
    do {
        try wrapper.setValue("new", forAttribute: UIElementAttribute("AXValue"),
            extractSelection: { unexpectedFailure() })
        unexpectedFailure()
    } catch Failure.write {}
    checkEqual(phases, ["write"])
}

private func runApplicationAXPrimaryWindowChecks() {
    var phases: [String] = []
    let focused = applicationPrimaryWindow(focusedWindow: { phases.append("focus"); return 7 },
        mainWindow: { () -> Int? in preconditionFailure() }, windows: { preconditionFailure() })
    precondition(focused == 7 && phases == ["focus"])
    phases = []
    let main = applicationPrimaryWindow(focusedWindow: { () -> Int? in phases.append("focus"); return nil },
        mainWindow: { phases.append("main"); return 9 }, windows: { preconditionFailure() })
    precondition(main == 9 && phases == ["focus", "main"])
    for windows in [[], [11], [11, 13, 17]] {
        phases = []
        let fallback = applicationPrimaryWindow(focusedWindow: { () -> Int? in phases.append("focus"); return nil },
            mainWindow: { phases.append("main"); return nil }, windows: { phases.append("windows"); return windows })
        precondition(fallback == windows.last && phases == ["focus", "main", "windows"])
    }
    let appAX = AXUIElementCreateApplication(getpid()), windowAX = AXUIElementCreateApplication(Int32.max)
    let attribute = UIElementAttribute("AXFocusedWindow")
    func partial(_ value: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    let empty = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    func app(_ attributes: [UIElementAttribute: AXPartialValue], supported: Set<UIElementAttribute> = [attribute]) -> ApplicationUIElement {
        ApplicationUIElement(axElement: appAX, cache: UIElementCache(supportedAttributes: supported,
            attributes: attributes, transactionAttributes: nil))
    }
    var initialized = 0, reads = 0, errors = 0
    let initialize: (AXUIElement) -> WindowUIElement = {
        initialized += 1; precondition(CFEqual($0, windowAX)); return WindowUIElement(axElement: $0, cache: empty)
    }
    let cached = app([attribute: partial(windowAX)]).windowValue(for: attribute, initialize: initialize,
        read: { preconditionFailure() }, reportError: { _ in preconditionFailure() })
    precondition(cached != nil && initialized == 1)
    let recovered = app([attribute: partial("bad cache" as NSString)]).windowValue(for: attribute, initialize: initialize,
        read: { reads += 1; return (.success, partial(windowAX)) }, reportError: { _ in errors += 1 })
    precondition(recovered != nil && initialized == 2 && reads == 1 && errors == 0)
    let invalid = app([:]).windowValue(for: attribute, initialize: initialize,
        read: { reads += 1; return (.success, partial("not a window" as NSString)) }, reportError: { _ in errors += 1 })
    precondition(invalid == nil && initialized == 2 && reads == 2 && errors == 1)
    let unsupported = app([:], supported: [UIElementAttribute("AXRole")]).windowValue(for: attribute, initialize: initialize,
        read: { preconditionFailure() }, reportError: { _ in preconditionFailure() })
    precondition(unsupported == nil)
}

private func runFocusedUIElementContextStorageChecks() throws {
    let ax = AXUIElementCreateApplication(getpid()), other = AXUIElementCreateApplication(Int32.max)
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let window = WindowUIElement(axElement: other, cache: cache)
    let element = UIElement(axElement: ax, cache: cache)
    var calls = 0
    let context = try FocusedUIElementContext(app: app, window: window, element: element) { suppliedWindow, suppliedApp in
        calls += 1
        precondition(CFEqual(suppliedWindow.axElement, other) && CFEqual(suppliedApp.axElement, ax))
        return NativeWindowDescription([kCGWindowNumber as String: UInt32(7)])
    }
    precondition(calls == 1 && context.cgWindow.id == 7)
    precondition(CFEqual(context.app.axElement, ax) && CFEqual(context.window.axElement, other))
    precondition(context.element != nil && CFEqual(context.element!.axElement, ax))
    let copy = context
    context.applicationWindow.cgWindow = NativeWindowDescription([kCGWindowNumber as String: UInt32(9)])
    context.applicationWindow.axWindow = WindowUIElement(axElement: ax, cache: cache)
    precondition(copy.applicationWindow === context.applicationWindow && copy.cgWindow.id == 9)
    precondition(CFEqual(copy.window.axElement, ax))
    let noElement = try FocusedUIElementContext(app: app, window: window, element: nil) { _, _ in
        NativeWindowDescription([kCGWindowNumber as String: UInt32(11)])
    }
    precondition(noElement.element == nil && noElement.cgWindow.id == 11)
    do {
        _ = try FocusedUIElementContext(app: app, window: window, element: element) { _, _ in nil }
        preconditionFailure()
    } catch FocusedUIElementContext.Error.cgWindowNotFound {}
}

private func runApplicationFocusedContextChecks() throws {
    let ax = AXUIElementCreateApplication(getpid()), other = AXUIElementCreateApplication(Int32.max)
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let window = WindowUIElement(axElement: other, cache: cache)
    let element = UIElement(axElement: ax, cache: cache)
    var phases: [String] = []
    do {
        _ = try app.focusedUIElementContext(readPrimaryWindow: { phases.append("window"); return nil },
            readFocusedElement: { preconditionFailure() }, resolve: { _, _ in preconditionFailure() })
        preconditionFailure()
    } catch FocusedUIElementContext.Error.noWindowsAvailable {}
    precondition(phases == ["window"])
    for hasFocus in [false, true] {
        for hasCGWindow in [false, true] {
            phases = []
            do {
                let context = try app.focusedUIElementContext(readPrimaryWindow: { phases.append("window"); return window },
                    readFocusedElement: { phases.append("focus"); return hasFocus ? element : nil },
                    resolve: { supplied, application in
                        precondition(CFEqual(supplied.axElement, other) && CFEqual(application.axElement, ax))
                        phases.append("cg")
                        return hasCGWindow ? NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]) : nil
                    })
                precondition(hasCGWindow && (context.element != nil) == hasFocus && context.cgWindow.id == 7)
            } catch FocusedUIElementContext.Error.cgWindowNotFound { precondition(!hasCGWindow) }
            precondition(phases == ["window", "focus", "cg"])
        }
    }
    // Compose the actual shared focused-attribute accessor into context capture:
    // a provider error is reported once and yields nil focus, not a context error.
    let focusedAttribute = UIElementAttribute(kAXFocusedUIElementAttribute)
    let readableApp = ApplicationUIElement(axElement: ax, cache: UIElementCache(
        supportedAttributes: [focusedAttribute], attributes: [:], transactionAttributes: nil))
    var reports = 0, reads = 0
    let context = try readableApp.focusedUIElementContext(readPrimaryWindow: { window },
        readFocusedElement: {
            readableApp.elementValue(for: focusedAttribute, initialize: { _ in preconditionFailure() },
                read: { reads += 1; return (.cannotComplete, nil) }, reportError: { _ in reports += 1 })
        }, resolve: { _, _ in NativeWindowDescription([kCGWindowNumber as String: UInt32(9)]) })
    precondition(context.element == nil && context.cgWindow.id == 9 && reports == 1 && reads == 1)
}

private func runSelectionTreeCapturePreparationChecks(source: TransformedUIElement) {
    enum Unavailable: Error { case pid }
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: source.axElement, cache: cache)
    let root = UIElement(axElement: source.axElement, cache: cache)
    let transaction = UIElementTreeTransaction(element: root,
        cache: UIElementTransactionCache(attributeTable: [:], requestedAttributes: [],
            fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: FrequencyTable<UIElementRole>())
    let monitor = UIElementTreeInvalidationMonitor(app: app, processID: { _ in throw Unavailable.pid })
    let empty = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let populated = UIElementTree(items: [.init(element: source, subtree: empty)], focusedElement: nil)
    let valid = TransformedUIElement.TreeCache(tree: populated, transaction: transaction, invalidationMonitor: monitor)
    let invalid = TransformedUIElement.TreeCache(tree: empty, transaction: transaction, invalidationMonitor: monitor)
    var foreign = source
    foreign.element = UIElement(axElement: AXUIElementCreateApplication(Int32.max), cache: cache)
    let foreignFirstTree = UIElementTree(items: [.init(element: foreign, subtree: empty),
        .init(element: source, subtree: empty)], focusedElement: nil)
    let foreignFirst = TransformedUIElement.TreeCache(tree: foreignFirstTree, transaction: transaction,
        invalidationMonitor: monitor)
    for context in UIElementContextType.allCases {
        for web in [false, true] {
            var phases: [String] = []
            let reused = prepareSelectionTreeCapture(root: root, app: app, contextType: context, treeCache: valid,
                isWebShaped: { phases.append("web"); return web }, makeMonitor: { _ in preconditionFailure() },
                makeTransaction: { _, _ in preconditionFailure() })
            precondition(phases == ["web"] && reused.treeCache != nil && reused.isWebShaped == web)
            precondition((reused.invalidationMonitor === monitor) == (context == .fullUIContext))
            precondition(CFEqual(reused.transaction.element.axElement, root.axElement))
            for suppliedCache in [nil, invalid, foreignFirst] as [TransformedUIElement.TreeCache?] {
                phases = []
                let rebuilt = prepareSelectionTreeCapture(root: root, app: app, contextType: context, treeCache: suppliedCache,
                    isWebShaped: { phases.append("web"); return web }, makeMonitor: { suppliedApp in
                        precondition(CFEqual(suppliedApp.axElement, app.axElement)); phases.append("monitor"); return monitor
                    }, makeTransaction: { suppliedRoot, limit in
                        precondition(CFEqual(suppliedRoot.axElement, root.axElement))
                        precondition(limit == (context == .eventStreamContext && web ? 20 : 100))
                        phases.append("transaction"); return transaction
                    })
                precondition(rebuilt.treeCache == nil && rebuilt.isWebShaped == web)
                precondition(phases == (context == .fullUIContext ? ["monitor", "web", "transaction"] : ["web", "transaction"]))
                precondition((rebuilt.invalidationMonitor === monitor) == (context == .fullUIContext))
            }
        }
    }
}

private func runApplicationBundleWebShapeChecks() {
    enum Failure: Error { case pid }
    let url = URL(fileURLWithPath: "/owned-fixture.app")
    for missing in 0...3 {
        var phases: [String] = []
        let result = applicationBundleMatches(pid: {
            phases.append("pid"); if missing == 0 { throw Failure.pid }; return 42
        }, bundleURL: { pid in
            precondition(pid == 42); phases.append("url"); return missing == 1 ? nil : url
        }, makeBundle: { path -> Int? in
            precondition(path == url); phases.append("bundle"); return missing == 2 ? nil : 17
        }, classify: { bundle in precondition(bundle == 17); phases.append("classify"); return true })
        precondition(result == (missing == 3))
        precondition(phases == Array(["pid", "url", "bundle", "classify"].prefix(missing + 1)))
    }
    let ordinary = applicationBundleMatches(pid: { 42 }, bundleURL: { _ in url },
        makeBundle: { _ in 17 }, classify: { _ in false })
    precondition(!ordinary)
}

private func runSelectionCaptureContextChecks() throws {
    enum Failure: Error { case capture }
    let ax = AXUIElementCreateApplication(getpid()), other = AXUIElementCreateApplication(Int32.max)
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let window = WindowUIElement(axElement: other, cache: cache)
    let oldFocus = UIElement(axElement: ax, cache: cache), override = UIElement(axElement: ax, cache: cache)
    let owner = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: window, axApplication: app)
    let context = FocusedUIElementContext(element: oldFocus, applicationWindow: owner)
    for enabled in [false, true] {
        for acquired in [false, true] {
            for hasNewFocus in [false, true] {
                var phases: [String] = []
                let result = withSelectionCaptureContext(context: context, contextType: .eventStreamContext,
                    rootElement: override, performAccessibilityEnablement: enabled,
                    enable: { application, selectedWindow, type in
                        precondition(enabled && type == .eventStreamContext)
                        precondition(CFEqual(application.axElement, ax) && CFEqual(selectedWindow.axElement, other))
                        phases.append("enable")
                        return acquired ? AXEnablementAssertion(kinds: []) { _ in phases.append("release") } : nil
                    }, readFocus: { _ in phases.append("focus"); return hasNewFocus ? UIElement(axElement: other, cache: cache) : nil },
                    work: { root, focus in
                        phases.append("work")
                        precondition(CFEqual(root.axElement, ax))
                        if enabled && acquired {
                            precondition((focus != nil) == hasNewFocus)
                            if let focus { precondition(CFEqual(focus.axElement, other)) }
                        } else { precondition(focus != nil && CFEqual(focus!.axElement, ax)) }
                        return 17
                    })
                var expected: [String] = []
                if enabled { expected.append("enable"); if acquired { expected.append("focus") } }
                expected.append("work")
                if enabled && acquired { expected.append("release") }
                precondition(result == 17 && phases == expected)
                precondition(context.element != nil && CFEqual(context.element!.axElement, ax))
            }
        }
    }
    var phases: [String] = []
    do {
        _ = try withSelectionCaptureContext(context: context, contextType: .fullUIContext,
            rootElement: nil, performAccessibilityEnablement: true,
            enable: { _, _, _ in AXEnablementAssertion(kinds: []) { _ in phases.append("release") } },
            readFocus: { _ in nil }, work: { root, focus -> Int in
                precondition(root is WindowUIElement && CFEqual(root.axElement, other) && focus == nil)
                phases.append("throw"); throw Failure.capture
            })
        preconditionFailure()
    } catch Failure.capture {}
    precondition(phases == ["throw", "release"])
    phases = []
    var retainedAssertion: AXEnablementAssertion?
    withSelectionCaptureContext(context: context, contextType: .fullUIContext,
        rootElement: nil, performAccessibilityEnablement: true,
        enable: { _, _, _ in
            retainedAssertion = AXEnablementAssertion(kinds: []) { _ in phases.append("disable") }
            return retainedAssertion
        }, readFocus: { _ in nil }, work: { _, _ in
            precondition(retainedAssertion != nil && phases.isEmpty); phases.append("work")
        })
    precondition(retainedAssertion != nil && phases == ["work", "disable"])
    retainedAssertion?.disable()
    retainedAssertion = nil
    precondition(phases == ["work", "disable"])
}

private func runSelectionExtractionTransactionChecks(source: TransformedUIElement) throws {
    enum Failure: Error { case pid, transformation, work }
    let ax = source.axElement
    let emptyCache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: emptyCache)
    let window = WindowUIElement(axElement: ax, cache: emptyCache)
    let owner = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: window, axApplication: app)
    let context = FocusedUIElementContext(element: UIElement(axElement: ax, cache: emptyCache), applicationWindow: owner)
    let monitor = UIElementTreeInvalidationMonitor(app: app, processID: { _ in throw Failure.pid })
    func transaction(_ attribute: String) -> UIElementTreeTransaction {
        UIElementTreeTransaction(element: UIElement(axElement: ax, cache: UIElementCache(
            supportedAttributes: [UIElementAttribute(attribute)], attributes: [:], transactionAttributes: nil)),
            cache: UIElementTransactionCache(attributeTable: [:], requestedAttributes: [UIElementAttribute(attribute)],
                fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: FrequencyTable<UIElementRole>())
    }
    let outer = transaction("AXTitle"), inner = transaction("AXValue")
    let previous = UIElementTreeTransaction.current?.cache.requestedAttributes
    for failure in 0...2 {
        var phases: [String] = []
        try outer.perform { _ in
            do {
                let value = try withSelectionExtractionTransaction(context: context, contextType: .fullUIContext,
                    treeCache: nil, rootElement: nil, performAccessibilityEnablement: true,
                    enable: { _, _, _ in
                        phases.append("enable")
                        return AXEnablementAssertion(kinds: []) { _ in
                            precondition(UIElementTreeTransaction.current?.cache.requestedAttributes == outer.cache.requestedAttributes)
                            phases.append("disable")
                        }
                    }, readFocus: { _ in phases.append("focus"); return nil },
                    isWebShaped: { phases.append("web"); return false },
                    makeMonitor: { _ in phases.append("monitor"); return monitor },
                    makeTransaction: { root, limit in
                        precondition(root is WindowUIElement && limit == 100)
                        phases.append("transaction"); return inner
                    }, prepareTransformation: { () throws -> String in
                        precondition(UIElementTreeTransaction.current?.cache.requestedAttributes == outer.cache.requestedAttributes)
                        phases.append("context")
                        if failure == 1 { throw Failure.transformation }
                        return "transformation"
                    }, work: { root, focus, prepared, transformation in
                        precondition(focus == nil && transformation == "transformation")
                        precondition(root.cache.supportedAttributes == [UIElementAttribute("AXValue")])
                        precondition(prepared.invalidationMonitor === monitor)
                        precondition(UIElementTreeTransaction.current?.cache.requestedAttributes == inner.cache.requestedAttributes)
                        phases.append("work")
                        if failure == 2 { throw Failure.work }
                        return 17
                    })
                precondition(failure == 0 && value == 17)
            } catch Failure.transformation { precondition(failure == 1) }
              catch Failure.work { precondition(failure == 2) }
            precondition(UIElementTreeTransaction.current?.cache.requestedAttributes == outer.cache.requestedAttributes)
        }
        var expected = ["enable", "focus", "monitor", "web", "transaction", "context"]
        if failure != 1 { expected.append("work") }
        expected.append("disable")
        precondition(phases == expected)
        precondition(UIElementTreeTransaction.current?.cache.requestedAttributes == previous)
    }
    let cached = TransformedUIElement.TreeCache(
        tree: .init(items: [.init(element: source, subtree: .init(items: [], focusedElement: nil))],
            focusedElement: source), transaction: inner, invalidationMonitor: monitor)
    let restrictedApp = ApplicationUIElement(axElement: ax, cache: .init(
        supportedAttributes: [UIElementAttribute("AXTitle")], attributes: [:], transactionAttributes: nil))
    let capturedContext = FocusedUIElementContext(element: source.element,
        applicationWindow: ApplicationWindow(cgWindow: owner.cgWindow, axWindow: window,
            axApplication: restrictedApp))
    var events: [String] = []
    let result = try withSelectionExtractionTrees(context: capturedContext, contextType: .fullUIContext,
        treeCache: cached, rootElement: source.element, performAccessibilityEnablement: true,
        enable: { _, _, _ in
            events.append("enable")
            return AXEnablementAssertion(kinds: []) { _ in
                checkTrue(UIElementTreeTransaction.current == nil)
                events.append("disable")
            }
        }, readFocus: { _ in source.element }, isWebShaped: { false },
        makeMonitor: { _ in unexpectedFailure(); return monitor },
        makeTransaction: { _, _ in unexpectedFailure(); return inner },
        prepareTransformation: {
            checkTrue(UIElementTreeTransaction.current == nil)
            events.append("context")
            return .init(type: .fullUIContext, application: nil, window: nil, urlConfiguration: nil)
        }, reportMissingFocus: { _ in unexpectedFailure() },
        reportSelectionResolutionFailure: {}, reportDepthLimit: { unexpectedFailure() },
        reportLimit: { _ in unexpectedFailure() }, reportError: { _ in },
        reportUnknownDateComponents: { _ in unexpectedFailure() },
        work: { trees, prepared, transformation in
            checkEqual(UIElementTreeTransaction.current?.cache.requestedAttributes, inner.cache.requestedAttributes)
            checkTrue(prepared.invalidationMonitor === monitor)
            checkEqual(trees.tree.focusedElement?.id, source.id)
            checkTrue(trees.focusTree != nil)
            checkEqual(transformation.type, .fullUIContext)
            let info = try finishSelectionExtractionAccessibilityInfo(trees: trees,
                application: restrictedApp, previousRevision: nil, isAXTreeDiffingEnabled: true,
                context: &transformation, reportDepthLimit: { unexpectedFailure() },
                reportLimit: { _ in unexpectedFailure() }, reportUnknownDateComponents: { _ in unexpectedFailure() },
                reportUnknownAttributedStyle: { _ in }, reportAttributeError: { _ in },
                reportUnexpectedNextLine: {})
            checkEqual(info.contextType, .fullUIContext)
            checkEqual(info.screenshotNeededForContext, trees.screenshotNeededForContext)
            checkEqual(info.webAreaURL, trees.webAreaURL)
            checkTrue(info.windowRevision.previousRevision == nil)
            var publishedInfo = info
            publishedInfo.webAreaURL = URL(string: "https://published.example/")!
            publishedInfo.contextType = .informationalContext
            publishedInfo.screenshotNeededForContext = true
            let published = SystemSelection(applicationWindow: owner,
                accessibilityInfo: publishedInfo, invalidationMonitor: monitor)
            checkTrue(published.applicationWindow === owner)
            checkTrue(published.windowRevision === info.windowRevision)
            checkTrue(published.invalidationMonitor === monitor)
            checkEqual(published.url, publishedInfo.webAreaURL)
            checkEqual(published.contextType, .informationalContext)
            checkTrue(published.screenshotNeededForContext)
            var copied = published
            copied.url = nil
            copied.screenshotNeededForContext = false
            checkTrue(published.url != nil && published.screenshotNeededForContext)
            var docsInfo = info
            docsInfo.webAreaURL = URL(string: "https://docs.google.com/document/test")!
            docsInfo.screenshotNeededForContext = false
            for webShaped in [false, true] {
                let selection = makeExtractedSystemSelection(applicationWindow: owner,
                    accessibilityInfo: docsInfo, invalidationMonitor: monitor, isWebShaped: webShaped)
                checkEqual(selection.screenshotNeededForContext, webShaped)
                checkEqual(selection.url, docsInfo.webAreaURL)
                checkTrue(selection.windowRevision === docsInfo.windowRevision)
            }
            docsInfo.webAreaURL = nil
            checkTrue(!makeExtractedSystemSelection(applicationWindow: owner,
                accessibilityInfo: docsInfo, invalidationMonitor: monitor, isWebShaped: true).screenshotNeededForContext)
            docsInfo.screenshotNeededForContext = true
            checkTrue(makeExtractedSystemSelection(applicationWindow: owner,
                accessibilityInfo: docsInfo, invalidationMonitor: monitor, isWebShaped: false).screenshotNeededForContext)
            checkEqual(UIElementTreeTransaction.current?.cache.requestedAttributes, inner.cache.requestedAttributes)
            events.append("work")
            return 23
        })
    checkEqual(result, 23)
    checkEqual(events, ["enable", "context", "work", "disable"])
    events = []
    let extracted = try extractSystemSelection(context: capturedContext, contextType: .fullUIContext,
        treeCache: cached, previousRevision: nil, rootElement: source.element,
        performAccessibilityEnablement: true, alwaysIncludeScreenshot: true, isAXTreeDiffingEnabled: true,
        enable: { _, _, _ in
            events.append("enable")
            return AXEnablementAssertion(kinds: []) { _ in
                checkTrue(UIElementTreeTransaction.current == nil)
                events.append("disable")
            }
        }, readFocus: { _ in source.element }, isWebShaped: { false },
        makeMonitor: { _ in unexpectedFailure(); return monitor },
        makeTransaction: { _, _ in unexpectedFailure(); return inner },
        prepareTransformation: {
            checkTrue(UIElementTreeTransaction.current == nil)
            events.append("context")
            return .init(type: .fullUIContext, application: nil, window: nil, urlConfiguration: nil)
        }, reportMissingFocus: { _ in unexpectedFailure() }, reportSelectionResolutionFailure: {},
        reportDepthLimit: { unexpectedFailure() }, reportLimit: { _ in unexpectedFailure() },
        reportError: { _ in }, reportUnknownDateComponents: { _ in unexpectedFailure() },
        reportUnknownAttributedStyle: { _ in }, reportUnexpectedNextLine: {})
    checkTrue(extracted.applicationWindow === capturedContext.applicationWindow)
    checkTrue(extracted.invalidationMonitor === monitor)
    checkTrue(extracted.screenshotNeededForContext)
    checkEqual(extracted.contextType, .fullUIContext)
    checkTrue(extracted.windowRevision.previousRevision == nil)
    checkEqual(events, ["enable", "context", "disable"])

}

private func runNativeTransformationContextChecks() {
    let empty = UIElementTransformationContext(type: .fullUIContext,
        application: nil, window: nil, urlConfiguration: nil)
    precondition(!empty.isCatalyst && !empty.isWebShaped && !empty.isChromium && empty.windowFrame == nil)
    let ax = AXUIElementCreateApplication(getpid())
    let attribute = UIElementAttribute("_AXExhibitsMacCatalystBehavior")
    let partial = AXPartialValue(value: AXEncodedValue(value: NSNumber(value: true)),
        arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    let app = ApplicationUIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [attribute],
        attributes: [attribute: partial], transactionAttributes: nil))
    precondition(app.isCatalystApp)
    // Concrete context with no app still reads its window frame independently.
    let expected = CGRect(x: 1, y: 2, width: 30, height: 40)
    var rectangle = expected
    let frameValue = AXValueCreate(.cgRect, &rectangle)!
    let frame = AXPartialValue(value: AXEncodedValue(value: frameValue), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    let window = WindowUIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [.frame],
        attributes: [.frame: frame], transactionAttributes: nil))
    let framed = UIElementTransformationContext(type: .eventStreamContext,
        application: nil, window: window, urlConfiguration: nil)
    precondition(framed.windowFrame == expected && !framed.isCatalyst && !framed.isChromium)
}

private func runSelectionExtractionFocusChecks() {
    let kept = resolveSelectionExtractionFocus(focused: 7, isElectron: { preconditionFailure() },
        findSelectedWebArea: { preconditionFailure() })
    precondition(kept == 7)
    let ordinary: Int? = resolveSelectionExtractionFocus(focused: nil, isElectron: { false },
        findSelectedWebArea: { preconditionFailure() })
    precondition(ordinary == nil)
    for result in [nil, 17] as [Int?] {
        var phases: [String] = []
        let found: Int? = resolveSelectionExtractionFocus(focused: nil,
            isElectron: { phases.append("electron"); return true },
            findSelectedWebArea: { phases.append("search"); return result })
        precondition(found == result && phases == ["electron", "search"])
    }
    for length in [-1, 0, 1, 20] {
        for marker in [false, true] {
            var reads = 0
            let selected = extractionWebAreaHasSelection(selectedRange: { CFRange(location: -1, length: length) },
                hasSelectedMarkerRange: { reads += 1; return marker })
            precondition(selected == (length > 0 || marker))
            precondition(reads == (length > 0 ? 0 : 1))
        }
    }
    for marker in [false, true] {
        var reads = 0
        let selected = extractionWebAreaHasSelection(selectedRange: { nil }, hasSelectedMarkerRange: { reads += 1; return marker })
        precondition(selected == marker && reads == 1)
    }
}

private func runUIElementSelectedRangesChecks() {
    let ax = AXUIElementCreateApplication(getpid())
    let rangeAttribute = UIElementAttribute("AXSelectedTextRange"), markerAttribute = UIElementAttribute("AXSelectedTextMarkerRange")
    func partial(_ value: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    var range = CFRange(location: 2, length: 3)
    let encoded = AXValueCreate(.cfRange, &range)!
    func element(_ attributes: [UIElementAttribute: AXPartialValue]) -> UIElement {
        UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [rangeAttribute, markerAttribute],
            attributes: attributes, transactionAttributes: nil))
    }
    let cached = element([rangeAttribute: partial(encoded)]).selectedTextRangeValue(
        read: { preconditionFailure() }, reportError: { _ in preconditionFailure() })
    precondition(cached?.location == 2 && cached?.length == 3)
    var reads = 0, reports = 0
    let recovered = element([rangeAttribute: partial("bad" as NSString)]).selectedTextRangeValue(
        read: { reads += 1; return (.success, partial(encoded)) }, reportError: { _ in reports += 1 })
    precondition(recovered?.length == 3 && reads == 1 && reports == 0)
    let invalid = element([:]).selectedTextRangeValue(read: { (.success, partial("bad" as NSString)) },
        reportError: { _ in reports += 1 })
    precondition(invalid == nil && reports == 1)
    let failed = element([:]).selectedTextMarkerRangeValue(read: { (.cannotComplete, nil) }, reportError: { _ in reports += 1 })
    precondition(failed == nil && reports == 2)
    let bytes: [UInt8] = [1, 2, 3, 4]
    let marker = UITextMarker(marker: bytes.withUnsafeBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) })
    let markerRange = UITextMarkerRange(start: marker, end: marker)
    let encodedMarker = encodedAXParameter(markerRange)
    let selected = element([markerAttribute: partial(encodedMarker)]).selectedTextMarkerRangeValue(
        read: { preconditionFailure() }, reportError: { _ in preconditionFailure() })
    precondition(selected != nil)
    let candidate = element([rangeAttribute: partial(encoded), markerAttribute: partial("bad" as NSString)])
    precondition(extractionWebAreaHasSelection(selectedRange: { candidate.selectedTextRange },
        hasSelectedMarkerRange: { preconditionFailure("Positive range must skip marker getter") }))
}

private func runUIElementTreeBuildTraversalChecks() {
    var visited = Set<Int>(), reads = 0, limits = 0
    for count in [0, 1, 199, 200] {
        let accepted = beginUIElementTreeVisit(path: IndexPath(indexes: Array(repeating: 0, count: count)),
            identity: { reads += 1; return count }, visited: &visited, reportDepthLimit: { limits += 1 })
        precondition(accepted)
    }
    precondition(reads == 4 && limits == 0)
    for count in [201, 202] {
        let accepted = beginUIElementTreeVisit(path: IndexPath(indexes: Array(repeating: 0, count: count)),
            identity: { preconditionFailure("Depth guard must precede identity access") },
            visited: &visited, reportDepthLimit: { limits += 1 })
        precondition(!accepted)
    }
    let duplicate = beginUIElementTreeVisit(path: IndexPath(index: 3), identity: { reads += 1; return 200 },
        visited: &visited, reportDepthLimit: { preconditionFailure() })
    precondition(!duplicate && reads == 5 && limits == 2 && visited.count == 4)
    var filtered: [Int] = [], paths: [IndexPath] = [], values: [String] = []
    let root = IndexPath(indexes: [5, 7])
    enumerateFilteredTreeChildren(["same", "skip", "same", "last"], path: root,
        filter: { index, _ in filtered.append(index); return index != 1 },
        visit: { element, path in values.append(element); paths.append(path) })
    precondition(filtered == [0, 1, 2, 3] && values == ["same", "same", "last"])
    precondition(paths == [[5, 7, 0], [5, 7, 2], [5, 7, 3]].map { IndexPath(indexes: $0) })
}

private func runVisibleChildrenThresholdChecks() {
    enum Failure: Error { case read }
    // Expected routes are explicit boundary fixtures, including500 ordinary
    // children below threshold1000: the500 guard is not a global array cap.
    let fixtures: [(Int?, Int, UIElementContextType, Bool, Bool, [String])] = [
        (nil, 100, .fullUIContext, false, false, ["count"]),
        (-1, 100, .fullUIContext, false, false, ["count"]),
        (0, 100, .eventStreamContext, true, false, ["count"]),
        (100, 100, .fullUIContext, false, false, ["count", "partial"]),
        (101, 100, .fullUIContext, false, true, ["count", "attribute", "visible"]),
        (101, 100, .fullUIContext, false, false, ["count", "attribute", "position"]),
        (499, 100, .informationalContext, true, false, ["count", "attribute", "position"]),
        (500, 100, .fullUIContext, false, false, ["count", "attribute", "limit"]),
        (500, 100, .fullUIContext, false, true, ["count", "attribute", "visible"]),
        (500, 1000, .fullUIContext, false, false, ["count", "partial"]),
        (1, 100, .eventStreamContext, true, false, ["count", "web"]),
        (499, 100, .eventStreamContext, true, false, ["count", "web"]),
        (500, 1000, .eventStreamContext, true, true, ["count", "limit"]),
        (1, 100, .eventStreamContext, false, false, ["count", "partial"])
    ]
    let frame = CGRect(x: 1, y: 2, width: 30, height: 40)
    for (count, threshold, context, web, hasAttribute, expected) in fixtures {
        var trace: [String] = []
        let result = selectTreeChildren(threshold: threshold, contextType: context, isWebShaped: web, clippingFrame: frame,
            childCount: { trace.append("count"); return count },
            visibleAttribute: { trace.append("attribute"); return hasAttribute ? UIElementAttribute("AXVisibleChildren") : nil },
            visibleSubset: { attribute, maximum -> String? in
                precondition(attribute == UIElementAttribute("AXVisibleChildren") && maximum == 0)
                trace.append("visible"); return nil // nil is final, no fallback
            }, partialChildren: { trace.append("partial"); return "partial" },
            positionFiltered: { maximum, includeAll, clip in
                if context == .eventStreamContext && web {
                    precondition(maximum == 0 && includeAll && clip == frame); trace.append("web"); return "web"
                }
                precondition(maximum == 100 && !includeAll && clip == nil)
                trace.append("position"); return "position"
            }, reportLimit: { reason in
                switch reason {
                case .webEventStream: precondition(context == .eventStreamContext && web)
                case .positionFallback: precondition(context != .eventStreamContext || !web)
                }
                trace.append("limit")
            })
        precondition(trace == expected)
        if ["partial", "web", "position"].contains(expected.last!) { precondition(result == expected.last!) }
        else { precondition(result == nil) }
    }
    let failed: String? = selectTreeChildren(threshold: 100, contextType: .fullUIContext, isWebShaped: false,
        clippingFrame: nil, childCount: { 1 }, visibleAttribute: { preconditionFailure() },
        visibleSubset: { _, _ in preconditionFailure() }, partialChildren: { throw Failure.read },
        positionFiltered: { _, _, _ in preconditionFailure() }, reportLimit: { _ in preconditionFailure() })
    precondition(failed == nil)
}


@MainActor
private func runClickRoutingCursorChecks() async throws {
    enum Failure: Error { case press }
    final class Cursor: VirtualCursor {
        var isPressed = false
        var counts: [Int] = []
        var fail = false
        func press(count: Int) async throws {
            counts.append(count)
            if fail { throw Failure.press }
        }
    }
    let cursor = Cursor()
    for mode in 0..<5 {
        cursor.counts = []
        cursor.fail = mode == 4
        var events: [String] = []
        let preparation = UIElementClickPreparation(action: .press,
            initiallyInsideWebView: false, useAccessibilityAction: mode != 2)
        do {
            let result = try await executePreparedUIElementClick(preparation,
                isInsideWebView: { mode == 3 }, webClickHitsTarget: { true },
                virtualCursor: mode == 1 ? nil : cursor,
                prepareActionFocus: {
                    precondition(cursor.counts == (mode == 1 ? [] : [1]))
                    events.append("focus")
                }, performAction: { action in
                    precondition(action == .press)
                    events.append("action")
                    return "AX"
                }, simulateClick: { _ in events.append("simulate"); return "CG" })
            precondition(mode != 4)
            precondition(result == ((mode == 2 || mode == 3) ? "CG" : "AX"))
        } catch Failure.press {
            precondition(mode == 4)
        }
        precondition(cursor.counts == ((mode == 1 || mode == 2 || mode == 3) ? [] : [1]))
        precondition(events == (mode == 4 ? [] : ((mode == 2 || mode == 3) ? ["simulate"] : ["focus", "action"])))
    }
}


@MainActor
private func runMouseDiagnosticBoundaryChecks() async throws {
    for succeeds in [false, true] {
        var events: [(String, [String: Any])] = []
        var calls = 0
        do {
            let result = try await withNativeMouseInputDiagnostic(metadata: ["snapshotId": "fixture"],
                record: { events.append(($1, $0)) }, perform: {
                    calls += 1
                    if !succeeds { throw fail("STALE_OBSERVATION", "private text must not be logged") }
                    return ["outcome": "dispatched", "secret": "must not be copied"]
                })
            precondition(succeeds && result["secret"] as? String == "must not be copied")
        } catch let error as Failure {
            precondition(!succeeds && error.code == "STALE_OBSERVATION")
        }
        precondition(calls == 1 && events.count == 2)
        precondition(events[0].0 == "native.input.attempt")
        precondition(events[1].0 == (succeeds ? "native.input.completed" : "native.input.failed"))
        precondition(events[0].1["attemptId"] as? String == events[1].1["attemptId"] as? String)
        precondition(events[1].1["snapshotId"] as? String == "fixture")
        precondition(events[1].1["secret"] == nil && events[1].1["message"] == nil)
        if !succeeds { precondition(events[1].1["errorCode"] as? String == "STALE_OBSERVATION") }
    }
}


private func runConcreteTreeRefetchResolutionChecks() throws {
    enum Failure: Error { case noMonitor, invalid }
    let ax = AXUIElementCreateApplication(getpid())
    let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let element = UIElement(axElement: ax, cache: cache)
    let window = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: WindowUIElement(axElement: ax, cache: cache), axApplication: app)
    let revision = try UIElementTreeRevision.root(UIElementTree<TransformedUIElement>(items: [], focusedElement: nil),
        focusTree: nil, lineageID: "resolution") { _ in UIElementRenderTree(isFocus: false, roots: []) }
    let tree = try RefetchableSkyshotAXTree(systemSelection: SystemSelection(applicationWindow: window,
        windowRevision: revision, invalidationMonitor: nil), isAXTreeDiffingEnabled: true)
    do {
        _ = try tree.refetchElementIfNeeded(element, validateElement: false, ignoreValueChange: false,
            missingMonitorError: { Failure.noMonitor }, invalidElementError: { preconditionFailure() },
            readRoleError: { _ in preconditionFailure() }, refetch: { _, _ in preconditionFailure() })
        preconditionFailure()
    } catch Failure.noMonitor {}
    do {
        _ = try tree.refetchElementIfNeeded(element, validateElement: false, ignoreValueChange: false,
            refetch: { _, _ in preconditionFailure() })
        preconditionFailure()
    } catch RefetchableSkyshotAXTree.Error.noInvalidationMonitorProvided {}
    switch nativeElementRefreshLookupError(.previousMatchNotUnique(0)) {
    case RefetchableSkyshotAXTree.Error.elementAmbiguousBeforeRefetch: break
    default: preconditionFailure()
    }
    switch nativeElementRefreshLookupError(.noRefreshedMatch) {
    case RefetchableSkyshotAXTree.Error.elementNoLongerValidAfterRefetch: break
    default: preconditionFailure()
    }
    switch nativeElementRefreshLookupError(.refreshedMatchNotUnique(2)) {
    case RefetchableSkyshotAXTree.Error.elementAmbiguousAfterRefetch: break
    default: preconditionFailure()
    }
    let monitor = UIElementTreeInvalidationMonitor(app: app, processID: { _ in throw Failure.noMonitor })
    tree.systemSelection.invalidationMonitor = monitor
    let composed = try tree.refetchElementIfNeeded(element, validateElement: false,
        ignoreValueChange: true, readRoleError: { _ in unexpectedFailure() },
        extractSelection: { unexpectedFailure() })
    checkTrue(composed.containingTree === tree)
    checkEqual(composed.axElement, ax)
    try composed.refetchIfNeeded(validateElement: false, ignoreValueChange: true,
        extractSelection: { unexpectedFailure() })
    for invalidated in [false, true] {
        monitor.state.withLock { $0.layoutChanged = invalidated }
        for validate in [false, true] {
            var phases: [String] = []
            let result = try tree.refetchElementIfNeeded(element, validateElement: validate, ignoreValueChange: true,
                missingMonitorError: { preconditionFailure() }, invalidElementError: { preconditionFailure() },
                readRoleError: { received in precondition(CFEqual(received, ax)); phases.append("role"); return .cannotComplete },
                refetch: { old, ignore in
                    precondition(CFEqual(old.axElement, ax) && ignore)
                    phases.append("refetch")
                    return RefetchableUIElement(element: old, containingTree: tree)
                })
            precondition(result.containingTree === tree && result.cache.supportedAttributes == cache.supportedAttributes)
            precondition(phases == (invalidated ? ["refetch"] : (validate ? ["role"] : [])))
        }
    }
    monitor.state.withLock { $0.layoutChanged = false }
    do {
        _ = try tree.refetchElementIfNeeded(element, validateElement: true, ignoreValueChange: false,
            missingMonitorError: { preconditionFailure() }, invalidElementError: { Failure.invalid },
            readRoleError: { _ in .invalidUIElement }, refetch: { _, _ in preconditionFailure() })
        preconditionFailure()
    } catch Failure.invalid {}
}


private func runIndexedTreeRefetchResolutionChecks(source: TransformedUIElement) throws {
    enum Failure: Error { case noObserver }
    let ax = source.axElement
    let app = ApplicationUIElement(axElement: ax, cache: source.cache)
    let window = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: WindowUIElement(axElement: ax, cache: source.cache), axApplication: app)
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let revision = try UIElementTreeRevision.root(UIElementTree(items: [.init(element: source, subtree: leaf)],
        focusedElement: nil), focusTree: nil, lineageID: "indexed-resolution") { _ in
            UIElementRenderTree(isFocus: false, roots: [UIElementRender(id: source.id,
                elementID: nil, text: "fixture", detailText: nil,
                sourcePath: IndexPath(index: 0), children: [])])
        }
    let tree = try RefetchableSkyshotAXTree(systemSelection: SystemSelection(applicationWindow: window,
        windowRevision: revision, invalidationMonitor: nil), isAXTreeDiffingEnabled: true)
    for id in [-1, 1, Int.max] {
        do {
            _ = try tree.refetchElementIfNeeded(id, validateElement: true,
                readRoleError: { _ in preconditionFailure() }, refetch: { _, _ in preconditionFailure() })
            preconditionFailure()
        } catch RefetchableSkyshotAXTree.Error.invalidElementID(let received) { precondition(received == id) }
    }
    do {
        _ = try tree.refetchElementIfNeeded(0, validateElement: false, refetch: { _, _ in preconditionFailure() })
        preconditionFailure()
    } catch RefetchableSkyshotAXTree.Error.noInvalidationMonitorProvided {}
    let monitor = UIElementTreeInvalidationMonitor(app: app, processID: { _ in throw Failure.noObserver })
    tree.systemSelection.invalidationMonitor = monitor
    for validate in [false, true] {
        var reads = 0
        let result = try tree.refetchElementIfNeeded(0, validateElement: validate,
            readRoleError: { received in precondition(CFEqual(received, ax)); reads += 1; return .success },
            refetch: { _, _ in preconditionFailure() })
        precondition(result.containingTree === tree && CFEqual(result.axElement, ax))
        precondition(reads == (validate ? 1 : 0))
        let composed = try tree.refetchElementIfNeeded(0, validateElement: validate,
            readRoleError: { _ in .success }, extractSelection: { unexpectedFailure() })
        checkTrue(composed.containingTree === tree)
        checkEqual(composed.axElement, ax)
    }
    monitor.state.withLock { $0.layoutChanged = true }
    var refreshed = false
    _ = try tree.refetchElementIfNeeded(0, validateElement: true,
        readRoleError: { _ in preconditionFailure() }, refetch: { old, ignore in
            precondition(!ignore && CFEqual(old.axElement, ax)); refreshed = true
            return RefetchableUIElement(element: old, containingTree: tree)
        })
    precondition(refreshed)
}


private struct RefetchReconstructionProbe: UIElementProtocol {
    static var role: UIElementRole? { nil }
    let axElement: AXUIElement
    let cache: UIElementCache
    let reconstructed: Bool
    init(element: AXUIElement) { self.init(element: element, reconstructed: true) }
    init(element: AXUIElement, reconstructed: Bool) {
        axElement = element
        self.reconstructed = reconstructed
        let role = UIElementAttribute("AXRole")
        cache = UIElementCache(supportedAttributes: [role], attributes: [role:
            AXPartialValue(value: AXEncodedValue(value: "AXUnknown" as NSString),
                arraySubsetDescriptor: nil, textTruncationDescriptor: nil)], transactionAttributes: nil)
    }
}

private func runConcreteElementRecoveryChecks() throws {
    let ax = AXUIElementCreateApplication(getpid())
    let old = RefetchReconstructionProbe(element: ax, reconstructed: false)
    // Geometry attribute readers must accept protocol values without replacing
    // their concrete cache. Known-unsupported attributes never read the AX API.
    let protocolElement: any UIElementProtocol = old
    var environment = UIElementActionEnvironment.system
    var actionReads = 0
    environment.nativeActions = { element in
        checkEqual(element, ax); actionReads += 1
        return [.scrollDownByPage, .scrollDownByPage]
    }
    environment.supported = { _ in unexpectedFailure() }
    environment.settable = { _, _ in unexpectedFailure() }
    environment.read = { _, _ in unexpectedFailure() }
    checkTrue(protocolElement.hasScrollAction(in: environment, reportError: { _ in unexpectedFailure() }))
    checkEqual(actionReads, 1)
    for uncached in [false, true] {
        checkTrue(protocolElement.clippingFrame(uncached: uncached, transaction: nil,
            environment: environment, reportError: { _ in unexpectedFailure() }) == nil)
        checkTrue(protocolElement.clippingFrame(uncached: uncached,
            reportError: { _ in unexpectedFailure() }) == nil)
        checkTrue(protocolElement.clippingFrameAttribute(uncached: uncached,
            read: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() }) == nil)
        checkTrue(protocolElement.clippingParent(uncached: uncached,
            initialize: { _ in unexpectedFailure() }, read: { unexpectedFailure() },
            reportError: { _ in unexpectedFailure() }) == nil)
    }
    let app = ApplicationUIElement(axElement: ax, cache: old.cache)
    let window = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: WindowUIElement(axElement: ax, cache: old.cache), axApplication: app)
    let revision = try UIElementTreeRevision.root(UIElementTree<TransformedUIElement>(items: [], focusedElement: nil),
        focusTree: nil, lineageID: "concrete-recovery") { _ in UIElementRenderTree(isFocus: false, roots: []) }
    let tree = try RefetchableSkyshotAXTree(systemSelection: SystemSelection(applicationWindow: window,
        windowRevision: revision, invalidationMonitor: nil), isAXTreeDiffingEnabled: true)
    for ignore in [false, true] {
        let result = try tree.recoverElement(old, ignoreValueChange: ignore,
            extractSelection: { preconditionFailure("Equal attributes must not require tree extraction") })
        precondition(result.containingTree === tree && CFEqual(result.axElement, ax))
        precondition((result.element as? RefetchReconstructionProbe)?.reconstructed == true)
        precondition(tree.systemSelection.windowRevision === revision)
    }
    let monitor = UIElementTreeInvalidationMonitor(app: app, processID: { _ in
        throw fail("FIXTURE", "No observer in composition check")
    })
    monitor.state.withLock { $0.layoutChanged = true }
    tree.systemSelection.invalidationMonitor = monitor
    let resolved = try tree.refetchElementIfNeeded(old, validateElement: true, ignoreValueChange: false,
        readRoleError: { _ in unexpectedFailure() }, extractSelection: { unexpectedFailure() })
    checkTrue((resolved.element as? RefetchReconstructionProbe)?.reconstructed == true)
    let wrapper = RefetchableUIElement(element: old, containingTree: tree)
    try wrapper.refetchIfNeeded(validateElement: true, ignoreValueChange: false,
        extractSelection: { unexpectedFailure() })
    checkTrue((wrapper.element as? RefetchReconstructionProbe)?.reconstructed == true)
    checkTrue(wrapper.containingTree === tree && tree.systemSelection.windowRevision === revision)
}



private func runRenderDifferenceIteratorSchedulingChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    func cursor(_ id: Int) -> Diff.Cursor {
        Diff.Cursor(item: UIElementRender(id: id, elementID: nil, text: "node", detailText: nil,
            sourcePath: nil, children: []), path: IndexPath(index: id))
    }
    var iterator = Diff.Iterator(old: [cursor(1)], new: [cursor(2)])
    var seen: [Int] = []
    func match(_ pair: Diff.PendingChildren, _ pending: inout Deque<Diff.PendingChildren>) -> [Diff.Change] {
        let id = pair.old[0].item.id
        seen.append(id)
        if id == 1 {
            pending.append((old: [cursor(3)], new: []))
            pending.append((old: [cursor(4)], new: []))
            return [.remove(offset: 1, old: pair.old[0]), .insert(offset: 2, new: pair.new[0])]
        }
        if id == 3 {
            pending.append((old: [cursor(5)], new: []))
            return [] // Empty batches must continue within the same next call.
        }
        return [.remove(offset: id, old: pair.old[0])]
    }
    if case .remove(let offset, _)? = iterator.next(matching: match) { precondition(offset == 1) }
    else { preconditionFailure() }
    precondition(seen == [1])
    var copied = iterator // Deque value semantics: independent consumption.
    if case .insert(let offset, _)? = iterator.next(matching: match) { precondition(offset == 2) }
    else { preconditionFailure() }
    precondition(seen == [1])
    if case .remove(let offset, _)? = iterator.next(matching: match) { precondition(offset == 4) }
    else { preconditionFailure() }
    precondition(seen == [1, 3, 4])
    if case .remove(let offset, _)? = iterator.next(matching: match) { precondition(offset == 5) }
    else { preconditionFailure() }
    precondition(iterator.next(matching: match) == nil && seen == [1, 3, 4, 5])
    if case .insert(let offset, _)? = copied.next(matching: { _, _ in preconditionFailure() }) { precondition(offset == 2) }
    else { preconditionFailure() }
    var empty = Diff.Iterator(old: [], new: [])
    var emptyCalls = 0
    precondition(empty.next(matching: { pair, _ in
        precondition(pair.old.isEmpty && pair.new.isEmpty); emptyCalls += 1; return []
    }) == nil)
    precondition(emptyCalls == 1)
    precondition(empty.next(matching: { _, _ in preconditionFailure() }) == nil)
}


private func runRenderSiblingPrefixChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    func cursor(_ id: Int, _ text: String, child: Bool = false) -> Diff.Cursor {
        let children = child ? [UIElementRender(id: id + 100, elementID: nil, text: "child", detailText: nil,
            sourcePath: nil, children: [])] : []
        return Diff.Cursor(item: UIElementRender(id: id, elementID: nil, text: text, detailText: nil,
            sourcePath: nil, children: children), path: IndexPath(index: id))
    }
    let old = [cursor(1, "before", child: true), cursor(2, "same"), cursor(3, "same", child: true)]
    let new = [cursor(1, "after", child: true), cursor(9, "same"), cursor(3, "same", child: true)]
    var pending: Deque<Diff.PendingChildren> = []
    let stopped = Diff.matchSiblingPrefix(old: old, new: new, pending: &pending)
    precondition(stopped.consumed == 1 && stopped.changes.count == 1 && pending.count == 1)
    if case .update(let offset, let n, let o) = stopped.changes[0] {
        precondition(offset == 0 && n.item === new[0].item && o.item === old[0].item)
    } else { preconditionFailure() }
    // Later equal IDs must remain unconsumed for the remaining matcher.
    precondition(pending.first?.old[0].path == IndexPath(indexes: [1, 0]))
    for counts in [(0, 3), (3, 0), (0, 0), (2, 3), (3, 2), (3, 3)] {
        pending = []
        let result = Diff.matchSiblingPrefix(old: Array(old.prefix(counts.0)),
            new: Array(old.prefix(counts.1)), pending: &pending)
        let expected = min(counts.0, counts.1)
        precondition(result.consumed == expected && result.changes.count == expected)
        for (offset, change) in result.changes.enumerated() {
            if case .none(let received, _, _) = change { precondition(received == offset) }
            else { preconditionFailure() }
        }
    }
}


private func runRenderResidualIdentityMapChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    func cursor(_ id: Int, at index: Int) -> Diff.Cursor {
        Diff.Cursor(item: UIElementRender(id: id, elementID: nil, text: "fixture", detailText: nil,
            sourcePath: nil, children: []), path: IndexPath(index: index))
    }
    let cursors = [cursor(99, at: 0), cursor(1, at: 1), cursor(2, at: 2), cursor(1, at: 3)]
    let result = Diff.residualIdentityMap(cursors.dropFirst(), offset: 7)
    precondition(result.count == 2 && result[99] == nil)
    precondition(result[1]?.offset == 9 && result[1]?.cursor.item === cursors[3].item)
    precondition(result[1]?.cursor.path == IndexPath(index: 3))
    precondition(result[2]?.offset == 8 && result[2]?.cursor.item === cursors[2].item)
    precondition(Diff.residualIdentityMap(cursors[2..<2], offset: 42).isEmpty)
    // Offset is the explicit consumed-prefix count, not ArraySlice.startIndex.
    let shifted = Diff.residualIdentityMap(cursors[2...], offset: -3)
    precondition(shifted[2]?.offset == -3 && shifted[1]?.offset == -2)
}


private func runRenderResidualMatchChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    func cursor(_ id: Int, _ text: String) -> Diff.Cursor {
        Diff.Cursor(item: UIElementRender(id: id, elementID: nil, text: text, detailText: nil,
            sourcePath: nil, children: []), path: IndexPath(index: id))
    }
    let old = [cursor(1, "old"), cursor(2, "same"), cursor(3, "removed")]
    let new = [cursor(2, "same"), cursor(1, "new"), cursor(4, "inserted")]
    var pending: Deque<Diff.PendingChildren> = []
    let result = Diff.matchResidualSiblings(old: old[...], new: new[...], offset: 7,
        retainedIdentities: nil, pending: &pending)
    precondition(result.count == 4)
    if case .none(let offset, let n, let o) = result[0] {
        precondition(offset == 7 && n.item === new[0].item && o.item === old[1].item)
    } else { preconditionFailure() }
    if case .update(let offset, _, _) = result[1] { precondition(offset == 8) } else { preconditionFailure() }
    if case .insert(let offset, _) = result[2] { precondition(offset == 9) } else { preconditionFailure() }
    if case .remove(let offset, let o) = result[3] { precondition(offset == 9 && o.item === old[2].item) }
    else { preconditionFailure() }
    let denied = Diff.matchResidualSiblings(old: old.prefix(1), new: new[1..<2], offset: 0,
        retainedIdentities: [], pending: &pending)
    precondition(denied.count == 1) // Removed from lookup before retention test.
    if case .insert = denied[0] {} else { preconditionFailure() }
    let duplicate = Diff.matchResidualSiblings(old: old.prefix(1), new: [new[1], new[1]][...], offset: 0,
        retainedIdentities: [1], pending: &pending)
    precondition(duplicate.count == 2)
    if case .update = duplicate[0] {} else { preconditionFailure() }
    if case .insert = duplicate[1] {} else { preconditionFailure() }
}


private func runRenderRetentionPreflightChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    func cursor(_ id: Int) -> Diff.Cursor {
        Diff.Cursor(item: UIElementRender(id: id, elementID: nil, text: "fixture", detailText: nil,
            sourcePath: nil, children: []), path: IndexPath(index: id))
    }
    let old: [Int: Diff.IndexedCursor] = [1: (0, cursor(1)), 2: (2, cursor(2)), 3: (3, cursor(3))]
    for ids in [[], [99], [1], [1, 99, 2, 3], [2, 3]] {
        precondition(Diff.retainedIdentities(for: ids, old: old,
            unordered: { _, _ in preconditionFailure("Ordered identities must skip the slow algorithm") }) == nil)
    }
    for ids in [[2, 1], [1, 1], [3, 99, 2]] {
        var calls = 0
        let result = Diff.retainedIdentities(for: ids, old: old, unordered: { received, map in
            precondition(received == ids && map[2]?.offset == 2); calls += 1; return [2]
        })
        precondition(calls == 1 && result == Set([2]))
    }
    let negative: [Int: Diff.IndexedCursor] = [1: (-1, cursor(1))]
    var calls = 0
    let result = Diff.retainedIdentities(for: [1], old: negative,
        unordered: { _, _ in calls += 1; return [] })
    precondition(calls == 1 && result != nil && result!.isEmpty)
}


private func runRenderRetentionSolverChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    let old: [Int: Diff.IndexedCursor] = Dictionary(uniqueKeysWithValues: (0..<4).map { id in
        (id, (offset: id, cursor: Diff.Cursor(item: UIElementRender(id: id, elementID: nil,
            text: "fixture", detailText: nil, sourcePath: nil, children: []), path: IndexPath(index: id))))
    })
    func check(_ input: [Int]) {
        let known = input.filter { old[$0] != nil }
        var best: [Int] = []
        // Independent exhaustive oracle: first maximum-length subsequence in
        // lexicographic input-index order, with strictly increasing offsets.
        func visit(_ start: Int, _ chosen: [Int]) {
            if chosen.count > best.count { best = chosen }
            guard start < known.count else { return }
            for index in start..<known.count {
                if let last = chosen.last, known[last] >= known[index] { continue }
                visit(index + 1, chosen + [index])
            }
        }
        visit(0, [])
        let expected = Set(best.map { known[$0] })
        precondition(Diff.unorderedRetainedIdentities(input, old: old) == expected)
        let retained = Diff.retainedIdentities(for: input, old: old)
        if let retained { precondition(retained == expected) }
    }
    func permutations(_ prefix: [Int], _ remaining: [Int]) {
        if remaining.isEmpty { check(prefix); check([99] + prefix + [99]); return }
        for (index, value) in remaining.enumerated() {
            var rest = remaining; rest.remove(at: index)
            permutations(prefix + [value], rest)
        }
    }
    permutations([], [0, 1, 2, 3])
    for input in [[], [99], [1, 1], [2, 1, 1, 3], [3, 2, 1, 0]] { check(input) }
}


private func runDefaultRenderDifferenceChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    func node(_ id: Int, _ text: String, _ children: [UIElementRender<Int>] = []) -> UIElementRender<Int> {
        UIElementRender(id: id, elementID: nil, text: text, detailText: nil, sourcePath: nil, children: children)
    }
    let oldChild = node(3, "old child"), newChild = node(3, "new child")
    let old = [node(1, "same", [oldChild]), node(2, "old root")]
    let new = [node(1, "same", [newChild]), node(2, "new root")]
    let changes = Array(Diff(oldRender: old, newRender: new))
    precondition(changes.count == 3)
    if case .none(let offset, let n, let o) = changes[0] {
        precondition(offset == 0 && n.path == IndexPath(index: 0) && o.path == IndexPath(index: 0))
    } else { preconditionFailure() }
    if case .update(let offset, _, _) = changes[1] { precondition(offset == 1) } else { preconditionFailure() }
    if case .update(let offset, let n, let o) = changes[2] {
        precondition(offset == 0 && n.item === newChild && o.item === oldChild)
        precondition(n.path == IndexPath(indexes: [0, 0]) && o.path == n.path)
    } else { preconditionFailure() }
    let reordered = Array(Diff(oldRender: [node(1, "one"), node(2, "two")],
        newRender: [node(2, "two"), node(1, "one")]))
    precondition(reordered.count == 2)
    if case .none(_, let n, _) = reordered[0] { precondition(n.item.id == 2) } else { preconditionFailure() }
    if case .insert(_, let n) = reordered[1] { precondition(n.item.id == 1) } else { preconditionFailure() }
    precondition(Array(Diff(oldRender: [], newRender: [])).isEmpty)
    let removed = Array(Diff(oldRender: [node(1, "one")], newRender: []))
    if case .remove(_, let o) = removed.first { precondition(o.item.id == 1) } else { preconditionFailure() }
}


private func runRenderDifferenceBufferChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    let old = UIElementRender(id: 1, elementID: 42, text: "same", detailText: nil, sourcePath: nil, children: [])
    let new = UIElementRender(id: 1, elementID: nil, text: "same", detailText: nil, sourcePath: nil, children: [])
    let buffered = Diff(oldRender: [old], newRender: [new]).buffer()
    precondition(!buffered.changesSortedDepthFirst && buffered.changes.count == 1)
    precondition(buffered.difference.oldRender[0] === old && buffered.difference.newRender[0] === new)
    new.append(child: UIElementRender(id: 2, elementID: nil, text: "later", detailText: nil,
        sourcePath: nil, children: []))
    precondition(Array(buffered.difference).count == 2 && buffered.changes.count == 1)
    buffered.changes[0].inheritElementID()
    precondition(new.elementID == 42) // Buffer retains the same node references.
    var copied = buffered
    copied.changes.removeAll()
    copied.changesSortedDepthFirst = true
    precondition(buffered.changes.count == 1 && !buffered.changesSortedDepthFirst)
    precondition(Diff(oldRender: [], newRender: []).buffer().changes.isEmpty)
}


private func runRenderDifferenceDepthOrderChecks() {
    typealias Diff = UIElementRenderDifference<Int>
    let node = UIElementRender(id: 1, elementID: nil, text: "fixture", detailText: nil,
        sourcePath: IndexPath(index: 99), children: [])
    func cursor(_ path: [Int]) -> Diff.Cursor { Diff.Cursor(item: node, path: IndexPath(indexes: path)) }
    let new = cursor([0]), old = cursor([8])
    let none = Diff.Change.none(offset: 999, new: new, old: old)
    let update = Diff.Change.update(offset: -1, new: new, old: old)
    let insert = Diff.Change.insert(offset: 42, new: new)
    let remove = Diff.Change.remove(offset: 0, old: new)
    precondition(none.path == new.path && update.path == new.path)
    precondition(Diff.Change.remove(offset: 0, old: old).path == old.path)
    var buffer = Diff(oldRender: [], newRender: []).buffer()
    buffer.changes = [.insert(offset: 0, new: cursor([1])), .insert(offset: 0, new: cursor([0, 1])),
        update, insert, remove, none]
    buffer.sortChangesDepthFirst()
    precondition(buffer.changesSortedDepthFirst)
    let priorities = buffer.changes.prefix(4).map { $0.depthFirstOrder.operationOrder }
    precondition(priorities == [0, 1, 2, 3])
    precondition(buffer.changes[4].path == IndexPath(indexes: [0, 1]))
    precondition(buffer.changes[5].path == IndexPath(index: 1))
    buffer.changes.reverse()
    buffer.sortChangesDepthFirst()
    precondition(buffer.changes.first!.path == IndexPath(index: 1)) // Already-sorted flag short-circuits.
    var empty = Diff(oldRender: [], newRender: []).buffer()
    empty.sortChangesDepthFirst()
    precondition(empty.changes.isEmpty && empty.changesSortedDepthFirst)
}


private func runAppendedRevisionChecks(source: TransformedUIElement) throws {
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    func tree(_ nodes: [TransformedUIElement]) -> UIElementTree<TransformedUIElement> {
        UIElementTree(items: nodes.map { .init(element: $0, subtree: leaf) }, focusedElement: nil)
    }
    func render(_ input: UIElementTree<TransformedUIElement>) -> UIElementRenderTree<AXUIElement> {
        UIElementRenderTree(isFocus: false, roots: input.items.enumerated().map { index, item in
            UIElementRender(id: item.element.id, elementID: nil, text: item.element.title ?? "",
                detailText: nil, sourcePath: IndexPath(index: index), children: [])
        })
    }
    let root = try UIElementTreeRevision.root(tree([source]), focusTree: nil, lineageID: "append-test", render: render)
    var updated = source; updated.title = "updated"
    var focus = source; focus.title = "focus"
    var added = source; added.title = "added"
    added.element = UIElement(axElement: AXUIElementCreateApplication(Int32.max), cache: source.cache)
    var calls = 0
    let next = try root.appending(tree: tree([updated, added]), focusTree: tree([focus])) { input in
        calls += 1; return render(input)
    }
    precondition(calls == 2 && next.previousRevision === root && next.lineageRootRevision === root)
    precondition(next.lineageID == root.lineageID && root.changes.isEmpty && next.changes.count == 2)
    precondition(next.renderTree.roots.map(\.elementID) == [0, 1])
    precondition(next.focusRenderTree?.roots[0].elementID == 0)
    precondition(next.element(for: 0)?.title == "focus" && next.element(for: 1)?.title == "added")
    precondition(root.element(for: 0)?.title == source.title)
    var revisionBudgetEvents: [AccessibilityDifferenceLineBudgetExceeded] = []
    checkEqual(next.differenceLines(from: root, options: [], summarizesRemovedElementIDs: true,
        ignoreDifferenceLineBudget: false, onLineBudgetExceeded: { revisionBudgetEvents.append($0) }),
        ["~0 updated", "+1 added"])
    let reduced = try next.appending(tree: tree([updated]), focusTree: nil, render: render)
    checkEqual(reduced.differenceLines(from: next, options: [.withoutRemovalSubtree],
        summarizesRemovedElementIDs: true, ignoreDifferenceLineBudget: false,
        onLineBudgetExceeded: { revisionBudgetEvents.append($0) }), ["Removed element IDs: 1"])
    next.renderTree.roots[1].elementID = nil
    checkTrue(next.differenceLines(from: root, options: [], summarizesRemovedElementIDs: true,
        ignoreDifferenceLineBudget: false, onLineBudgetExceeded: { revisionBudgetEvents.append($0) }) == nil)
    next.renderTree.roots[1].elementID = 1
    checkTrue(revisionBudgetEvents.isEmpty)
    let third = try next.appending(tree: tree([updated, added]), focusTree: nil, render: render)
    precondition(third.previousRevision === next && third.lineageRootRevision === root)
    let descriptionOwner = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(7)]),
        axWindow: WindowUIElement(axElement: source.element.axElement, cache: source.cache),
        axApplication: ApplicationUIElement(axElement: source.element.axElement, cache: source.cache))
    var reducedElement = updated; reducedElement.title = "reduced"
    let changedReduced = try next.appending(tree: tree([reducedElement]), focusTree: nil, render: render)
    let fallbackSelection = SystemSelection(applicationWindow: descriptionOwner,
        windowRevision: changedReduced, invalidationMonitor: nil)
    var fallbackEvents: [AccessibilityDifferenceLineBudgetExceeded] = []
    var fallbackFeatureReads = 0
    let fallbackText = fallbackSelection.llmDescription(.difference(from: .previous), lineOptions: [],
        onLineBudgetExceeded: { fallbackEvents.append($0) }, readSummaryFeature: {
            fallbackFeatureReads += 1; return true
        }, readWindowTitle: { _ in "fixture" }, readApplicationName: { _ in "app" },
        readSelectedText: { _ in unexpectedFailure() }, readBundleIdentifier: { _ in nil })
    checkEqual(fallbackEvents, [.removedElementSummary(fullTreeLineCount: 1)])
    checkEqual(fallbackFeatureReads, 1)
    checkEqual(fallbackText, "Window: \"fixture\", App: app.\n0 reduced\n")
    next.renderTree.roots[1].elementID = nil
    let invalidSelection = SystemSelection(applicationWindow: descriptionOwner,
        windowRevision: next, invalidationMonitor: nil)
    var invalidEvents: [AccessibilityDifferenceLineBudgetExceeded] = []
    let invalidText = invalidSelection.llmDescription(.difference(from: .previous), lineOptions: [],
        onLineBudgetExceeded: { invalidEvents.append($0) }, readSummaryFeature: { true },
        readWindowTitle: { _ in "fixture" }, readApplicationName: { _ in "app" },
        readSelectedText: { _ in unexpectedFailure() }, readBundleIdentifier: { _ in nil })
    next.renderTree.roots[1].elementID = 1
    checkTrue(invalidEvents.isEmpty)
    checkTrue(invalidText.hasPrefix("Window: \"fixture\", App: app.\n0 updated\nadded\n"))
    for (candidate, expectedReads) in [(root, 1), (next, 2), (third, 1)] {
        let selection = SystemSelection(applicationWindow: descriptionOwner, windowRevision: candidate,
            invalidationMonitor: nil)
        var trace: [String] = []
        var summaryReads = 0
        let text = selection.llmDescription(.difference(from: .previous), lineOptions: [],
            onLineBudgetExceeded: { _ in unexpectedFailure() }, readSummaryFeature: {
                summaryReads += 1; trace.append("feature"); return summaryReads > 1
            }, readWindowTitle: { _ in trace.append("title"); return "fixture" },
            readApplicationName: { _ in trace.append("name"); return "app" },
            readSelectedText: { _ in unexpectedFailure() },
            readBundleIdentifier: { _ in trace.append("bundle"); return nil })
        checkEqual(summaryReads, expectedReads)
        checkEqual(Array(trace.prefix(2)), ["title", "name"])
        checkEqual(trace.last, "bundle")
        if candidate === root {
            checkTrue(text.hasPrefix("Window: \"fixture\", App: app.\n"))
        } else if candidate === next {
            checkTrue(text.contains("Removed elements are summarized by ID range.\n~0 updated\n+1 added"))
            checkTrue(text.hasSuffix("The focused UI element is 0 focus"))
        } else {
            checkEqual(text, "There has been no change in the accessibility tree for Window: \"fixture\".")
        }
    }
    enum Failure: Error { case focus }
    var failedMain: UIElementRenderTree<AXUIElement>?
    calls = 0
    do {
        _ = try root.appending(tree: tree([updated]), focusTree: tree([focus])) { input in
            calls += 1
            if calls == 2 { throw Failure.focus }
            let rendered = render(input); failedMain = rendered; return rendered
        }
        preconditionFailure()
    } catch Failure.focus {}
    precondition(calls == 2 && failedMain?.roots[0].elementID == 0)
    precondition(root.previousRevision == nil && root.renderTree.roots[0].elementID == 0)
}


private func runExtractionRevisionChoiceChecks(source: TransformedUIElement) throws {
    var item = source
    item.role = .button; item.title = "revision choice"
    item.url = nil
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let tree = UIElementTree(items: [.init(element: item, subtree: leaf)], focusedElement: nil)
    func context() -> UIElementTransformationContext {
        UIElementTransformationContext(type: .fullUIContext, application: Optional<ApplicationUIElement>.none,
            window: Optional<WindowUIElement>.none, urlConfiguration: nil)
    }
    var initial = context()
    let previous = try UIElementTreeRevision.root(tree, focusTree: nil, context: &initial)
    for diffing in [false, true] {
        for hasPrevious in [false, true] {
            var renderContext = context()
            let result = try makeSelectionTreeRevision(tree: tree, focusTree: tree,
                previousRevision: hasPrevious ? previous : nil,
                isAXTreeDiffingEnabled: diffing, context: &renderContext)
            if diffing && hasPrevious {
                precondition(result.previousRevision === previous && result.lineageID == previous.lineageID)
                precondition(result.lineageRootRevision === previous)
            } else {
                precondition(result.previousRevision == nil && result.changes.isEmpty)
                precondition(result.lineageRootRevision === result)
            }
            let preparedTrees = result.differenceLineTrees(from: previous)
            let selectedDescription = result.descriptionTreeLines(mode: .difference(from: .previous),
                lineOptions: [], summarizesRemovedElementIDs: true,
                onLineBudgetExceeded: { _ in checkTrue(false) })
            let unchangedPresentation = AccessibilityTreePresentation.unchanged(windowTitle: "fixture",
                focusedElement: "0 button", selectedText: nil, selectedElements: [])
            let changedPresentation = AccessibilityTreePresentation.difference(windowTitle: "fixture",
                from: .previous, lines: ["~0 changed", "+1 added"], summarizesRemovedElementIDs: false,
                focusedElement: nil, selectedText: nil, selectedElements: [])
            checkEqual(changedPresentation.text,
                "The following is a diff from the previous accessibility tree for Window: \"fixture\" with ~, +, and - representing changed, added, and removed elements, respectively.\n~0 changed\n+1 added")
            checkEqual(AccessibilityTreePresentation.difference(windowTitle: "fixture", from: .initial,
                lines: [], summarizesRemovedElementIDs: true, focusedElement: "0 button",
                selectedText: nil, selectedElements: []), unchangedPresentation)
            checkEqual(unchangedPresentation.text,
                "There has been no change in the accessibility tree for Window: \"fixture\".\nThe focused UI element is 0 button")
            let selectedPresentation = AccessibilityTreePresentation.unchanged(windowTitle: "fixture",
                focusedElement: "0 button", selectedText: "chosen", selectedElements: ["ignored"])
            checkTrue(selectedPresentation.text.contains("Selected text: ```\nchosen\n```"))
            checkTrue(!selectedPresentation.text.contains("The focused UI element"))
            if diffing && hasPrevious {
                checkEqual(selectedDescription, .difference([]))
            } else {
                checkEqual(selectedDescription, .fullTree(result.renderTree.lines(indent: "\t", options: [])))
            }
            checkEqual(selectionDescriptionTreeLines(readDifference: { [] }, readFullTree: {
                checkTrue(false); return []
            }), .difference([]))
            checkEqual(selectionDescriptionTreeLines(readDifference: { nil }, readFullTree: { ["full"] }),
                .fullTree(["full"]))
            checkEqual(result.differenceLines(from: previous, options: [],
                summarizesRemovedElementIDs: true, ignoreDifferenceLineBudget: false,
                onLineBudgetExceeded: { _ in checkTrue(false) }), [])
            checkTrue(preparedTrees != nil)
            checkEqual(preparedTrees?.baseline.roots.map(\.elementID), previous.renderTree.roots.map(\.elementID))
            checkEqual(preparedTrees?.current.roots.map(\.elementID), result.renderTree.roots.map(\.elementID))
            checkTrue(result.descriptionDifferenceBaseline(for: .fullTree) == nil)
            checkTrue(result.descriptionDifferenceBaseline(for: .difference(from: .previous)) === result.previousRevision)
            if let base = result.previousRevision {
                checkTrue(result.descriptionDifferenceBaseline(for: .difference(from: .initial)) === base.lineageRootRevision)
                var nextContext = context()
                let next = try result.appending(tree: tree, focusTree: tree, context: &nextContext)
                checkTrue(next.descriptionDifferenceBaseline(for: .difference(from: .previous)) === result)
                checkTrue(next.descriptionDifferenceBaseline(for: .difference(from: .initial)) === previous)
            } else {
                checkTrue(result.descriptionDifferenceBaseline(for: .difference(from: .initial)) == nil)
                var resumedContext = context()
                let resumed = try makeSelectionTreeRevision(tree: tree, focusTree: nil,
                    previousRevision: result, isAXTreeDiffingEnabled: true, context: &resumedContext)
                checkTrue(resumed.previousRevision === result)
                checkTrue(resumed.lineageRootRevision === result)
                checkTrue(resumed.lineageRootRevision !== previous)
                checkTrue(resumed.descriptionDifferenceBaseline(for: .difference(from: .initial)) === result)
                checkEqual(resumed.descriptionTreeLines(mode: .difference(from: .previous), lineOptions: [],
                    summarizesRemovedElementIDs: true, onLineBudgetExceeded: { _ in unexpectedFailure() }), .difference([]))
            }
            precondition(result.focusTree != nil && result.focusRenderTree != nil)
            precondition(!result.renderTree.roots.isEmpty)
            precondition(renderContext.type == .fullUIContext)
        }
    }
}


private func runTreeURLTrimmingChecks(source: TransformedUIElement) {
    let url = URL(string: "https://example.com/path?query=value")!
    for type in [UIElementContextType.fullUIContext, .informationalContext] {
        for attributed in [false, true] {
            var context = UIElementTransformationContext(type: type, application: Optional<ApplicationUIElement>.none,
                window: Optional<WindowUIElement>.none, urlConfiguration: nil)
            var interpolation = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 1)
            interpolation.appendInterpolation(url, role: UIElementRole("AXLink"), context: &context)
            var element = source
            element.transformedString = TransformedUIString(stringInterpolation: interpolation)
            element.value = element.transformedString!.description
            element.attributedString = attributed ? NSAttributedString(string: "original") : nil
            let originalValue = element.value
            let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
            let child = UIElementTree(items: [.init(element: element, subtree: leaf)], focusedElement: nil)
            var tree = UIElementTree(items: [.init(element: element, subtree: child)], focusedElement: element)
            context.urlShortener.configuration.includeQuery = false
            tree.trimURLs(using: &context)
            let shortened = tree.items[0].element.transformedString!.description
            precondition(shortened != originalValue && !shortened.contains("query=value"))
            let expected = type == .informationalContext && attributed ? originalValue : shortened
            precondition(tree.items[0].element.value == expected && tree.items[0].subtree.items[0].element.value == expected)
            precondition(tree.focusedElement?.value == originalValue)
        }
    }
    var context = UIElementTransformationContext(type: .fullUIContext, application: Optional<ApplicationUIElement>.none,
        window: Optional<WindowUIElement>.none, urlConfiguration: nil)
    var plain = source; plain.transformedString = "plain"; plain.value = "sentinel"
    var tree = UIElementTree(items: [.init(element: plain,
        subtree: UIElementTree<TransformedUIElement>(items: [], focusedElement: nil))], focusedElement: nil)
    tree.trimURLs(using: &context)
    precondition(tree.items[0].element.value == "sentinel")
}


private func runExtractionURLCompactionChecks(source: TransformedUIElement) throws {
    try runExtractionTreeTransformationChecks(source: source)
    let config = UIElementURLShortener.Configuration(individualLimit: nil, totalLimit: 30,
        includeQuery: true, includeFragment: true, baseHost: nil)
    var context = UIElementTransformationContext(type: .fullUIContext, application: Optional<ApplicationUIElement>.none,
        window: Optional<WindowUIElement>.none, urlConfiguration: config)
    var total = 10, calls = 0
    var initialText = ""
    _ = context.urlShortener.trim(url: URL(string: "https://stale.example/previous-capture")!, isImage: false)
    let result = withSelectionTreeURLCompaction(context: &context, totalLength: &total) { ctx in
        checkEqual(ctx.urlShortener.compactConfigurationIfNeeded(), 0)
        calls += 1
        let url = URL(string: "https://example.com/path?query=" + String(repeating: "x", count: 200))!
        var interpolation = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 1)
        interpolation.appendInterpolation(url, role: UIElementRole("AXLink"), context: &ctx)
        var node = source
        node.transformedString = TransformedUIString(stringInterpolation: interpolation)
        node.value = node.transformedString!.description
        initialText = node.value!
        ctx.urlShortener.configuration.includeQuery = false
        let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        let tree = UIElementTree(items: [.init(element: node, subtree: leaf)], focusedElement: nil)
        return (tree, tree)
    }
    precondition(calls == 1 && total > 10 && context.urlShortener.configuration != config)
    precondition(result.tree.items[0].element.value != initialText)
    precondition(result.focusTree?.items[0].element.value == result.focusTree?.items[0].element.transformedString?.description)
    enum Failure: Error { case transform }
    let compacted = context.urlShortener.configuration
    let before = total
    _ = context.urlShortener.trim(url: URL(string: "https://stale.example/before-failure")!, isImage: false)
    do {
        _ = try withSelectionTreeURLCompaction(context: &context, totalLength: &total) { ctx in
            checkEqual(ctx.urlShortener.compactConfigurationIfNeeded(), 0)
            throw Failure.transform
        }
        preconditionFailure()
    } catch Failure.transform {}
    precondition(total == before && context.urlShortener.configuration == compacted)
}


private func runExtractionURLRegistrationChecks(source: TransformedUIElement) {
    var context = UIElementTransformationContext(type: .fullUIContext, application: Optional<ApplicationUIElement>.none,
        window: Optional<WindowUIElement>.none, urlConfiguration: .init(individualLimit: nil, totalLimit: 10000,
            includeQuery: true, includeFragment: true, baseHost: nil))
    var parent = source; parent.role = .button; parent.title = "parent"
    parent.url = URL(string: "https://example.com/a")!
    var child = parent; child.title = "child"; child.url = URL(string: "https://example.org/b")!
    var focused = parent; focused.url = URL(string: "https://excluded.example/focus")!
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let subtree = UIElementTree(items: [.init(element: child, subtree: leaf)], focusedElement: nil)
    let tree = UIElementTree(items: [.init(element: parent, subtree: subtree)], focusedElement: focused)
    let focus = UIElementTree(items: [.init(element: parent, subtree: leaf)], focusedElement: parent)
    registerSelectionTreeURLs(tree: tree, focusTree: focus, context: &context)
    // Duplicate URL across full/focus trees is counted once by compaction;
    // the separate focusedElement capture is not a traversal node.
    precondition(context.urlShortener.compactConfigurationIfNeeded() == "example.com/a".count + "example.org/b".count)
    precondition(tree.items[0].element.title == "parent" && tree.focusedElement?.url == focused.url)
}


private func runMacTreeTransformCompositionChecks(source: TransformedUIElement) {
    var link = source; link.role = UIElementRole("AXLink")
    link.url = URL(string: "https://example.com/path")!
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let tree = UIElementTree(items: [.init(element: link, subtree: leaf)], focusedElement: link)
    let app = ApplicationUIElement(axElement: AXUIElementCreateApplication(Int32.max), cache: source.cache)
    var context = UIElementTransformationContext(type: .fullUIContext, application: Optional<ApplicationUIElement>.none,
        window: Optional<WindowUIElement>.none, urlConfiguration: nil)
    let output = tree.transformed(for: app, using: [.shared(.flattenLinksIntoMarkdownText)], in: &context,
        rebuild: { _, _, _ in preconditionFailure() }, providerTitle: { _ in preconditionFailure() },
        owningBundleIdentifier: { _ in preconditionFailure() },
        renderNode: { node, ctx in node.accessibilityDescription(context: &ctx) },
        reportUnknownAttributedStyle: { _ in preconditionFailure() }, reportAttributeError: { _ in preconditionFailure() },
        reportUnexpectedNextLine: { preconditionFailure() })
    precondition(output.items.count == 1 && output.items[0].element.role == .staticText)
    precondition(output.items[0].element.url == nil && output.items[0].element.value == "example.com/path")
    precondition(output.focusedElement?.url == link.url && tree.items[0].element.role == UIElementRole("AXLink"))
    precondition(context.urlShortener.compactConfigurationIfNeeded() == "example.com/path".count)
}


private func runOwningApplicationBundleResolutionChecks() {
    enum Failure: Error { case pid }
    var reports = 0
    let failed = resolveOwningApplicationBundleIdentifier(processID: { throw Failure.pid },
        bundleIdentifier: { _ in preconditionFailure() }, reportError: { error in
            guard case Failure.pid = error else { preconditionFailure() }; reports += 1
        })
    precondition(failed == nil && reports == 1)
    for identifier: String? in [nil, "com.apple.iCal", "other.app"] {
        var reads = 0
        let result = resolveOwningApplicationBundleIdentifier(processID: { 42 },
            bundleIdentifier: { pid in precondition(pid == 42); reads += 1; return identifier },
            reportError: { _ in preconditionFailure() })
        precondition(reads == 1 && result == identifier)
    }
}


private func runMacProviderTitleTransactionChecks() {
    let ax = AXUIElementCreateApplication(getpid())
    let title = UIElementAttribute("AXTitle")
    for value: AnyObject in ["provider title" as NSString, "" as NSString, NSNumber(value: 42)] {
        let partial = AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil,
            textTruncationDescriptor: nil)
        let root = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
        let transaction = UIElementTreeTransaction(element: root,
            cache: UIElementTransactionCache(attributeTable: [ax: [title: partial]], requestedAttributes: [title],
                fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: FrequencyTable<UIElementRole>())
        transaction.perform { _ in
            let result = macTransformationProviderTitle(ax)
            if let string = value as? NSString { precondition(result == string as String) }
            else { precondition(result == nil) }
        }
    }
}

private func runMacTransformationRenderChecks(source: TransformedUIElement) {
    var element = source
    element.url = URL(string: "https://example.com/render-default?query=value")
    var actual = UIElementTransformationContext(type: .fullUIContext,
        application: nil, window: nil, urlConfiguration: nil)
    var expected = actual
    let text = macTransformationRenderNode(element, &actual)
    checkEqual(text, element.accessibilityDescription(context: &expected))
    checkEqual(actual.urlShortener.configuration, expected.urlShortener.configuration)
    // Rendering must mutate the caller's context, including URL registration.
    checkEqual(actual.urlShortener.compactConfigurationIfNeeded(), expected.urlShortener.compactConfigurationIfNeeded())
}

private func runBuilderAppendChecks(source: TransformedUIElement) {
    var tree = UIElementTree<TransformedUIElement>(items: [], focusedElement: source)
    checkTrue(!tree.hasDescendant(where: \.isEnabled))
    var child = source
    child.isEnabled = true
    let subtree = UIElementTree<TransformedUIElement>(items: [], focusedElement: child)
    tree.appendBuiltElement(child, subtree: subtree, availableSubset: nil)
    checkEqual(tree.items.count, 1)
    checkTrue(tree.hasDescendant(where: \.isEnabled))
    checkEqual(tree.items[0].element.id, child.id)
    checkEqual(tree.items[0].subtree.focusedElement?.id, child.id)
    checkEqual(tree.focusedElement?.title, source.title)
    checkTrue(tree.items[0].availableSubset == nil)
}

private func runVisibleSubsetFallbackChecks() {
    let rows = UIElementAttribute("AXVisibleRows")
    let children = UIElementAttribute("AXVisibleChildren")
    checkEqual(uiElementFullAttributeForVisibleSubset(rows), UIElementAttribute("AXRows"))
    checkEqual(uiElementFullAttributeForVisibleSubset(children), UIElementAttribute("AXChildren"))
    checkTrue(uiElementFullAttributeForVisibleSubset(UIElementAttribute("AXUnknown")) == nil)
    for (count, visible, reads) in [(0, 0, 0), (1, 0, 1), (1, 1, 0), (499, 1, 1), (500, 1, 0)] {
        var called = 0
        let result: [Int]? = uiElementVisibleSubsetFallback(using: children, visibleCount: visible,
            count: { checkEqual($0, UIElementAttribute("AXChildren")); return count },
            read: { _ in called += 1; return [] })
        checkEqual(called, reads)
        checkTrue((result != nil) == (reads == 1))
    }
    let result: [Int]? = uiElementVisibleSubsetFallback(using: UIElementAttribute("AXUnknown"), visibleCount: 0,
        count: { _ in unexpectedFailure(); return 1 }, read: { _ in unexpectedFailure(); return [] })
    checkTrue(result == nil)
}

private func runCompleteCollectionChecks() {
    let descriptors: [AXArraySubsetDescriptor?] = [nil, .init(count: 10),
        .init(count: 10, availableRanges: []), .init(count: 10, availableRanges: [0..<10])]
    for (index, descriptor) in descriptors.enumerated() {
        var decoded = 0; var fresh = 0
        let partial = AXPartialValue(value: AXEncodedValue(value: [] as NSArray),
            arraySubsetDescriptor: descriptor, textTruncationDescriptor: nil)
        let result: [Int]? = uiElementCompleteCollectionValue(cached: { partial },
            decode: { _ in decoded += 1; return [] }, uncached: { fresh += 1; return [7] })
        checkEqual(decoded, index < 2 ? 1 : 0)
        checkEqual(fresh, index < 2 ? 0 : 1)
        checkEqual(result, index < 2 ? [] : [7])
        let invalid: [Int]? = uiElementCompleteCollectionValue(cached: { partial },
            decode: { _ in throw UIElementError.axError(.failure) }, uncached: { return [7] })
        checkEqual(invalid, index < 2 ? nil : [7])
    }
    let missing: [Int]? = uiElementCompleteCollectionValue(cached: { nil },
        decode: { _ in unexpectedFailure(); return [] }, uncached: { nil })
    checkTrue(missing == nil)
}

private func runVisibleCollectionResolutionChecks() {
    let rows = UIElementAttribute("AXRows")
    var trace: [String] = []
    let result = resolveVisibleCollection(visible: [2, 2], cached: { attribute -> [Int]? in
        trace.append(attribute == rows ? "rows" : "children")
        return attribute == rows ? [1] : [2, 3, 3]
    }, fallback: { unexpectedFailure(); return nil })
    checkEqual(result, [2, 3, 3]); checkEqual(trace, ["rows", "children"])
    let empty: [Int]? = resolveVisibleCollection(visible: [], cached: { attribute in
        checkEqual(attribute, rows); return []
    }, fallback: { unexpectedFailure(); return nil })
    checkEqual(empty, [Int]())
    trace = []
    let fallback = resolveVisibleCollection(visible: [4], cached: { attribute -> [Int]? in
        trace.append(attribute == rows ? "rows" : "children")
        if attribute == rows { throw UIElementError.axError(.failure) }
        return nil
    }, fallback: { trace.append("fallback"); return [4, 4] })
    checkEqual(fallback, [4, 4]); checkEqual(trace, ["rows", "children", "fallback"])
}

private func runVisibleIndexRangeChecks() {
    checkEqual(uiElementVisibleIndexRanges(full: [1, 2, 3, 4, 5], visible: [2, 3, 5]), [1...2, 4...4])
    checkEqual(uiElementVisibleIndexRanges(full: [1, 2, 1], visible: [1]), [0...0, 2...2])
    checkEqual(uiElementVisibleIndexRanges(full: [1, 1], visible: [1]), [0...1])
    checkEqual(uiElementVisibleIndexRanges(full: [Int](), visible: [1]), [])
    for mask in 0..<256 {
        let full = Array(0..<8)
        let visible = Set(full.filter { mask & (1 << $0) != 0 })
        let ranges = uiElementVisibleIndexRanges(full: full, visible: visible)
        checkEqual(ranges.flatMap { Array($0) }, full.filter { visible.contains($0) })
        for pair in zip(ranges, ranges.dropFirst()) {
            checkTrue(pair.0.upperBound + 1 < pair.1.lowerBound)
        }
    }
}

private func runVisibleRangeExpansionChecks() {
    checkEqual(expandUIElementVisibleRange(3...4, minimumCount: 5, totalCount: 10), 1...5)
    checkEqual(expandUIElementVisibleRange(0...1, minimumCount: 5, totalCount: 10), 0...4)
    checkEqual(expandUIElementVisibleRange(8...9, minimumCount: 5, totalCount: 10), 5...9)
    checkEqual(expandUIElementVisibleRange(3...4, minimumCount: 20, totalCount: 10), 0...9)
    checkEqual(expandUIElementVisibleRange(3...4, minimumCount: 1, totalCount: 10), 3...4)
    checkEqual(expandUIElementVisibleRange(3...4, minimumCount: 0, totalCount: 10), 3...4)
    for total in 1...10 {
        for lower in 0..<total {
            for upper in lower..<total {
                for minimum in 0...12 {
                    let expanded = expandUIElementVisibleRange(lower...upper, minimumCount: minimum, totalCount: total)
                    checkTrue(expanded.lowerBound >= 0 && expanded.upperBound < total)
                    checkTrue(expanded.contains(lower) && expanded.contains(upper))
                    checkEqual(expanded.count, max(upper - lower + 1, min(minimum, total)))
                }
            }
        }
    }
}

private func runVisibleRangeSelectionChecks() {
    checkEqual(selectUIElementVisibleRanges([0...0, 3...5, 8...10], limit: 1), [8...10])
    checkEqual(selectUIElementVisibleRanges([0...0, 3...5, 8...10], limit: 2), [3...5, 8...10])
    checkEqual(selectUIElementVisibleRanges([0...0], limit: 0), [])
    checkEqual(selectUIElementVisibleRanges([], limit: 1), [])
    let ranges = (0..<100).map { index in (index * 20)...(index * 20 + index % 7) }
    // Independent rank oracle: size, then original offset for ties.
    let ranked = ranges.enumerated().sorted {
        if $0.element.count == $1.element.count { return $0.offset < $1.offset }
        return $0.element.count < $1.element.count
    }.map { $0.element }
    for limit in 0...105 {
        checkEqual(selectUIElementVisibleRanges(ranges, limit: limit), Array(ranked.suffix(min(limit, ranges.count))))
    }
}

private func runVisibleSubsetCompositionChecks() {
    let original = AXArraySubsetDescriptor(count: 50, availableRanges: [10..<12])
    func build(_ visible: [Int], _ full: [Int]?, _ minimum: Int)
        -> (array: [Int], subsetDescriptor: AXArraySubsetDescriptor?) {
        buildUIElementVisibleSubset(partial: (visible, original), minimumCount: minimum,
            identity: { $0 }, fullCollection: { full }, initialize: { $0 })
    }
    let preserved = build([2, 4], [0, 1, 2, 3, 4, 5], 0)
    checkEqual(preserved.array, [2, 4]); checkEqual(preserved.subsetDescriptor, original)
    let expanded = build([2, 3], [0, 1, 2, 3, 4, 5], 4)
    checkEqual(expanded.array, [1, 2, 3, 4])
    checkEqual(expanded.subsetDescriptor, .init(count: 6, availableRanges: [1..<5]))
    let complete = build([2, 3], [0, 1, 2, 3, 4, 5], 10)
    checkEqual(complete.array, [0, 1, 2, 3, 4, 5]); checkTrue(complete.subsetDescriptor == nil)
    checkEqual(build([2], nil, 5).subsetDescriptor, original)
    checkEqual(build([], [0, 1], 5).subsetDescriptor, original)
}

private func runPositionVisibilityChecks() {
    let parent = CGRect(x: 0, y: 0, width: 100, height: 100)
    let frames: [CGRect?] = [CGRect(x: 10, y: 10, width: 10, height: 10),
        CGRect(x: 100, y: 10, width: 10, height: 10),
        CGRect(x: 0, y: 10, width: 0.5, height: 10), nil]
    checkEqual(uiElementPositionVisibility(parentFrame: parent, clippingFrame: nil, childFrames: frames),
        [true, false, false, false])
    checkEqual(uiElementPositionVisibility(parentFrame: parent,
        clippingFrame: CGRect(x: 50, y: 0, width: 50, height: 100), childFrames: frames),
        [false, false, false, false])
    checkEqual(uiElementPositionVisibility(parentFrame: nil, clippingFrame: parent,
        childFrames: [CGRect(x: 10, y: 10, width: 10, height: 10)]), [false])
    checkEqual(uiElementPositionVisibility(parentFrame: parent, clippingFrame: nil, childFrames: []), [])
}

private func runPositionSubsetChecks() {
    let full = Array(0..<7)
    let visibility = [false, true, true, false, true, true, false]
    let all = buildUIElementPositionSubset(full: full, visibility: visibility, minimumCount: 7,
        includeAllVisibleItemRanges: true, initialize: { $0 })!
    checkEqual(all.array, [1, 2, 4, 5])
    checkEqual(all.subsetDescriptor, .init(count: 7, availableRanges: [1..<3, 4..<6]))
    let one = buildUIElementPositionSubset(full: full, visibility: visibility, minimumCount: 3,
        includeAllVisibleItemRanges: false, initialize: { $0 })!
    checkEqual(one.array, [3, 4, 5])
    checkEqual(one.subsetDescriptor, .init(count: 7, availableRanges: [3..<6]))
    let none = buildUIElementPositionSubset(full: full, visibility: Array(repeating: false, count: 7),
        minimumCount: 7, includeAllVisibleItemRanges: false, initialize: { $0 })
    checkTrue(none == nil)
    let complete = buildUIElementPositionSubset(full: full, visibility: visibility, minimumCount: 20,
        includeAllVisibleItemRanges: false, initialize: { $0 })!
    checkEqual(complete.array, full); checkTrue(complete.subsetDescriptor == nil)
}

private func runRecursiveTreeBuildChecks() {
    let rootAX = AXUIElementCreateApplication(2147480000)
    let childAX = AXUIElementCreateApplication(2147480001)
    let role = UIElementAttribute("AXRole"), children = UIElementAttribute("AXChildren")
    let value = UIElementAttribute("AXValue")
    func partial(_ raw: AnyObject) -> AXPartialValue {
        .init(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    let emptyCache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
    let root = UIElement(axElement: rootAX, cache: emptyCache)
    let attributes: [AXUIElement: [UIElementAttribute: AXPartialValue]] = [
        rootAX: [role: partial("AXDateField" as NSString), children: partial([childAX, childAX] as NSArray)],
        childAX: [role: partial("AXIncrementor" as NSString), children: partial([rootAX] as NSArray), value: partial("5" as NSString)]]
    let transaction = UIElementTreeTransaction(element: root,
        cache: .init(attributeTable: attributes, requestedAttributes: [role, children, value],
            fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: FrequencyTable<UIElementRole>())
    var context = UIElementTransformationContext(type: .eventStreamContext, application: nil, window: nil, urlConfiguration: nil)
    context.isChromium = true
    transaction.perform { _ in
        var tree = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        var visited: Set<AXUIElement> = []
        tree.addRecursively(root, at: IndexPath(), traversalParentRole: nil, context: context,
            visited: &visited, filter: { _, _ in true }, reportDepthLimit: { unexpectedFailure() },
            reportLimit: { _ in unexpectedFailure() }, reportError: { _ in }, reportUnknownDateComponents: { _ in })
        checkEqual(tree.items.count, 1)
        checkEqual(tree.items[0].element.id, rootAX)
        checkEqual(tree.items[0].children.count, 1)
        checkEqual(tree.items[0].children[0].element.id, childAX)
        checkTrue(!tree.items[0].children[0].element.isValueSettable)
        let standalone = TransformedUIElement(element: UIElement(element: childAX), context: context,
            traversalParentRole: nil, reportError: { _ in }, reportUnknownDateComponents: { _ in })
        checkTrue(standalone.isValueSettable)
        var stale = tree.items[0].children[0]
        stale.element.title = "transformed stale title"
        var rebuilt = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        macTransformationRebuild(&rebuilt, stale, &context, reportDepthLimit: { unexpectedFailure() },
            reportLimit: { _ in unexpectedFailure() }, reportError: { _ in },
            reportUnknownDateComponents: { _ in })
        checkTrue(rebuilt.items[0].element.title == nil)
        checkTrue(rebuilt.items[0].element.isValueSettable)
        checkEqual(rebuilt.items[0].children[0].element.id, rootAX)
        checkTrue(tree.items[0].children[0].children.isEmpty)
        checkEqual(visited, Set([rootAX, childAX]))
        var filteredTree = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        var filteredVisited: Set<AXUIElement> = []
        var indices: [Int] = []
        filteredTree.addRecursively(root, at: IndexPath(), traversalParentRole: nil, context: context,
            visited: &filteredVisited, filter: { index, _ in indices.append(index); return false },
            reportDepthLimit: { unexpectedFailure() }, reportLimit: { _ in unexpectedFailure() },
            reportError: { _ in }, reportUnknownDateComponents: { _ in })
        checkEqual(indices, [0, 1])
        checkEqual(filteredVisited, Set([rootAX]))
        checkTrue(filteredTree.items[0].children.isEmpty)
        var depthReports = 0
        var depthTree = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        var depthVisited: Set<AXUIElement> = []
        depthTree.addRecursively(root, at: IndexPath(indexes: Array(repeating: 0, count: 201)),
            traversalParentRole: nil, context: context, visited: &depthVisited,
            filter: { _, _ in unexpectedFailure(); return true }, reportDepthLimit: { depthReports += 1 },
            reportLimit: { _ in unexpectedFailure() }, reportError: { _ in unexpectedFailure() },
            reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkEqual(depthReports, 1); checkTrue(depthTree.items.isEmpty && depthVisited.isEmpty)
        var added = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        for _ in 0..<2 {
            added.add(root, context: &context, reportDepthLimit: { unexpectedFailure() },
                reportLimit: { _ in unexpectedFailure() }, reportError: { _ in },
                reportUnknownDateComponents: { _ in })
        }
        checkEqual(added.items.count, 2)
        checkEqual(added.items.map { $0.children.count }, [1, 1])
        var missingSourceTree = UIElementTree<TransformedUIElement>(items: [], focusedElement: standalone)
        var failures = 0
        let fallbackFocus = missingSourceTree.focusTree(forSelection: [root, root], context: &context,
            reportSelectionResolutionFailure: { failures += 1 },
            reportDepthLimit: { unexpectedFailure() }, reportLimit: { _ in unexpectedFailure() },
            reportError: { _ in }, reportUnknownDateComponents: { _ in })!
        checkEqual(failures, 1)
        checkEqual(fallbackFocus.items[0].children.map { $0.element.id }, [rootAX, rootAX])
        checkEqual(fallbackFocus.items[0].children.map { $0.children.count }, [1, 1])
        checkTrue(missingSourceTree.items.isEmpty)
    }
}

private func runFocusSelectionAttributeChecks() {
    let rows = UIElementAttribute("AXSelectedRows")
    let cells = UIElementAttribute("AXSelectedCells")
    let children = UIElementAttribute("AXSelectedChildren")
    checkEqual(uiElementSupportedSelectionAttributes([children, rows, cells]), [rows, cells, children])
    checkEqual(uiElementSupportedSelectionAttributes([children, rows, UIElementAttribute("AXSelected")]), [rows, children])
    checkEqual(uiElementSupportedSelectionAttributes([]), [])
}

private func runFocusPositiveSelectionChecks() {
    let rows = UIElementAttribute("AXSelectedRows")
    let cells = UIElementAttribute("AXSelectedCells")
    let children = UIElementAttribute("AXSelectedChildren")
    var trace: [UIElementAttribute] = []
    let chosen = uiElementFocusSelectionAttribute(supported: [rows, cells, children], count: {
        trace.append($0)
        if $0 == rows { throw UIElementError.axError(.failure) }
        return 2
    })
    checkEqual(chosen, cells); checkEqual(trace, [rows, cells])
    trace = []
    let absent = uiElementFocusSelectionAttribute(supported: [rows, cells, children], count: {
        trace.append($0); return $0 == rows ? nil : ($0 == cells ? -1 : 0)
    })
    checkTrue(absent == nil); checkEqual(trace, [rows, cells, children])
    checkTrue(uiElementFocusSelectionAttribute(supported: [], count: { _ in unexpectedFailure(); return 1 }) == nil)
}

private func runFocusSelectionReadChecks() {
    let rows = UIElementAttribute("AXSelectedRows"), cells = UIElementAttribute("AXSelectedCells")
    for result: [Int]? in [nil, [], [7, 7]] {
        var trace: [UIElementAttribute] = []
        let value = uiElementFocusSelectionElements(supported: [rows, cells], count: {
            checkEqual($0, rows); return 1
        }, read: { trace.append($0); return result })
        checkEqual(value, result); checkEqual(trace, [rows])
    }
    let none: [Int]? = uiElementFocusSelectionElements(supported: [rows], count: { _ in 0 },
        read: { _ in unexpectedFailure(); return [] })
    checkTrue(none == nil)
}

private func runFocusProviderCacheChecks() {
    let rootAX = AXUIElementCreateApplication(2147480002)
    let childAX = AXUIElementCreateApplication(2147480003)
    let rows = UIElementAttribute("AXSelectedRows"), cells = UIElementAttribute("AXSelectedCells")
    let title = UIElementAttribute("AXTitle")
    func partial(_ raw: AnyObject, subset: AXArraySubsetDescriptor? = nil) -> AXPartialValue {
        .init(value: AXEncodedValue(value: raw), arraySubsetDescriptor: subset, textTruncationDescriptor: nil)
    }
    let root = UIElement(axElement: rootAX,
        cache: .init(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
    let transaction = UIElementTreeTransaction(element: root,
        cache: .init(attributeTable: [childAX: [title: partial("transaction child" as NSString)]],
            requestedAttributes: [title], fallbackElements: UIElementFallbackCache(initialState: [:])),
        roleFrequencyTable: FrequencyTable<UIElementRole>())
    transaction.perform { _ in
        let childArray = partial([childAX, childAX] as NSArray)
        let provider = UIElement(axElement: rootAX, cache: .init(supportedAttributes: [rows, cells],
            attributes: [rows: childArray, cells: partial([] as NSArray)], transactionAttributes: nil))
        let selected = provider.selectedElementsForFocus(reportError: { _ in unexpectedFailure() })!
        checkEqual(selected.map { $0.axElement }, [childAX, childAX])
        checkEqual(selected.map { $0.title }, ["transaction child", "transaction child"])
        // A positive descriptor count may accompany an empty cached partial.
        // The empty decode is final; cells must not replace it.
        let empty = UIElement(axElement: rootAX, cache: .init(supportedAttributes: [rows, cells],
            attributes: [rows: partial([] as NSArray, subset: .init(count: 2, availableRanges: [])),
                cells: childArray], transactionAttributes: nil))
        checkEqual(empty.selectedElementsForFocus(reportError: { _ in unexpectedFailure() })?.count, 0)
        let malformedCount = UIElement(axElement: rootAX, cache: .init(supportedAttributes: [rows, cells],
            attributes: [rows: partial("not an array" as NSString), cells: childArray], transactionAttributes: nil))
        checkEqual(malformedCount.selectedElementsForFocus(reportError: { _ in unexpectedFailure() })?.count, 2)
    }
}

private func runFocusItemResolutionChecks(source: TransformedUIElement) {
    runSelectionWebAreaURLChecks(source: source)
    let childAX = AXUIElementCreateApplication(2147480004)
    let missingAX = AXUIElementCreateApplication(2147480005)
    var child = source
    child.element = UIElement(axElement: childAX, cache: source.element.cache)
    child.title = "stored child"
    let empty = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let childItem = UIElementTree<TransformedUIElement>.Item(element: child, subtree: empty,
        availableSubset: .init(count: 5, availableRanges: [2..<3]))
    var tree = UIElementTree(items: [.init(element: source,
        subtree: .init(items: [childItem], focusedElement: nil))], focusedElement: source)
    var attached = tree
    attached.attachSelectionExtractionFocus(nil, reportMissingFocus: { _ in unexpectedFailure() })
    checkEqual(attached.focusedElement?.id, source.id)
    attached.attachSelectionExtractionFocus(child.element, reportMissingFocus: { _ in unexpectedFailure() })
    checkEqual(attached.focusedElement?.title, "stored child")
    let missing = UIElement(axElement: missingAX, cache: source.element.cache)
    var missingReports = 0
    attached.attachSelectionExtractionFocus(missing, reportMissingFocus: {
        checkEqual($0.id, missingAX)
        missingReports += 1
    })
    checkEqual(missingReports, 1)
    checkTrue(attached.focusedElement == nil)
    checkEqual(attached.items[0].children.count, 1)
    checkEqual(tree.focusedElement?.id, source.id)
    let resolved = tree.itemsForFocusSelection([childAX, source.id, childAX])!
    checkEqual(resolved.map { $0.element.id }, [childAX, source.id, childAX])
    checkEqual(resolved[0].element.title, "stored child")
    checkEqual(resolved[0].availableSubset, childItem.availableSubset)
    checkEqual(resolved[1].children.count, 1)
    let focus = tree.focusTreeForResolvedSelection(resolved)!
    checkEqual(focus.items[0].children.map { $0.element.id }, [childAX, source.id, childAX])
    checkTrue(focus.items[0].children.allSatisfy { $0.children.isEmpty && $0.availableSubset == nil })
    checkEqual(focus.focusedElement?.id, source.id)
    checkEqual(tree.items[0].children.count, 1)
    let noFocus = UIElementTree<TransformedUIElement>(items: tree.items, focusedElement: nil)
    checkTrue(noFocus.focusTreeForResolvedSelection(resolved) == nil)
    let rows = UIElementAttribute("AXSelectedRows")
    let selection = AXPartialValue(value: AXEncodedValue(value: [childAX, childAX] as NSArray),
        arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    var focused = source
    focused.element = UIElement(axElement: source.id, cache: .init(supportedAttributes: [rows],
        attributes: [rows: selection], transactionAttributes: nil))
    var entryTree = UIElementTree<TransformedUIElement>(items: tree.items, focusedElement: focused)
    let transaction = UIElementTreeTransaction(element: focused.element,
        cache: .init(attributeTable: [childAX: [:]], requestedAttributes: [],
            fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: FrequencyTable<UIElementRole>())
    transaction.perform { _ in
        var context = UIElementTransformationContext(type: .fullUIContext, application: nil,
            window: nil, urlConfiguration: nil)
        let result = entryTree.focusTree(context: &context,
            reportSelectionResolutionFailure: { unexpectedFailure() },
            reportDepthLimit: { unexpectedFailure() }, reportLimit: { _ in unexpectedFailure() },
            reportError: { _ in unexpectedFailure() }, reportUnknownDateComponents: { _ in unexpectedFailure() })!
        checkEqual(result.items[0].children.map { $0.element.id }, [childAX, childAX])
        checkEqual(result.items[0].children.map { $0.element.title }, ["stored child", "stored child"])
        checkTrue(result.items[0].children.allSatisfy { $0.children.isEmpty && $0.availableSubset == nil })
    }
    checkTrue(tree.itemsForFocusSelection([childAX, missingAX, source.id]) == nil)
    checkEqual(tree.itemsForFocusSelection([])?.count, 0)
    checkEqual(tree.focusedElement?.id, source.id)
}

private func runImmediateMenuBarFilteringChecks() {
    let titles: [String?] = ["Apple", "File", "Debug", "debug", "MyDebugger", "", nil]
    var read: [Int] = []
    let retained = immediateMenuBarItems(Array(titles.indices), title: {
        read.append($0); return titles[$0]
    })
    checkEqual(retained, [1, 3, 5, 6])
    checkEqual(read, [1, 2, 3, 4, 5, 6])
    var trace: [String] = []
    forEachImmediateMenuBarItem([0, 1, 2, 3], title: {
        trace.append("title \($0)"); return $0 == 2 ? "Debug" : nil
    }, visit: { trace.append("capture \($0)") })
    checkEqual(trace, ["title 1", "capture 1", "title 2", "title 3", "capture 3"])
    checkEqual(immediateMenuBarItems([0], title: { _ in unexpectedFailure(); return nil }), [])
}

private func runMenuBarProviderCompositionChecks() {
    for kind in UIElementContextType.allCases {
        for matches in [false, true] {
            for present in [false, true] {
                var events: [String] = []
                withSelectionExtractionMenuBar(rootMatchesMenuBarScope: matches,
                    contextType: kind, readMenuBar: { () -> Int? in
                        events.append("read")
                        return present ? 7 : nil
                    }, append: { value in
                        checkEqual(value, 7)
                        events.append("append")
                    })
                let expected = !matches ? [] :
                    (present && kind.includesMenuBar ? ["read", "append"] : ["read"])
                checkEqual(events, expected)
            }
        }
    }
    let rootAX = AXUIElementCreateApplication(2147480006)
    let itemAX = AXUIElementCreateApplication(2147480007)
    let debugAX = AXUIElementCreateApplication(2147480008)
    let role = UIElementAttribute("AXRole"), title = UIElementAttribute("AXTitle")
    func partial(_ raw: AnyObject) -> AXPartialValue {
        .init(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    let root = UIElement(axElement: rootAX, cache: .init(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
    func item(_ ax: AXUIElement, _ text: String) -> MenuBarItemUIElement {
        .init(axElement: ax, cache: .init(supportedAttributes: [title],
            attributes: [title: partial(text as NSString)], transactionAttributes: nil))
    }
    let transaction = UIElementTreeTransaction(element: root,
        cache: .init(attributeTable: [rootAX: [role: partial("AXMenuBar" as NSString)],
            itemAX: [role: partial("AXMenuBarItem" as NSString), title: partial("fresh File" as NSString)]],
            requestedAttributes: [role, title], fallbackElements: UIElementFallbackCache(initialState: [:])),
        roleFrequencyTable: FrequencyTable<UIElementRole>())
    transaction.perform { _ in
        var context = UIElementTransformationContext(type: .fullUIContext, application: nil, window: nil, urlConfiguration: nil)
        var tree = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        tree.addMenuBarWithImmediateItems(root, items: [item(rootAX, "Apple"), item(itemAX, "File"), item(debugAX, "Debug")],
            context: &context, reportError: { _ in }, reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkEqual(tree.items.count, 1)
        checkEqual(tree.items[0].element.id, rootAX)
        checkEqual(tree.items[0].children.map { $0.element.id }, [itemAX])
        checkEqual(tree.items[0].children[0].element.title, "fresh File")
        checkTrue(tree.items[0].children[0].children.isEmpty)
        checkTrue(tree.items[0].availableSubset == nil && tree.items[0].children[0].availableSubset == nil)
        let typed = MenuBarUIElement(axElement: rootAX, cache: .init(supportedAttributes: [UIElementAttribute("AXChildren")],
            attributes: [UIElementAttribute("AXChildren"): partial([itemAX, itemAX] as NSArray)], transactionAttributes: nil))
        checkEqual(typed.itemsValue(reportError: { _ in unexpectedFailure() }).map { $0.id }, [itemAX, itemAX])
        var typedTree = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        typedTree.addMenuBarWithImmediateItems(typed, context: &context, reportError: { _ in },
            reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkEqual(typedTree.items[0].children.map { $0.element.id }, [itemAX])
        let empty = MenuBarUIElement(axElement: rootAX, cache: .init(supportedAttributes: [],
            attributes: [UIElementAttribute("AXChildren"): partial([] as NSArray)], transactionAttributes: nil))
        checkTrue(empty.itemsValue(reportError: { _ in unexpectedFailure() }).isEmpty)
        let menuAttribute = UIElementAttribute("AXMenuBar")
        let application = ApplicationUIElement(axElement: rootAX,
            cache: .init(supportedAttributes: [menuAttribute], attributes: [menuAttribute: partial(rootAX)], transactionAttributes: nil))
        let decoded = application.menuBarValue(reportError: { _ in unexpectedFailure() })!
        checkEqual(decoded.axElement, rootAX)
        checkEqual(decoded.cache.attributes[role]?.value.value as? NSString, "AXMenuBar" as NSString)
        var extractedMenu = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        extractedMenu.addSelectionExtractionMenuBar(root: root, application: application,
            context: &context, contextType: .fullUIContext, reportError: { _ in },
            reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkEqual(extractedMenu.items.map { $0.element.id }, [rootAX])
        let freshExtraction = buildSelectionExtractionTrees(root: root, application: application,
            resolvedFocus: nil, cachedTree: nil, alwaysIncludeScreenshot: false, contextType: .fullUIContext, context: &context,
            reportMissingFocus: { _ in unexpectedFailure() },
            reportSelectionResolutionFailure: { unexpectedFailure() }, reportDepthLimit: { unexpectedFailure() },
            reportLimit: { _ in unexpectedFailure() }, reportError: { _ in },
            reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkEqual(freshExtraction.tree.items.map { $0.element.id }, [rootAX, rootAX])
        checkTrue(freshExtraction.focusTree == nil)
        checkTrue(freshExtraction.screenshotNeededForContext)
        let reusedExtraction = buildSelectionExtractionTrees(root: root, application: application,
            resolvedFocus: nil, cachedTree: extractedMenu, alwaysIncludeScreenshot: false, contextType: .fullUIContext, context: &context,
            reportMissingFocus: { _ in unexpectedFailure() },
            reportSelectionResolutionFailure: { unexpectedFailure() }, reportDepthLimit: { unexpectedFailure() },
            reportLimit: { _ in unexpectedFailure() }, reportError: { _ in },
            reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkEqual(reusedExtraction.tree.items.count, 2)
        checkEqual(extractedMenu.items.count, 1)
        var excludedMenu = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
        let otherRoot = UIElement(axElement: itemAX, cache: root.cache)
        excludedMenu.addSelectionExtractionMenuBar(root: otherRoot, application: application,
            context: &context, contextType: .fullUIContext, reportError: { _ in unexpectedFailure() },
            reportUnknownDateComponents: { _ in unexpectedFailure() })
        checkTrue(excludedMenu.items.isEmpty)
        let unsupported = ApplicationUIElement(axElement: rootAX,
            cache: .init(supportedAttributes: [title], attributes: [:], transactionAttributes: nil))
        checkTrue(unsupported.menuBarValue(reportError: { _ in unexpectedFailure() }) == nil)
    }
}


private func runSelectionScreenshotChecks() {
    for text in ["https://docs.google.com/x", "https://DOCS.GOOGLE.CO.UK/", "https://sub.docs.google.com/"] {
        checkTrue(shouldUseFullSkyshot(for: URL(string: text)!))
    }
    for text in ["file:///tmp/docs.google.com", "https://notdocs.google.com/", "https://docs.google.com.evil1/",
        "https://docs.google.com-evil/", "https://google.com/docs.google.com", "https://docs.google./"] {
        checkTrue(!shouldUseFullSkyshot(for: URL(string: text)!))
    }
    func evaluate(bundle: String?, count: Int, imageSize: CGSize?, actions: [String]) -> Bool {
        selectionExtractionNeedsScreenshot(bundleIdentifier: { bundle }, elements: { Array(0..<count) },
            isImage: { $0 == 0 }, size: { _ in imageSize }, isSticker: { $0 == 1 },
            actionDescriptions: { _ in actions })
    }
    checkTrue(evaluate(bundle: nil, count: 9, imageSize: nil, actions: []))
    checkTrue(!evaluate(bundle: nil, count: 10, imageSize: nil, actions: []))
    for size in [CGSize(width: 100, height: 101), CGSize(width: 101, height: 100),
        CGSize(width: CGFloat.nan, height: 101), CGSize(width: 101, height: CGFloat.nan)] {
        checkTrue(!evaluate(bundle: nil, count: 10, imageSize: size, actions: []))
    }
    checkTrue(evaluate(bundle: nil, count: 10, imageSize: .init(width: 101, height: 101), actions: []))
    for actions in [["Quick Look"], ["Add to Photos Library"], ["Quick Look", "Quick Look"]] {
        checkTrue(evaluate(bundle: "com.apple.MobileSMS", count: 10, imageSize: nil, actions: actions))
        checkTrue(!evaluate(bundle: nil, count: 10, imageSize: nil, actions: actions))
    }
    checkTrue(!evaluate(bundle: "com.apple.MobileSMS", count: 10, imageSize: nil, actions: ["quick look"]))
    let excluded = selectionExtractionNeedsScreenshot(bundleIdentifier: { "com.openai.sky.app" },
        elements: { () -> [Int] in unexpectedFailure() }, isImage: { _ in unexpectedFailure() },
        size: { _ in unexpectedFailure() }, isSticker: { _ in unexpectedFailure() },
        actionDescriptions: { _ in unexpectedFailure() })
    checkTrue(!excluded)
    checkTrue(selectionExtractionScreenshotNeededForContext(alwaysIncludeScreenshot: true,
        needsScreenshot: { unexpectedFailure() }))
    for decision in [false, true] {
        var calls = 0
        checkEqual(selectionExtractionScreenshotNeededForContext(alwaysIncludeScreenshot: false,
            needsScreenshot: { calls += 1; return decision }), decision)
        checkEqual(calls, 1)
    }
    var reads = 0
    let changed = selectionExtractionNeedsScreenshot(bundleIdentifier: {
        reads += 1; return reads == 1 ? nil : "com.apple.MobileSMS"
    }, elements: { Array(0..<10) }, isImage: { _ in false }, size: { _ in unexpectedFailure() },
        isSticker: { $0 == 0 }, actionDescriptions: { _ in ["Quick Look"] })
    checkTrue(changed && reads == 2)
}

private func runSelectionWebAreaURLChecks(source: TransformedUIElement) {
    let first = URL(string: "https://first.example/")!
    let later = URL(string: "https://later.example/")!
    var nonWeb = source; nonWeb.role = .button; nonWeb.url = later
    var emptyWeb = source; emptyWeb.role = .webArea; emptyWeb.url = nil
    var web = emptyWeb; web.url = first
    var lastWeb = web; lastWeb.url = later
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let tree = UIElementTree<TransformedUIElement>(items: [
        .init(element: nonWeb, subtree: .init(items: [
            .init(element: emptyWeb, subtree: leaf), .init(element: web, subtree: leaf)
        ], focusedElement: nil)), .init(element: lastWeb, subtree: leaf)
    ], focusedElement: lastWeb)
    checkEqual(selectionExtractionWebAreaURL(tree: tree), first)
    checkTrue(selectionExtractionWebAreaURL(tree: .init(items: [
        .init(element: nonWeb, subtree: leaf), .init(element: emptyWeb, subtree: leaf)
    ], focusedElement: lastWeb)) == nil)
    checkTrue(selectionExtractionWebAreaURL(tree: leaf) == nil)
}


private func runExtractionTreeTransformationChecks(source: TransformedUIElement) throws {
    try runSelectionObservedNodeChecks(source: source)
    let url = URL(string: "https://captured.example/")!
    let tree = UIElementTree<TransformedUIElement>(items: [
        .init(element: source, subtree: .init(items: [], focusedElement: nil))
    ], focusedElement: nil)
    let captured = SelectionExtractionTrees(tree: tree, focusTree: tree,
        screenshotNeededForContext: true, webAreaURL: url)
    var context = UIElementTransformationContext(type: .fullUIContext,
        application: nil, window: nil, urlConfiguration: nil)
    var total = 0, calls = 0
    let result = transformSelectionExtractionTrees(captured, context: &context, totalLength: &total) { tree, ctx in
        calls += 1
        checkEqual(ctx.isChromium, calls == 2)
        ctx.isChromium = true
        var tree = tree
        var items = tree.items
        items[0].element.title = "pass \(calls)"
        tree.items = items
        return tree
    }
    checkEqual(calls, 2)
    checkEqual(result.tree.items[0].element.title, "pass 1")
    checkEqual(result.focusTree?.items[0].element.title, "pass 2")
    checkTrue(result.screenshotNeededForContext)
    checkEqual(result.webAreaURL, url)
    checkEqual(captured.tree.items[0].element.title, source.title)
    let info = try makeSelectionAccessibilityInfo(trees: result, previousRevision: nil,
        isAXTreeDiffingEnabled: true, context: &context)
    checkTrue(!info.copyMenuItemIsEnabled && info.screenshotNeededForContext)
    checkEqual(info.webAreaURL, url)
    checkEqual(info.contextType, .fullUIContext)
    checkEqual(info.windowRevision.tree.items[0].element.title, "pass 1")
    let next = try makeSelectionAccessibilityInfo(trees: result, previousRevision: info.windowRevision,
        isAXTreeDiffingEnabled: true, context: &context)
    checkTrue(next.windowRevision.previousRevision === info.windowRevision)
    let reset = try makeSelectionAccessibilityInfo(trees: result, previousRevision: next.windowRevision,
        isAXTreeDiffingEnabled: false, context: &context)
    checkTrue(reset.windowRevision.previousRevision == nil)
    enum Failure: Error { case transform }
    calls = 0
    do {
        _ = try transformSelectionExtractionTrees(captured, context: &context, totalLength: &total) { _, _ in
            calls += 1
            throw Failure.transform
        }
        unexpectedFailure()
    } catch Failure.transform {}
    checkEqual(calls, 1)
}

@MainActor
private func runNativeRefetchBindingChecks() async throws {
    let suite = "core.cua.cursor-gate.check.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    checkTrue(NativeCursorFeatureGate.isEnabled(defaults: defaults))
    let summaryKey = "feature/axTreeDiffingRemovedElementIDRanges"
    checkTrue(NativeDescriptionFeatureGate.summarizesRemovedElementIDs(defaults: defaults))
    defaults.set(false, forKey: summaryKey)
    checkFalse(NativeDescriptionFeatureGate.summarizesRemovedElementIDs(defaults: defaults))
    defaults.set(true, forKey: summaryKey)
    checkTrue(NativeDescriptionFeatureGate.summarizesRemovedElementIDs(defaults: defaults))
    defaults.set("false", forKey: summaryKey)
    checkTrue(NativeDescriptionFeatureGate.summarizesRemovedElementIDs(defaults: defaults))
    defaults.set(false, forKey: "feature/computerUseCursor")
    checkFalse(NativeCursorFeatureGate.isEnabled(defaults: defaults))
    defaults.set(true, forKey: "feature/computerUseCursor")
    checkTrue(NativeCursorFeatureGate.isEnabled(defaults: defaults))
    defaults.set("false", forKey: "feature/computerUseCursor")
    checkTrue(NativeCursorFeatureGate.isEnabled(defaults: defaults))
    let unobserved = Target(.current)
    do {
        _ = try await unobserved.prepareToInteract(with: 0,
            cursorNextInteractionTiming: nil, positionElement: true, animateCursor: true,
            cursorFeatureEnabled: { unexpectedFailure() }, reportError: { _ in unexpectedFailure() })
        unexpectedFailure()
    } catch let error as Failure { checkEqual(error.code, "STALE_OBSERVATION") }
    checkTrue(unobserved.focusEnforcer == nil && unobserved.virtualCursor == nil)
    let ax = AXUIElementCreateApplication(2147480009)
    let cache = UIElementCache(supportedAttributes: [UIElementAttribute("AXTitle")],
        attributes: [:], transactionAttributes: nil)
    let app = ApplicationUIElement(axElement: ax, cache: cache)
    let window = WindowUIElement(axElement: ax, cache: cache)
    let owner = ApplicationWindow(cgWindow: NativeWindowDescription([kCGWindowNumber as String: UInt32(31)]),
        axWindow: window, axApplication: app)
    let revision = try UIElementTreeRevision<TransformedUIElement>.root(
        .init(items: [], focusedElement: nil), focusTree: nil, lineageID: "native-binding") { _ in
            UIElementRenderTree(isFocus: false, roots: [])
        }
    let tree = try RefetchableSkyshotAXTree(systemSelection: .init(applicationWindow: owner,
        windowRevision: revision, invalidationMonitor: nil), isAXTreeDiffingEnabled: true)
    do {
        _ = try tree.refetchTree(reportMissingFocus: { _ in unexpectedFailure() },
            reportSelectionResolutionFailure: { unexpectedFailure() }, reportDepthLimit: { unexpectedFailure() },
            reportLimit: { _ in unexpectedFailure() }, reportError: { _ in unexpectedFailure() },
            reportUnknownDateComponents: { _ in unexpectedFailure() },
            reportUnknownAttributedStyle: { _ in unexpectedFailure() }, reportUnexpectedNextLine: { unexpectedFailure() })
        unexpectedFailure()
    } catch FocusedUIElementContext.Error.noWindowsAvailable {}
    checkTrue(tree.systemSelection.windowRevision === revision)
    checkTrue(tree.applicationWindow === owner)
    do {
        _ = try tree.refetchTree()
        unexpectedFailure()
    } catch FocusedUIElementContext.Error.noWindowsAvailable {}
    do {
        _ = try tree.refetchElementIfNeeded(42, validateElement: true)
        unexpectedFailure()
    } catch RefetchableSkyshotAXTree.Error.invalidElementID(let id) { checkEqual(id, 42) }
    do {
        _ = try tree.refetchElementIfNeeded(app, validateElement: true, ignoreValueChange: false)
        unexpectedFailure()
    } catch RefetchableSkyshotAXTree.Error.noInvalidationMonitorProvided {}
    let wrapper = RefetchableUIElement(element: app, containingTree: tree)
    do {
        try wrapper.refetchIfNeeded(validateElement: true, ignoreValueChange: false)
        unexpectedFailure()
    } catch RefetchableSkyshotAXTree.Error.noInvalidationMonitorProvided {}
    checkEqual(wrapper.element.axElement, app.axElement)
    let protocolWrapper: any UIElementProtocol = wrapper
    checkEqual(protocolWrapper.id, ax)
    checkTrue(RefetchableUIElement.role == nil)
    let sameAX = RefetchableUIElement(element: app, containingTree: tree)
    checkTrue(wrapper == sameAX)
    checkEqual(wrapper.hashValue, sameAX.hashValue)
    var writes = 0
    let writer = RefetchableWriteProbe(axElement: ax, cache: cache) { value, attribute in
        checkEqual(value as? String, "replacement")
        checkEqual(attribute, UIElementAttribute("AXValue"))
        writes += 1
    }
    let writingWrapper: any UIElementProtocol = RefetchableUIElement(element: writer, containingTree: tree)
    do {
        try writingWrapper.setValue("replacement", forAttribute: UIElementAttribute("AXValue"))
        unexpectedFailure()
    } catch RefetchableSkyshotAXTree.Error.noInvalidationMonitorProvided {}
    checkEqual(writes, 1) // Successful write is not rolled back after refresh error.
    let offActor = await Task.detached { () -> (Bool, String) in
        let onMain = Thread.isMainThread
        do {
            try writingWrapper.setValue("replacement", forAttribute: UIElementAttribute("AXValue"))
            return (onMain, "unexpected-success")
        } catch let error as Failure { return (onMain, error.code) }
        catch { return (onMain, "unexpected-error") }
    }.value
    checkFalse(offActor.0)
    checkEqual(offActor.1, "INVALID_STATE")
    checkEqual(writes, 1) // The rejected host call must not touch the writer.
    enum WriteFailure: Error { case rejected }
    let rejecting = RefetchableWriteProbe(axElement: ax, cache: cache) { _, _ in throw WriteFailure.rejected }
    let rejectingWrapper: any UIElementProtocol = RefetchableUIElement(element: rejecting, containingTree: tree)
    do {
        try rejectingWrapper.setValue("replacement", forAttribute: UIElementAttribute("AXValue"))
        unexpectedFailure()
    } catch WriteFailure.rejected {}
    checkTrue(tree.systemSelection.windowRevision === revision)
    checkTrue(tree.applicationWindow === owner)
}

private func runObservedNodeLookupChecks() {
    let zero = AXUIElementCreateApplication(2147480010)
    let sparse = AXUIElementCreateApplication(2147480011)
    let nodes = [Node(element: sparse, data: ["id": 42, "parentId": 0]),
        Node(element: zero, data: ["id": 0])]
    checkEqual(observedNode(for: 0, in: nodes)?.element, zero)
    checkEqual(observedNode(for: 42, in: nodes)?.element, sparse)
    for id in [-1, 1, 2, 41, Int.max] { checkTrue(observedNode(for: id, in: nodes) == nil) }
    checkTrue(observedNode(for: 0, in: []) == nil)
    let legacy = [Node(element: zero, data: ["id": 1]), Node(element: sparse, data: ["id": 2])]
    checkEqual(observedNode(for: 2, in: legacy)?.element, sparse)
}


private func runSelectionObservedNodeChecks(source: TransformedUIElement) throws {
    var child = source
    child.element = UIElement(axElement: AXUIElementCreateApplication(2147480012), cache: source.cache)
    child.subrole = "AXSecureTextField"; child.value = "private fixture value"; child.title = "child"
    var focus = source
    focus.element = UIElement(axElement: AXUIElementCreateApplication(2147480013), cache: source.cache)
    focus.title = "focus-only"; focus.value = nil
    let leaf = UIElementTree<TransformedUIElement>(items: [], focusedElement: nil)
    let full = UIElementTree<TransformedUIElement>(items: [
        .init(element: source, subtree: .init(items: [.init(element: child, subtree: leaf)], focusedElement: nil))
    ], focusedElement: nil)
    let focused = UIElementTree<TransformedUIElement>(items: [.init(element: focus, subtree: leaf)], focusedElement: nil)
    var context = UIElementTransformationContext(type: .fullUIContext,
        application: nil, window: nil, urlConfiguration: nil)
    let revision = try UIElementTreeRevision.root(full, focusTree: focused, lineageID: "projection") { tree in
        tree.render(with: &context) { element, _ in element.id == source.id ? "" : "visible" }
    }
    var frameReads = 0
    let nodes = try selectionObservedNodes(revision) { _ in
        frameReads += 1
        return CGRect(x: 1, y: 2, width: 3, height: 4)
    }
    checkEqual(nodes.count, 2)
    checkEqual(frameReads, 2)
    checkEqual(nodes[0].data["id"] as? Int, 0)
    checkEqual(nodes[0].element, child.id)
    checkTrue(nodes[0].data["value"] == nil && nodes[0].data["parentId"] == nil)
    checkEqual(nodes[1].element, focus.id)
    checkEqual(nodes[1].data["name"] as? String, "focus-only")
    checkTrue(nodes[1].data["frame"] != nil)
    for node in nodes {
        checkEqual(revision.item(for: node.data["id"] as! Int)?.element.id, node.element)
    }
}
