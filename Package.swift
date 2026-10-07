// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MacDownGitLab",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "MacDownGitLab", targets: ["MacDownGitLab"])],
    targets: [
        .target(name: "MarkdownNative", path: "Sources/MarkdownNative"),
        .executableTarget(name: "MacDownGitLab", dependencies: ["MarkdownNative"],
                          path: "Sources/MacDownGitLab",
                          resources: [.copy("Web")]),
        .testTarget(name: "MarkdownNativeTests", dependencies: ["MarkdownNative"],
                    path: "Tests/MarkdownNativeTests")
    ]
)
