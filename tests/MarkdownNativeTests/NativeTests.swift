import XCTest
@testable import MarkdownNative

final class NativeTests: XCTestCase {
    var root: URL!
    var store: SettingsStore!
    var defaults: UserDefaults!
    var suite: String!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        suite = "MacDownTests." + UUID().uuidString
        defaults = UserDefaults(suiteName:suite)!; store = SettingsStore(defaults:defaults)
    }
    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName:suite)
        try FileManager.default.removeItem(at:root)
    }
    func testGlobalProjectFileSettingsPersistAndReset() throws {
        let file = root.appendingPathComponent("nested/file.md")
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        store.globalDialect = .commonmark
        try store.set(.github,scope:"project",file:file,root:root)
        try store.set(.gitlab,scope:"file",file:file,root:root)
        let reopened = SettingsStore(defaults:defaults)
        XCTAssertEqual(reopened.resolve(file:file).dialect,.gitlab)
        XCTAssertEqual(reopened.resolve(file:file).scope,"file")
        try reopened.set(nil,scope:"file",file:file,root:root)
        XCTAssertEqual(reopened.resolve(file:file).dialect,.github)
        try reopened.set(nil,scope:"project",file:file,root:root)
        XCTAssertEqual(reopened.resolve(file:file).dialect,.commonmark)
    }
    func testStandaloneOverrideDoesNotLeakToSiblingProject() throws {
        let file = root.appendingPathComponent("file.md")
        try store.set(.github,scope:"file",file:file,root:nil)
        XCTAssertEqual(SettingsStore(defaults:defaults).resolve(file:file).dialect,.github)
        XCTAssertEqual(store.resolve(file:root.appendingPathComponent("other.md")).dialect,.gitlab)
    }
    func testMalformedSettingsAreVisibleAndNeverOverwritten() throws {
        let config = root.appendingPathComponent(".macdown.json")
        let original = Data("{broken".utf8);try original.write(to:config)
        XCTAssertNotNil(store.resolve(file:root.appendingPathComponent("x.md")).warning)
        XCTAssertThrowsError(try store.set(.github,scope:"project",file:nil,root:root))
        XCTAssertEqual(try Data(contentsOf:config),original)
    }
    func testConfigRejectsInvalidDialectVersionAndEscapingPaths() throws {
        for json in ["{\"dialect\":\"unknown\"}","{\"version\":2}","{\"assetsDirectory\":\"../outside\"}","{\"files\":{\"../x.md\":\"gitlab\"}}"] {
            XCTAssertThrowsError(try JSONDecoder().decode(ProjectSettings.self,from:Data(json.utf8)))
        }
    }
    func testDraftsSurviveNewStoreAndRetainCRLFUnicode() throws {
        let draft = Draft(id:UUID().uuidString,source:"# 😀\r\n\r\nText\r\n")
        try DraftStore(directory:root).save(draft)
        XCTAssertEqual(try DraftStore(directory:root).load(),[draft])
        try DraftStore(directory:root).remove(draft.id)
        XCTAssertTrue(try DraftStore(directory:root).load().isEmpty)
    }
    func testRecoveredFileDetectsExternalChanges() throws {
        let file = root.appendingPathComponent("file.md"),bytes = Data("original\r\n".utf8)
        try bytes.write(to:file)
        let draft = Draft(id:UUID().uuidString,source:"modified",filePath:file.path,baselineHash:Draft.hash(bytes))
        XCTAssertFalse(draft.conflictsWithDisk())
        try Data("external".utf8).write(to:file)
        XCTAssertTrue(draft.conflictsWithDisk())
        try FileManager.default.removeItem(at:file)
        XCTAssertTrue(draft.conflictsWithDisk())
    }
    func testCorruptDraftIsPreservedAndReported() throws {
        let file = root.appendingPathComponent("corrupt.json")
        try Data("invalid".utf8).write(to:file)
        XCTAssertThrowsError(try DraftStore(directory:root).load())
        XCTAssertTrue(FileManager.default.fileExists(atPath:file.path))
        XCTAssertThrowsError(try DraftStore(directory:root).remove("../unsafe"))
    }
    func testAssetImportsAreRelativeCollisionSafeAndCannotEscape() throws {
        let bytes=Data([1,2,3])
        let a=try Assets.importImage(bytes,extension:"png",root:root)
        let b=try Assets.importImage(bytes,extension:"png",root:root)
        XCTAssertNotEqual(a,b);XCTAssertEqual(try Data(contentsOf:a),bytes)
        XCTAssertTrue(SettingsStore.relative(a,inside:root)!.hasPrefix("assets/"))
        XCTAssertThrowsError(try Assets.importImage(bytes,extension:"png",root:root,directory:"../outside"))
        XCTAssertThrowsError(try Assets.importImage(bytes,extension:"sh",root:root))
    }
    func testSymlinkAssetsCannotEscapeProject() throws {
        try FileManager.default.createSymbolicLink(at:root.appendingPathComponent("assets"),withDestinationURL:root.deletingLastPathComponent())
        XCTAssertThrowsError(try Assets.importImage(Data([1]),extension:"png",root:root))
    }
    func testProjectSearchReportsActualFileAndLine() throws {
        try Data("# Title\nNeedle appears\nother\n".utf8).write(to:root.appendingPathComponent("readme.md"))
        let results=ProjectFiles.search(root:root,query:"needle")
        XCTAssertEqual(results.count,1);XCTAssertEqual(results[0]["file"] as? String,"readme.md")
        XCTAssertEqual(results[0]["line"] as? Int,2)
        XCTAssertTrue(ProjectFiles.search(root:root,query:"").isEmpty)
    }
    func testGitLabRequestRequiresHTTPSAndSuppliesProjectContext() throws {
        let request=try GitLabRequest.make(instance:"https://gitlab.example",project:"group/project",token:"secret",source:"Text")
        XCTAssertEqual(request.url!.absoluteString,"https://gitlab.example/api/v4/markdown")
        XCTAssertEqual(request.httpMethod,"POST")
        XCTAssertEqual(request.value(forHTTPHeaderField:"PRIVATE-TOKEN"),"secret")
        let body=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:Any]
        XCTAssertEqual(body["project"] as? String,"group/project");XCTAssertEqual(body["gfm"] as? Bool,true)
        XCTAssertThrowsError(try GitLabRequest.make(instance:"http://gitlab.example",project:"",token:"secret",source:""))
        XCTAssertThrowsError(try GitLabRequest.make(instance:"https://user:pass@gitlab.example",project:"",token:"secret",source:""))
        XCTAssertThrowsError(try GitLabRequest.make(instance:"https://gitlab.example",project:"",token:"",source:""))
    }
    func testPaginationAvoidsSplittingTextLinesAndBoundsPageCount() {
        XCTAssertEqual(Pagination.breaks(height:250,pageHeight:100,avoid:[[95,110],[190,210]]),[0,95,190,250])
        XCTAssertEqual(Pagination.breaks(height:250,pageHeight:100,avoid:[[0,250]]),[0,100,200,250])
        XCTAssertEqual(Pagination.breaks(height:0,pageHeight:100,avoid:[]),[0])
    }
}
