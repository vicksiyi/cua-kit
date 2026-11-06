import Foundation
import CoreFoundation

/// Native policy response parsing recovered from 0x1000a90f4..<0x1000aa444.
/// Parsing a policy does not authorize an app or replace deployment policy.
struct NativeComputerUsePolicy: Sendable, Equatable {
    enum AppAccess: String, Sendable { case allow, deny }
    struct MacOS: Sendable, Equatable {
        let defaultAppAccess: AppAccess
        let bundleIDs: [String: AppAccess]
    }
    let allowComputerUse: Bool
    let allowPersistentApproval: Bool
    let macos: MacOS
    let configuredMacOS: MacOS

    // Host-local error representation; original throws a native JSON-RPC error.
    enum ParseError: Error { case invalidResponse }

    private static func dictionary(_ value: Any?) throws -> [String: Any] {
        guard let value, !(value is NSNull) else { return [:] }
        guard let dictionary = value as? [String: Any] else { throw ParseError.invalidResponse }
        return dictionary
    }

    private static func boolean(_ value: Any?) throws -> Bool {
        guard let value, !(value is NSNull) else { return true }
        // `as? Bool` alone can accept NSNumber(0/1); the source first checks
        // CFBoolean identity, then performs the Swift Bool cast.
        guard CFGetTypeID(value as AnyObject) == CFBooleanGetTypeID(),
              let boolean = value as? Bool else { throw ParseError.invalidResponse }
        return boolean
    }

    private static func macOS(defaultAccess: Any?, bundleIDs: Any?) throws -> MacOS {
        let access: AppAccess
        if let defaultAccess, !(defaultAccess is NSNull) {
            guard let text = defaultAccess as? String, let parsed = AppAccess(rawValue: text)
            else { throw ParseError.invalidResponse }
            access = parsed
        } else { access = .allow }
        let entries = try dictionary(bundleIDs)
        var rules: [String: AppAccess] = [:]
        for (identifier, value) in entries {
            guard let text = value as? String, let parsed = AppAccess(rawValue: text)
            else { throw ParseError.invalidResponse }
            rules[identifier] = parsed
        }
        return MacOS(defaultAppAccess: access, bundleIDs: rules)
    }

    static func parse(requirementsResponse: [String: Any],
                      configResponse: [String: Any]) throws -> Self {
        // The envelope requires the key, although its value may be NSNull.
        guard let rawRequirements = requirementsResponse["requirements"],
              let config = configResponse["config"] as? [String: Any]
        else { throw ParseError.invalidResponse }
        let requirements = try dictionary(rawRequirements)
        let requiredFeatures = try dictionary(requirements["featureRequirements"])
        let configuredFeatures = try dictionary(config["features"])
        let requiredComputerUse = try dictionary(requirements["computerUse"])
        let configuredComputerUse = try dictionary(config["computer_use"])
        let requiredMacOS = try dictionary(requiredComputerUse["macos"])
        let configuredMacOS = try dictionary(configuredComputerUse["macos"])
        // Parse all values before conjunction: malformed later fields must still
        // throw even when an earlier switch is false.
        let allowed = try boolean(requirements["allowBrowserAndComputerUse"])
        let requiredFeature = try boolean(requiredFeatures["computer_use"])
        let configuredFeature = try boolean(configuredFeatures["computer_use"])
        let persistent = try boolean(requiredComputerUse["allowPersistentApproval"])
        let macos = try macOS(defaultAccess: requiredComputerUse["defaultAppAccess"],
                             bundleIDs: requiredMacOS["bundleIds"])
        let configured = try macOS(defaultAccess: configuredComputerUse["default_app_access"],
                                  bundleIDs: configuredMacOS["bundle_ids"])
        return Self(allowComputerUse: allowed && requiredFeature && configuredFeature,
                    allowPersistentApproval: persistent, macos: macos, configuredMacOS: configured)
    }
}
