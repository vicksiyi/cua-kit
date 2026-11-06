// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "CuaHelper", platforms: [.macOS(.v14)],
    products: [.executable(name: "cua-helper", targets: ["CuaHelper"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-algorithms.git", exact: "1.2.1"),
        .package(url: "https://github.com/JohnSundell/Ink.git", exact: "0.6.0"),
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.9.6"),
    ],
    targets: [
        .executableTarget(name: "CuaHelper", dependencies: ["Ink", "SwiftSoup", .product(name: "Algorithms", package: "swift-algorithms")]),
        .executableTarget(name: "CuaFixture"),
    ], swiftLanguageModes: [.v5]
)
