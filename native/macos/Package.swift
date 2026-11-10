// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "CuaHelper", platforms: [.macOS(.v14)],
    products: [.executable(name: "cua-helper", targets: ["CuaHelper"]),
        .library(name: "SoftLink", targets: ["SoftLink"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-atomics.git", exact: "1.3.1"),
        .package(url: "https://github.com/apple/swift-collections.git", exact: "1.6.0"),
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk.git", exact: "0.12.1"),
        .package(url: "https://github.com/apple/swift-algorithms.git", exact: "1.2.1"),
        .package(url: "https://github.com/JohnSundell/Ink.git", exact: "0.6.0"),
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.9.6"),
    ],
    targets: [
        .target(name: "SoftLink"),
        .target(name: "Animation"),
        .target(name: "SlimCore", dependencies: ["SystemSoftware"]),
        .target(name: "SystemSoftware", dependencies: ["SoftLink", "RunningProcess"]),
        .target(name: "AccessibilitySupport", dependencies: ["SystemSoftware"]),
        .target(name: "GraphicsSupport", dependencies: ["SoftLink"]),
        .target(name: "RunningProcess", publicHeadersPath: "include", cSettings: [.unsafeFlags(["-fobjc-arc"])], linkerSettings: [.linkedFramework("Carbon")]),
        .executableTarget(name: "CuaHelper", dependencies: [.product(name: "Atomics", package: "swift-atomics"), .product(name: "DequeModule", package: "swift-collections"), .product(name: "OrderedCollections", package: "swift-collections"), "SoftLink", "Animation", "GraphicsSupport", "SlimCore", "SystemSoftware", "AccessibilitySupport", .product(name: "MCP", package: "swift-sdk"), "RunningProcess", "Ink", "SwiftSoup", .product(name: "Algorithms", package: "swift-algorithms")], resources: [.process("Resources")]),
        .executableTarget(name: "CuaFixture"),
    ], swiftLanguageModes: [.v5]
)
