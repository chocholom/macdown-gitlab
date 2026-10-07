import Foundation

public enum Dialect: String, Codable, CaseIterable {
    case commonmark, github, gitlab
}

public struct ProjectSettings: Codable, Equatable {
    public var version: Int = 1
    public var dialect: Dialect? = nil
    public var files: [String: Dialect] = [:]
    public var assetsDirectory: String = "assets"
    public var gitlabInstance: String? = nil
    public var gitlabProject: String? = nil
    public init() {}

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 1
        guard version == 1 else { throw SettingsError.invalid("Unsupported settings version") }
        dialect = try c.decodeIfPresent(Dialect.self, forKey: .dialect)
        files = try c.decodeIfPresent([String: Dialect].self, forKey: .files) ?? [:]
        assetsDirectory = try c.decodeIfPresent(String.self, forKey: .assetsDirectory) ?? "assets"
        gitlabInstance = try c.decodeIfPresent(String.self, forKey: .gitlabInstance)
        gitlabProject = try c.decodeIfPresent(String.self, forKey: .gitlabProject)
        guard Self.validRelativePath(assetsDirectory), files.keys.allSatisfy(Self.validRelativePath) else {
            throw SettingsError.invalid("Settings paths must stay inside the project")
        }
    }

    public static func validRelativePath(_ path: String) -> Bool {
        !path.isEmpty && !path.hasPrefix("/") && !path.split(separator: "/").contains("..")
    }
}

public enum SettingsError: LocalizedError {
    case invalid(String)
    public var errorDescription: String? { switch self { case .invalid(let message): return message } }
}

public struct ResolvedSettings: Equatable {
    public let dialect: Dialect
    public let scope: String
    public let root: URL?
    public let project: ProjectSettings
    public let warning: String?
}

public final class SettingsStore {
    public let defaults: UserDefaults
    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    public var globalDialect: Dialect {
        get { Dialect(rawValue: defaults.string(forKey: "MarkdownDialect") ?? "") ?? .gitlab }
        set { defaults.set(newValue.rawValue, forKey: "MarkdownDialect") }
    }
    public var fileOverrides: [String: String] {
        get { defaults.dictionary(forKey: "MarkdownFileDialects") as? [String: String] ?? [:] }
        set { defaults.set(newValue, forKey: "MarkdownFileDialects") }
    }

    public func findRoot(for file: URL?) -> URL? {
        guard var dir = file?.deletingLastPathComponent().resolvingSymlinksInPath() else { return nil }
        while true {
            if FileManager.default.fileExists(atPath: dir.appendingPathComponent(".macdown.json").path) { return dir }
            if dir.path == "/" { return nil }
            let parent = dir.deletingLastPathComponent().standardizedFileURL
            if parent.path == dir.path { return nil }
            dir = parent
        }
    }

    public func resolve(file: URL?, projectRoot: URL? = nil) -> ResolvedSettings {
        let root = projectRoot?.resolvingSymlinksInPath() ?? findRoot(for: file)
        var project = ProjectSettings(), warning: String?
        if let root {
            let config = root.appendingPathComponent(".macdown.json")
            if FileManager.default.fileExists(atPath: config.path) {
                do { project = try JSONDecoder().decode(ProjectSettings.self, from: Data(contentsOf: config)) }
                catch { warning = "Cannot read .macdown.json: \(error.localizedDescription)" }
            }
        }
        if let file, let root, let relative = Self.relative(file, inside: root), let override = project.files[relative] {
            return .init(dialect: override, scope: "file", root: root, project: project, warning: warning)
        }
        if let file, let override = fileOverrides[file.standardizedFileURL.path], let dialect = Dialect(rawValue: override) {
            return .init(dialect: dialect, scope: "file", root: root, project: project, warning: warning)
        }
        return .init(dialect: project.dialect ?? globalDialect,
                     scope: project.dialect == nil ? "global" : "project",
                     root: root, project: project, warning: warning)
    }

    public func set(_ dialect: Dialect?, scope: String, file: URL?, root: URL?) throws {
        if scope == "global" { if let dialect { globalDialect = dialect }; return }
        if let root, scope == "project" || (scope == "file" && file.flatMap({ Self.relative($0, inside: root) }) != nil) {
            let resolved = resolve(file: file, projectRoot: root)
            if let warning = resolved.warning { throw SettingsError.invalid(warning) }
            var config = resolved.project
            if scope == "project" { config.dialect = dialect }
            else if let file, let relative = Self.relative(file, inside: root) { config.files[relative] = dialect }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(config).write(to: root.appendingPathComponent(".macdown.json"), options: .atomic)
        } else if scope == "file", let file {
            var overrides = fileOverrides
            overrides[file.standardizedFileURL.path] = dialect?.rawValue
            fileOverrides = overrides
        } else { throw SettingsError.invalid("Save the file or choose a project first") }
    }

    public static func relative(_ file: URL, inside root: URL) -> String? {
        let path = file.resolvingSymlinksInPath().standardizedFileURL.path
        let prefix = root.resolvingSymlinksInPath().standardizedFileURL.path + "/"
        guard path.hasPrefix(prefix) else { return nil }
        return String(path.dropFirst(prefix.count))
    }
}
