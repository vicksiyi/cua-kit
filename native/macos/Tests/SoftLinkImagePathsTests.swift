@main struct SoftLinkImagePathsTests {
    static func main() {
        precondition(resolveImagePaths(name: "Test", strategy: "framework") == [
            "/System/Library/Frameworks/Test.framework/Test",
            "/System/Library/Frameworks/Test.framework/Versions/Current/Test",
            "/System/Library/Frameworks/Test.framework/Versions/A/Test",
            "/System/Library/Frameworks/Test.framework/Versions/B/Test",
            "/System/Library/Frameworks/Test.framework/Versions/C/Test"])
        precondition(resolveImagePaths(name: "Test", strategy: "privateFramework") == [
            "/System/Library/PrivateFrameworks/Test.framework/Test",
            "/System/Library/PrivateFrameworks/Test.framework/Versions/Current/Test",
            "/System/Library/PrivateFrameworks/Test.framework/Versions/A/Test",
            "/System/Library/PrivateFrameworks/Test.framework/Versions/B/Test",
            "/System/Library/PrivateFrameworks/Test.framework/Versions/C/Test"])
        precondition(resolveImagePaths(name: "Test", strategy: "unrecognized") == [
            "/System/Library/Frameworks/Test.framework/Versions/C/Test",
            "/System/Library/Frameworks/Test.framework/Versions/A/Test",
            "/System/Library/Frameworks/Test.framework/Versions/B/Test",
            "/System/Library/Frameworks/Test.framework/Versions/Current/Test"])
        precondition(resolveImagePaths(name: "libx.dylib", strategy: "library") == [
            "/usr/lib/libx.dylib", "/usr/lib/system/libx.dylib", "/usr/lib/system/liblibx.dylib.dylib"])
        for name in ["", "../a//b", "~user/path", "中文\0name"] {
            precondition(resolveImagePaths(name: name, strategy: "path") == [name])
        }
        precondition(resolveImagePaths(name: "", strategy: "framework").first == "/System/Library/Frameworks/.framework/")
        precondition(resolveImagePaths(name: "T", strategy: "Framework") == resolveImagePaths(name: "T", strategy: ""))
        print("SoftLink image path strategies and ordering passed")
    }
}
