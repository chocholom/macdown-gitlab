import AppKit
import WebKit
import UniformTypeIdentifiers
import MarkdownNative

let editorResources: Bundle = {
    if let url = Bundle.main.resourceURL?.appendingPathComponent("MacDownGitLab_MacDownGitLab.bundle"),
       let bundle = Bundle(url:url) { return bundle }
    return Bundle.module
}()

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

final class AppDelegate: NSObject, NSApplicationDelegate {
    lazy var settings: SettingsStore = {
        if smokeDirectory != nil { return SettingsStore(defaults:UserDefaults(suiteName:"MacDownGitLab.Acceptance")!) }
        return SettingsStore()
    }()
    var drafts: DraftStore!
    var controllers = [EditorController]()
    var smokeDirectory: URL?
    var recoveryTest=false

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            if let index=CommandLine.arguments.firstIndex(of:"--recovery-test"),index+1<CommandLine.arguments.count {
                let directory=URL(fileURLWithPath:CommandLine.arguments[index+1])
                smokeDirectory=directory;recoveryTest=true
                drafts=try DraftStore(directory:directory.appendingPathComponent("drafts"));makeMenu()
                let id=try String(contentsOf:directory.appendingPathComponent("recovery-id.txt"),encoding:.utf8)
                guard let draft=try drafts.load().first(where:{$0.id==id}) else { throw SettingsError.invalid("Recovery test draft not found") }
                let doc=MarkdownDocument();doc.id=draft.id;doc.source=draft.source
                show(doc);doc.updateChangeCount(.changeDone);return
            }
            if let index = CommandLine.arguments.firstIndex(of:"--smoke-test"), index+1 < CommandLine.arguments.count {
                let dir=URL(fileURLWithPath:CommandLine.arguments[index+1])
                try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
                smokeDirectory=dir; drafts=try DraftStore(directory:dir.appendingPathComponent("drafts"))
                makeMenu()
                let source="# Native smoke\r\n\r\nEditable paragraph\r\n\r\n[ref]: ./README.md\r\n\r\n<custom>preserved</custom>\r\n"
                let file=dir.appendingPathComponent("document.md");try Data(source.utf8).write(to:file)
                open(file);return
            }
            let storage = ProcessInfo.processInfo.environment["MACDOWN_DATA_DIR"].map { URL(fileURLWithPath: $0) } ??
                FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                    .appendingPathComponent("MacDownGitLab/Drafts")
            drafts = try DraftStore(directory: storage)
            makeMenu()
            for draft in try drafts.load() {
                let doc = MarkdownDocument()
                doc.id = draft.id; doc.source = draft.source; doc.baselineHash = draft.baselineHash
                if let path = draft.filePath { doc.fileURL = URL(fileURLWithPath: path) }
                if draft.conflictsWithDisk() {
                    doc.recoveryWarning = "The file changed outside the editor. This recovered draft opens as an untitled copy to protect the current file."
                    doc.fileURL = nil
                }
                show(doc)
                doc.updateChangeCount(.changeDone)
            }
            let arguments = CommandLine.arguments.dropFirst().filter { !$0.hasPrefix("-") }
            for path in arguments where FileManager.default.fileExists(atPath: path) { open(URL(fileURLWithPath: path)) }
            if controllers.isEmpty { newDocument(nil) }
            app.activate(ignoringOtherApps: true)
        } catch { present(error); newDocument(nil) }
    }

    func makeMenu() {
        let main = NSMenu()
        func menu(_ title: String, _ items: [(String, Selector?, String, AnyObject?)]) {
            let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let submenu = NSMenu(title: title)
            for (name, action, key, target) in items {
                let item = NSMenuItem(title: name, action: action, keyEquivalent: key); item.target = target
                submenu.addItem(item)
            }
            parent.submenu = submenu; main.addItem(parent)
        }
        menu("MacDown GitLab", [("About MacDown GitLab",#selector(about),"",self),
            ("Quit MacDown GitLab",#selector(quit(_:)),"q",self)])
        menu("File", [("New",#selector(newDocument(_:)),"n",self), ("Open…",#selector(openDocument(_:)),"o",self),
            ("Save",#selector(EditorController.save(_:)),"s",nil),
            ("Save As…",#selector(EditorController.saveAs(_:)),"S",nil),
            ("Choose Project…",#selector(EditorController.chooseProject(_:)),"",nil),
            ("Export HTML…",#selector(EditorController.exportHTMLAction(_:)),"",nil),
            ("Export PDF…",#selector(EditorController.exportPDFAction(_:)),"",nil),
            ("Close",#selector(NSWindow.performClose(_:)),"w",nil)])
        menu("Edit", [("Undo",#selector(EditorController.undo(_:)),"z",nil),
            ("Redo",#selector(EditorController.redo(_:)),"Z",nil),
            ("Cut",#selector(NSText.cut(_:)),"x",nil),("Copy",#selector(NSText.copy(_:)),"c",nil),
            ("Paste",#selector(NSText.paste(_:)),"v",nil),("Select All",#selector(NSText.selectAll(_:)),"a",nil),
            ("Find",#selector(EditorController.find(_:)),"f",nil)])
        menu("Window", [("Minimize",#selector(NSWindow.performMiniaturize(_:)),"m",nil),
            ("Zoom",#selector(NSWindow.performZoom(_:)),"",nil)])
        app.mainMenu = main
        app.windowsMenu = main.items.last?.submenu
    }

    @objc func about() {
        let alert = NSAlert(); alert.messageText = "MacDown GitLab"
        alert.informativeText = "Free native Markdown editing with CommonMark, GitHub and GitLab profiles.\nBased on the MacDown 3000 source and assets.\nMIT licence; third-party licences in the source repository."
        alert.runModal()
    }
    @objc func newDocument(_ sender: Any?) { show(MarkdownDocument()) }
    @objc func openDocument(_ sender: Any?) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.plainText, .text]
        if panel.runModal() == .OK { panel.urls.forEach { open($0) } }
    }
    func open(_ url: URL, line: Int? = nil, anchor: String? = nil) {
        if let existing = controllers.first(where: { $0.documentModel.fileURL == url }) {
            existing.showWindow(nil);if let line { existing.evaluate("jumpLine",line) };if let anchor { existing.evaluate("jumpAnchor",anchor) };return
        }
        do {
            let doc = MarkdownDocument(); try doc.read(from: url, ofType: "net.daringfireball.markdown")
            doc.fileURL = url; show(doc)
            controllers.last?.pendingLine=line;controllers.last?.pendingAnchor=anchor
        } catch { present(error) }
    }
    func show(_ document: MarkdownDocument) {
        NSDocumentController.shared.addDocument(document)
        let controller = EditorController(document: document, owner: self)
        controllers.append(controller); document.addWindowController(controller); controller.showWindow(nil)
    }
    func application(_ sender: NSApplication, openFiles filenames: [String]) { filenames.forEach { open(URL(fileURLWithPath: $0)) }; app.reply(toOpenOrPrint: .success) }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        controllers.forEach { $0.persistDraft();$0.documentModel.updateChangeCount(.changeCleared) }
        return .terminateNow
    }
    @objc func quit(_ sender: Any?) {
        let group=DispatchGroup()
        for controller in controllers {
            group.enter();controller.flush { controller.persistDraft();controller.documentModel.updateChangeCount(.changeCleared);group.leave() }
        }
        group.notify(queue:.main) { app.terminate(nil) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func present(_ error: Error) { NSAlert(error: error).runModal() }
}

final class MarkdownDocument: NSDocument {
    var source = ""
    var id = UUID().uuidString
    var baselineHash: String?
    var recoveryWarning: String?
    override class var autosavesInPlace: Bool { false }
    override func data(ofType typeName: String) throws -> Data { Data(source.utf8) }
    override func read(from url: URL, ofType typeName: String) throws {
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { throw SettingsError.invalid("This file is not UTF-8 Markdown") }
        source = text; baselineHash = Draft.hash(data)
    }
    override func writableTypes(for saveOperation: NSDocument.SaveOperationType) -> [String] { ["net.daringfireball.markdown"] }
}

final class EditorController: NSWindowController, WKScriptMessageHandler, WKNavigationDelegate, WKURLSchemeHandler, NSWindowDelegate {
    let documentModel: MarkdownDocument
    unowned let appOwner: AppDelegate
    var web: WKWebView!
    var root: URL?
    var timer: Timer?
    var ready = false
    var exportWeb: WKWebView?
    var exportCompletion: (() -> Void)?
    var pendingLine: Int?
    var pendingAnchor: String?
    var fileTimer: Timer?

    init(document: MarkdownDocument, owner: AppDelegate) {
        documentModel = document; self.appOwner = owner
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 820),
            styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        super.init(window: window)
        window.title = document.displayName; window.minSize = NSSize(width: 760,height: 500)
        window.center(); window.delegate = self
        let config = WKWebViewConfiguration()
        if owner.smokeDirectory != nil { config.websiteDataStore = .nonPersistent() }
        config.userContentController.add(self, name: "native")
        config.setURLSchemeHandler(self, forURLScheme: "mdasset")
        web = WKWebView(frame: window.contentView!.bounds, configuration: config)
        web.autoresizingMask = [.width,.height]; web.navigationDelegate = self
        window.contentView = web
        if let url = editorResources.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        fileTimer=Timer.scheduledTimer(withTimeInterval:1,repeats:true) { [weak self] _ in self?.checkExternalFile() }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func evaluate(_ name: String, _ value: Any? = nil) {
        let args: String
        if let value, let data = try? JSONSerialization.data(withJSONObject: [value]), let json = String(data: data, encoding: .utf8) {
            args = String(json.dropFirst().dropLast())
        } else { args = "" }
        web.evaluateJavaScript("window.editor.\(name)(\(args))") { _,error in
            if let error { NSLog("Editor command failed: %@", error.localizedDescription) }
        }
    }
    func state() -> [String: Any] {
        let resolved = appOwner.settings.resolve(file: documentModel.fileURL, projectRoot: root)
        root = resolved.root
        let files = root.map { ProjectFiles.list(root: $0) } ?? []
        var relativeFiles = files
        if let file = documentModel.fileURL, let root {
            let dir = file.deletingLastPathComponent()
            relativeFiles = files.map { relativePath(from: dir, to: root.appendingPathComponent($0)) }
        }
        return ["source":documentModel.source, "dialect":resolved.dialect.rawValue,
            "scope":resolved.scope,"files":files,"localFiles":relativeFiles,
            "filename":documentModel.fileURL?.lastPathComponent ?? "Untitled.md",
            "modified":documentModel.isDocumentEdited,
            "project":root?.lastPathComponent ?? "No project",
            "warning":[resolved.warning,documentModel.recoveryWarning].compactMap{$0}.joined(separator:"\n"),
            "assetBase":assetBase(),"gitlabInstance":resolved.project.gitlabInstance ?? "https://gitlab.com",
            "gitlabProject":resolved.project.gitlabProject ?? ""]
    }
    func assetBase() -> String {
        guard let root, let file = documentModel.fileURL,
              let relative = SettingsStore.relative(file, inside: root) else { return "mdasset://project/" }
        let dir = (relative as NSString).deletingLastPathComponent
        return "mdasset://project/" + (dir.isEmpty ? "" : dir + "/")
    }
    func relativePath(from base: URL, to target: URL) -> String {
        let a = base.standardizedFileURL.pathComponents, b = target.standardizedFileURL.pathComponents
        var common = 0
        while common < min(a.count,b.count) && a[common] == b[common] { common += 1 }
        return (Array(repeating:"..",count:a.count-common) + b.dropFirst(common)).joined(separator:"/")
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let data = message.body as? [String:Any], let action = data["action"] as? String else { return }
        do {
            switch action {
            case "ready":
                ready = true; evaluate("load",state())
                if let line=pendingLine { evaluate("jumpLine",line);pendingLine=nil }
                if let anchor=pendingAnchor { evaluate("jumpAnchor",anchor);pendingAnchor=nil }
                if let directory=appOwner.smokeDirectory {
                    Task { if self.appOwner.recoveryTest { await runRecoverySmoke(directory:directory) }
                        else { await runSmoke(directory:directory) } }
                }
            case "change":
                if let source = data["source"] as? String, source != documentModel.source {
                    documentModel.source = source
                    let unchanged=documentModel.baselineHash == Draft.hash(Data(source.utf8))
                    documentModel.updateChangeCount(unchanged ? .changeCleared : .changeDone)
                    window?.isDocumentEdited = !unchanged
                    if unchanged { try appOwner.drafts.remove(documentModel.id) } else { persistDraft() }
                }
            case "save": save(nil)
            case "new": appOwner.newDocument(nil)
            case "open": appOwner.openDocument(nil)
            case "chooseProject": chooseProject(nil)
            case "dialect":
                let scope = data["scope"] as? String ?? "file"
                let value = data["dialect"] as? String ?? ""
                if !value.isEmpty && Dialect(rawValue: value) == nil { throw SettingsError.invalid("Unknown Markdown flavour") }
                try appOwner.settings.set(Dialect(rawValue:value),scope:scope,file:documentModel.fileURL,root:root)
                appOwner.controllers.forEach { if $0.ready { $0.evaluate("settings",$0.state()) } }
            case "openFile":
                guard let root, let path = data["path"] as? String,
                      let _ = SettingsStore.relative(root.appendingPathComponent(path),inside:root) else { throw SettingsError.invalid("File is outside this project") }
                appOwner.open(root.appendingPathComponent(path),line:data["line"] as? Int)
            case "openLink":
                guard let base=documentModel.fileURL?.deletingLastPathComponent() ?? root,
                      let path=data["path"] as? String else { throw SettingsError.invalid("Save the document before opening relative links") }
                let file=base.appendingPathComponent(path.removingPercentEncoding ?? path).standardizedFileURL
                guard SettingsStore.relative(file,inside:root ?? base) != nil else { throw SettingsError.invalid("Link target is outside the project") }
                appOwner.open(file,anchor:data["anchor"] as? String)
            case "projectSearch":
                if let root { evaluate("projectResults",ProjectFiles.search(root:root,query:data["query"] as? String ?? "")) }
            case "importImage": importImage()
            case "pasteImage": pasteImage()
            case "exportHTML": exportHTMLAction(nil)
            case "exportPDF": exportPDFAction(nil)
            case "remotePreview": remotePreview(data)
            default: break
            }
        } catch { evaluate("error",error.localizedDescription) }
    }
    func persistDraft() {
        guard documentModel.isDocumentEdited || (documentModel.fileURL == nil && !documentModel.source.isEmpty) else { return }
        do { try appOwner.drafts.save(.init(id:documentModel.id,source:documentModel.source,
                 filePath:documentModel.fileURL?.path,baselineHash:documentModel.baselineHash)) }
        catch { if ready { evaluate("error","Draft recovery could not be saved: " + error.localizedDescription) } }
    }
    func flush(_ completion: @escaping () -> Void) {
        web.evaluateJavaScript("window.editor.flush()") { _,_ in completion() }
    }
    func checkExternalFile() {
        guard ready, let file=documentModel.fileURL,let baseline=documentModel.baselineHash,
              let bytes=try? Data(contentsOf:file), Draft.hash(bytes) != baseline else { return }
        if documentModel.isDocumentEdited {
            if documentModel.recoveryWarning == nil {
                documentModel.recoveryWarning="This file changed outside the editor. Save As preserves both versions."
                evaluate("settings",state())
            }
        } else if let text=String(data:bytes,encoding:.utf8) {
            documentModel.source=text;documentModel.baselineHash=Draft.hash(bytes)
            evaluate("load",state());evaluate("notice","Reloaded changes made outside the editor")
        }
    }
    @objc func save(_ sender: Any?) { flush { self.writeDocument(forcePanel:false) } }
    @objc func saveAs(_ sender: Any?) { flush { self.writeDocument(forcePanel:true) } }
    func writeDocument(forcePanel: Bool) {
        var destination = documentModel.fileURL
        if forcePanel || destination == nil {
            let panel = NSSavePanel(); panel.nameFieldStringValue = documentModel.fileURL?.lastPathComponent ?? "Untitled.md"
            panel.allowedContentTypes = [.plainText]; panel.canCreateDirectories = true
            if panel.runModal() != .OK { return }; destination = panel.url
        }
        guard let destination else { return }
        do {
            if !forcePanel, let current = documentModel.fileURL, destination == current,
               let baseline = documentModel.baselineHash {
                guard let data=try? Data(contentsOf:current),Draft.hash(data)==baseline else {
                    throw SettingsError.invalid("The file changed outside the editor. Use Save As to preserve both versions.")
                }
            }
            let bytes = Data(documentModel.source.utf8)
            try bytes.write(to:destination,options:.atomic)
            documentModel.fileURL = destination; documentModel.baselineHash = Draft.hash(bytes)
            documentModel.updateChangeCount(.changeCleared); window?.isDocumentEdited = false
            window?.title = destination.lastPathComponent
            try appOwner.drafts.remove(documentModel.id)
            evaluate("settings",state()); evaluate("notice","Saved " + destination.lastPathComponent)
            evaluate("markSaved")
        } catch { evaluate("error",error.localizedDescription) }
    }
    @objc func chooseProject(_ sender: Any?) {
        let panel = NSOpenPanel(); panel.canChooseFiles = false; panel.canChooseDirectories = true
        if panel.runModal() == .OK { root = panel.url; evaluate("settings",state()) }
    }
    @objc func undo(_ sender: Any?) { evaluate("undo") }
    @objc func redo(_ sender: Any?) { evaluate("redo") }
    @objc func find(_ sender: Any?) { evaluate("find") }

    func imageRoot() throws -> (URL,String) {
        let resolved = appOwner.settings.resolve(file:documentModel.fileURL,projectRoot:root)
        guard let base = root ?? documentModel.fileURL?.deletingLastPathComponent() else { throw SettingsError.invalid("Save this document or choose a project before adding images") }
        return (base,resolved.project.assetsDirectory)
    }
    func insertImage(_ data: Data, ext: String, alt: String = "") throws {
        let (base,folder) = try imageRoot()
        let image = try Assets.importImage(data,extension:ext,root:base,directory:folder)
        if root == nil { root = base }
        let path = relativePath(from:documentModel.fileURL?.deletingLastPathComponent() ?? base,to:image)
        evaluate("settings",state()); evaluate("insertImage",["path":path,"alt":alt])
    }
    func imageDescription() -> String? {
        let alert=NSAlert();alert.messageText="Describe the image"
        alert.informativeText="Alt text helps readers using screen readers and appears when an image cannot load."
        let field=NSTextField(frame:NSRect(x:0,y:0,width:340,height:24))
        field.placeholderString="Image description (optional)";alert.accessoryView=field
        alert.addButton(withTitle:"Insert image");alert.addButton(withTitle:"Cancel")
        return alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil
    }
    func importImage() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.image]
        if panel.runModal() == .OK, let url = panel.url {
            guard let alt=imageDescription() else { return }
            do { try insertImage(Data(contentsOf:url),ext:url.pathExtension,alt:alt) } catch { evaluate("error",error.localizedDescription) }
        }
    }
    func pasteImage() {
        guard let data = NSPasteboard.general.data(forType:.png) ?? NSPasteboard.general.data(forType:.tiff),
              let rep = NSBitmapImageRep(data:data), let png = rep.representation(using:.png,properties:[:]) else { evaluate("error","No image on the clipboard"); return }
        guard let alt=imageDescription() else { return }
        do { try insertImage(png,ext:"png",alt:alt) } catch { evaluate("error",error.localizedDescription) }
    }
    @objc func exportHTMLAction(_ sender: Any?) { exportDocument(pdf:false) }
    @objc func exportPDFAction(_ sender: Any?) { exportDocument(pdf:true) }
    func exportDocument(pdf: Bool) {
        flush {
            self.web.callAsyncJavaScript("return await window.editor.prepareExport()",arguments:[:],in:nil,in:.page) { result in
                guard case .success(let value)=result,let html=value as? String else {
                    if case .failure(let error)=result { self.evaluate("error",error.localizedDescription) };return
                }
                let panel = NSSavePanel(); panel.allowedContentTypes = pdf ? [.pdf] : [.html]
                panel.nameFieldStringValue = (self.documentModel.displayName as NSString).deletingPathExtension + (pdf ? ".pdf" : ".html")
                guard panel.runModal() == .OK, let url = panel.url else { return }
                self.writeExport(html:html,to:url,pdf:pdf)
            }
        }
    }
    func preparedExport(_ html: String) throws -> String {
        var result=html
        let pattern="src=\"(mdasset://[^\"]+)\""
        let regex=try NSRegularExpression(pattern:pattern)
        for match in regex.matches(in:result,range:NSRange(result.startIndex...,in:result)).reversed() {
            let ns=result as NSString
            guard let imageURL=URL(string:ns.substring(with:match.range(at:1))),
                  let base=root ?? documentModel.fileURL?.deletingLastPathComponent() else { continue }
            let image=base.appendingPathComponent(String(imageURL.path.dropFirst())).resolvingSymlinksInPath()
            guard SettingsStore.relative(image,inside:base) != nil else { throw SettingsError.invalid("Export image escapes the project") }
            let bytes=try Data(contentsOf:image)
            let mime=UTType(filenameExtension:image.pathExtension)?.preferredMIMEType ?? "image/png"
            result=(result as NSString).replacingCharacters(in:match.range,with:"src=\"data:\(mime);base64,\(bytes.base64EncodedString())\"")
        }
        if let cssURL=editorResources.url(forResource:"katex.min",withExtension:"css",subdirectory:"Web/katex") {
            var css=try String(contentsOf:cssURL,encoding:.utf8)
            let fonts=try NSRegularExpression(pattern:"url\\((fonts/[^)]+)\\)")
            for match in fonts.matches(in:css,range:NSRange(css.startIndex...,in:css)).reversed() {
                let path=(css as NSString).substring(with:match.range(at:1))
                let url=cssURL.deletingLastPathComponent().appendingPathComponent(path)
                if let bytes=try? Data(contentsOf:url) {
                    css=(css as NSString).replacingCharacters(in:match.range,with:"url(data:font/\(url.pathExtension);base64,\(bytes.base64EncodedString()))")
                }
            }
            result=result.replacingOccurrences(of:"</head>",with:"<style>\(css)</style></head>")
        }
        return result
    }
    func writeExport(html: String,to url: URL,pdf: Bool,completion: ((Error?) -> Void)? = nil) {
        do {
            let html=try preparedExport(html)
            if pdf {
                let regex=try NSRegularExpression(pattern:"@page\\{margin:([0-9.]+)mm")
                let match=regex.firstMatch(in:html,range:NSRange(html.startIndex...,in:html))
                let marginMM=match.flatMap{Double((html as NSString).substring(with:$0.range(at:1)))} ?? 20
                let margin=marginMM*72/25.4,scale=0.75
                let width=(595.28-2*margin)/scale
                let view=WKWebView(frame:NSRect(x:0,y:0,width:width,height:1123))
                exportWeb=view;view.navigationDelegate=self
                exportCompletion={
                    let script="""
                    (()=>{let avoid=[];let w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(w.nextNode()){let r=document.createRange();r.selectNodeContents(w.currentNode);for(let b of r.getClientRects())avoid.push([b.top+scrollY,b.bottom+scrollY]);}for(let e of document.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,img,svg,tr')){let b=e.getBoundingClientRect();avoid.push([b.top+scrollY,b.bottom+scrollY]);}return {height:Math.max(1,document.body.getBoundingClientRect().bottom+scrollY),avoid};})()
                    """
                    view.evaluateJavaScript(script) { value,error in
                        guard let layout=value as? [String:Any],let height=layout["height"] as? Double,height<1_000_000 else {
                            completion?(error ?? SettingsError.invalid("Document is too large for PDF export"));return
                        }
                        self.capturePDF(view,to:url,width:width,height:height,margin:margin,
                            avoid:layout["avoid"] as? [[Double]] ?? [],completion:completion)
                    }
                }
                let pdfHTML=html.replacingOccurrences(of:"</head>",with:"<style>body{margin:0!important;padding:0!important;max-width:none!important}</style></head>")
                view.loadHTMLString(pdfHTML,baseURL:nil)
            } else {
                try Data(html.utf8).write(to:url,options:.atomic)
                evaluate("notice","HTML exported");completion?(nil)
            }
        } catch { evaluate("error",error.localizedDescription);completion?(error) }
    }
    func capturePDF(_ view: WKWebView,to url: URL,width: Double,height: Double,
                    margin: Double,avoid: [[Double]],completion: ((Error?) -> Void)?) {
        let scale=0.75
        let pageWidth=595.28,pageHeight=841.89
        let breaks=Pagination.breaks(height:height,pageHeight:(pageHeight-2*margin)/scale,avoid:avoid)
        var media=CGRect(x:0,y:0,width:pageWidth,height:pageHeight)
        guard let context=CGContext(url as CFURL,mediaBox:&media,nil) else {
            completion?(SettingsError.invalid("Cannot create PDF destination"));return
        }
        func finish(_ error: Error?) {
            context.closePDF();self.exportWeb=nil;self.exportCompletion=nil
            if let error { self.evaluate("error",error.localizedDescription) } else { self.evaluate("notice","PDF exported") }
            completion?(error)
        }
        func capture(_ index: Int) {
            if index >= breaks.count-1 { finish(nil);return }
            let start=breaks[index],length=breaks[index+1]-start
            let config=WKPDFConfiguration();config.rect=NSRect(x:0,y:start,width:width,height:length)
            view.createPDF(configuration:config) { result in
                do {
                    let bytes=try result.get()
                    if let directory=self.appOwner.smokeDirectory {
                        try bytes.write(to:directory.appendingPathComponent("capture-\(index+1).pdf"))
                    }
                    guard let provider=CGDataProvider(data:bytes as CFData),let document=CGPDFDocument(provider),
                          let page=document.page(at:1) else { throw SettingsError.invalid("WebKit returned an invalid PDF") }
                    let bounds=page.getBoxRect(.mediaBox)
                    context.beginPDFPage(nil);context.saveGState()
                    context.translateBy(x:margin-bounds.minX*scale,y:pageHeight-margin-bounds.height*scale-bounds.minY*scale)
                    context.scaleBy(x:scale,y:scale);context.drawPDFPage(page)
                    context.restoreGState();context.endPDFPage();capture(index+1)
                } catch { finish(error) }
            }
        }
        capture(0)
    }
    func remotePreview(_ data: [String:Any]) {
        // The token is collected in a native secure field and kept only for this request.
        let alert = NSAlert(); alert.messageText = "Render this document on GitLab?"
        let instance = data["instance"] as? String ?? ""
        alert.informativeText = "Send the current Markdown to \(instance). Enter an access token. The token is not stored."
        let field = NSSecureTextField(frame:NSRect(x:0,y:0,width:320,height:24))
        field.placeholderString = "GitLab access token"; alert.accessoryView = field
        alert.addButton(withTitle:"Render on GitLab"); alert.addButton(withTitle:"Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        do {
            let request = try GitLabRequest.make(instance:instance,project:data["project"] as? String ?? "",token:field.stringValue,source:documentModel.source)
            let session=URLSession(configuration:.ephemeral,delegate:NoRedirect(),delegateQueue:nil)
            session.dataTask(with:request) { bytes,response,error in
                session.finishTasksAndInvalidate()
                DispatchQueue.main.async {
                    if let error { self.evaluate("error",error.localizedDescription); return }
                    guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
                          let bytes, let object = try? JSONSerialization.jsonObject(with:bytes) as? [String:Any], let html = object["html"] as? String else {
                        self.evaluate("error","GitLab did not return rendered HTML. Check instance, token, project and permissions."); return
                    }
                    self.evaluate("remoteHTML",html)
                }
            }.resume()
        } catch { evaluate("error",error.localizedDescription) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === exportWeb { exportCompletion?() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.navigationType == .linkActivated {
            if ["https","http","mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel); return
        }
        decisionHandler(url.isFileURL || url.scheme == "about" ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            guard let root = root ?? documentModel.fileURL?.deletingLastPathComponent(),
                  let url = urlSchemeTask.request.url else { throw SettingsError.invalid("No image project") }
            let relative = String(url.path.dropFirst())
            let file = root.appendingPathComponent(relative).resolvingSymlinksInPath()
            guard SettingsStore.relative(file,inside:root) != nil,
                  ["png","jpg","jpeg","gif","webp","svg","heic"].contains(file.pathExtension.lowercased()) else { throw SettingsError.invalid("Image is outside the project") }
            let data = try Data(contentsOf:file)
            let type = UTType(filenameExtension:file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            urlSchemeTask.didReceive(URLResponse(url:url,mimeType:type,expectedContentLength:data.count,textEncodingName:nil))
            urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if documentModel.isDocumentEdited {
            persistDraft()
            let alert = NSAlert(); alert.messageText = "Close this document?"
            alert.informativeText = "Keep a recoverable draft, discard your changes, or continue editing."
            alert.addButton(withTitle:"Keep Draft"); alert.addButton(withTitle:"Discard Changes"); alert.addButton(withTitle:"Cancel")
            let choice = alert.runModal()
            if choice == .alertThirdButtonReturn { return false }
            if choice == .alertSecondButtonReturn {
                do { try appOwner.drafts.remove(documentModel.id) } catch { appOwner.present(error); return false }
            }
        }
        timer?.invalidate();fileTimer?.invalidate(); web.configuration.userContentController.removeScriptMessageHandler(forName:"native")
        appOwner.controllers.removeAll { $0 === self }
        NSDocumentController.shared.removeDocument(documentModel)
        documentModel.removeWindowController(self)
        return true
    }
}
