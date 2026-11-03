// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "CuaHelper", platforms: [.macOS(.v14)], products: [.executable(name: "cua-helper", targets: ["CuaHelper"])], targets: [.executableTarget(name: "CuaHelper"), .executableTarget(name: "CuaFixture")], swiftLanguageModes: [.v5])
