import Foundation
import CryptoKit

public struct Draft: Codable, Equatable {
    public let id: String
    public let source: String
    public let filePath: String?
    public let baselineHash: String?
    public let updated: Date
    public init(id: String, source: String, filePath: String? = nil, baselineHash: String? = nil) {
        self.id = id; self.source = source; self.filePath = filePath
        self.baselineHash = baselineHash; self.updated = Date()
    }
    public func conflictsWithDisk() -> Bool {
        guard let path = filePath else { return false }
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return true }
        return Self.hash(data) != baselineHash
    }
    public static func hash(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

public final class DraftStore {
    public let directory: URL
    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    private func url(_ id: String) throws -> URL {
        guard UUID(uuidString: id) != nil else { throw SettingsError.invalid("Invalid draft identifier") }
        return directory.appendingPathComponent(id + ".json")
    }
    public func save(_ draft: Draft) throws {
        try JSONEncoder().encode(draft).write(to: url(draft.id), options: .atomic)
    }
    public func remove(_ id: String) throws {
        let file = try url(id)
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }
    public func load() throws -> [Draft] {
        // Never delete a corrupt draft as a side effect of opening the app.
        try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .map { try JSONDecoder().decode(Draft.self, from: Data(contentsOf: $0)) }
            .sorted { $0.updated < $1.updated }
    }
}

public enum Assets {
    public static func importImage(_ data: Data, extension ext: String, root: URL,
                                   directory: String = "assets") throws -> URL {
        guard ProjectSettings.validRelativePath(directory), ["png","jpg","jpeg","gif","webp","svg","heic"].contains(ext.lowercased()) else {
            throw SettingsError.invalid("Invalid image type or asset directory")
        }
        let folder = root.appendingPathComponent(directory).resolvingSymlinksInPath()
        guard SettingsStore.relative(folder, inside: root) != nil else { throw SettingsError.invalid("Asset directory escapes the project") }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("image-" + UUID().uuidString.lowercased() + "." + ext.lowercased())
        try data.write(to: file, options: .atomic)
        return file
    }
}

public enum ProjectFiles {
    public static func list(root: URL, limit: Int = 5000) -> [String] {
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { return [] }
        var results = [String]()
        while let file = enumerator.nextObject() as? URL {
            if ["node_modules", "Pods", "dist", "build"].contains(file.lastPathComponent) { enumerator.skipDescendants(); continue }
            if (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true,
               let relative = SettingsStore.relative(file, inside: root) { results.append(relative) }
            if results.count >= limit { break }
        }
        return results.sorted()
    }
    public static func search(root: URL, query: String) -> [[String: Any]] {
        guard !query.isEmpty else { return [] }
        var results = [[String: Any]]()
        for path in list(root: root) where ["md","markdown","mdown","txt"].contains(URL(fileURLWithPath: path).pathExtension.lowercased()) {
            let url = root.appendingPathComponent(path)
            guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size < 2_000_000,
                  let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            for (i,line) in text.components(separatedBy: .newlines).enumerated() where line.localizedCaseInsensitiveContains(query) {
                results.append(["file":path,"line":i+1,"text":String(line.prefix(240))])
                if results.count >= 500 { return results }
            }
        }
        return results
    }
}

public struct GitLabRequest {
    public static func make(instance: String, project: String, token: String, source: String) throws -> URLRequest {
        guard let url = URL(string: instance), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
            throw SettingsError.invalid("GitLab instance must be an HTTPS URL without credentials, query or fragment")
        }
        guard !token.isEmpty else { throw SettingsError.invalid("Enter a GitLab access token") }
        let endpoint = url.appendingPathComponent("api/v4/markdown")
        var request = URLRequest(url: endpoint); request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue(token, forHTTPHeaderField: "PRIVATE-TOKEN")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text":source,"gfm":true,"project":project])
        return request
    }
}
