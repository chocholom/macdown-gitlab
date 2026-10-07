import AppKit
import WebKit
import MarkdownNative
import Darwin

extension EditorController {
    @MainActor func javascript(_ code: String) async throws -> Any? {
        try await withCheckedThrowingContinuation { continuation in
            web.evaluateJavaScript(code) { value,error in
                if let error { continuation.resume(throwing:error) }
                else { continuation.resume(returning:value) }
            }
        }
    }
    @MainActor func runSmoke(directory: URL) async {
        var checks=[String]()
        func verify(_ condition: Bool,_ label: String) throws {
            if !condition { throw SettingsError.invalid("Native smoke failed: " + label) }
            checks.append(label)
        }
        do {
            try await Task.sleep(nanoseconds:200_000_000)
            let original=documentModel.source
            try verify(editorResources.bundleURL.path.hasPrefix(Bundle.main.bundleURL.path),"application loads resources from its own relocatable bundle")
            let title=try await javascript("document.querySelector('#preview h1').textContent") as? String
            try verify(title == "Native smoke","WKWebView loaded bundled editor and rendered Markdown")
            writeDocument(forcePanel:false)
            try verify(try Data(contentsOf:documentModel.fileURL!) == Data(original.utf8),"no-op native save preserves CRLF bytes")
            _=try await javascript("document.querySelector('[data-mode=visual]').click();var p=document.querySelector('#visual p[contenteditable=true]');p.focus();p.textContent='Changed paragraph';p.dispatchEvent(new Event('input',{bubbles:true}));window.editor.flush();")
            try await Task.sleep(nanoseconds:100_000_000)
            let expected=original.replacingOccurrences(of:"Editable paragraph",with:"Changed paragraph")
            try verify(documentModel.source == expected,"visual edit travels through native bridge and preserves other source")
            persistDraft()
            try verify(try appOwner.drafts.load().contains(where:{$0.source == expected}),"modified file draft survives independent storage read")
            writeDocument(forcePanel:false)
            try verify(try Data(contentsOf:documentModel.fileURL!) == Data(expected.utf8),"native edited save round-trips exactly")
            try verify(try appOwner.drafts.load().allSatisfy({$0.id != documentModel.id}),"saving removes recovered draft")
            let fresh=MarkdownDocument();try fresh.read(from:documentModel.fileURL!,ofType:"net.daringfireball.markdown")
            try verify(fresh.source == expected,"fresh native document reopens saved Markdown")
            _=try await javascript("""
                var readingFixture='# Reading navigation 😀\\r\\n\\r\\n'+Array.from({length:40},(_,i)=>'## Part '+i+'\\r\\n\\r\\n'+('A wrapped paragraph with different source and rendered heights. '.repeat(10))+'\\r\\n\\r\\n').join('');
                window.editor.load({source:readingFixture,dialect:'gitlab',scope:'global',filename:'Navigation.md',files:[],localFiles:[]});
                document.querySelector('[data-mode=split]').click();
                var readingSource=document.querySelector('#source'),readingStyle=getComputedStyle(readingSource);
                var readingLine=readingSource.value.slice(0,readingSource.value.indexOf('## Part 15\\n')).split('\\n').length-1;
                readingSource.scrollTop=parseFloat(readingStyle.paddingTop)+(readingLine+.5)*parseFloat(readingStyle.lineHeight)-readingSource.clientHeight/2;
                """)
            try await Task.sleep(nanoseconds:150_000_000)
            let sourceFollow=try await javascript("var targetRect=document.querySelector('#preview #part-15').getBoundingClientRect(),paneRect=document.querySelector('#preview-pane').getBoundingClientRect();Math.abs((targetRect.top+targetRect.bottom-paneRect.top-paneRect.bottom)/2)<3") as? Bool
            try verify(sourceFollow == true,"WKWebView linked scrolling follows the source centre")
            _=try await javascript("var readingPane=document.querySelector('#preview-pane'),targetRect=document.querySelector('#preview #part-28').getBoundingClientRect(),paneRect=readingPane.getBoundingClientRect();readingPane.scrollTop+=(targetRect.top+targetRect.bottom-paneRect.top-paneRect.bottom)/2;")
            try await Task.sleep(nanoseconds:150_000_000)
            let previewFollow=try await javascript("var readingLine=readingSource.value.slice(0,readingSource.value.indexOf('## Part 28\\n')).split('\\n').length-.5;Math.abs((readingSource.scrollTop+readingSource.clientHeight/2-parseFloat(readingStyle.paddingTop))/parseFloat(readingStyle.lineHeight)-readingLine)<.1") as? Bool
            try verify(previewFollow == true,"WKWebView linked scrolling follows the rendered centre")
            _=try await javascript("document.querySelector('[data-mode=visual]').click();document.querySelector('#visual #part-28').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:350}));document.querySelector('#navigation-action').click();")
            let contextualJump=try await javascript("readingSource.selectionStart===readingSource.value.indexOf('## Part 28\\n') && window.editor.snapshot().source===readingFixture") as? Bool
            try verify(contextualJump == true,"WKWebView visual context action selects source without changing Markdown")
            evaluate("load",state())
            try await Task.sleep(nanoseconds:100_000_000)
            root=directory
            try appOwner.settings.set(.commonmark,scope:"project",file:documentModel.fileURL,root:root)
            try appOwner.settings.set(.gitlab,scope:"file",file:documentModel.fileURL,root:root)
            try verify(appOwner.settings.resolve(file:documentModel.fileURL).dialect == .gitlab,"project and file settings persist with correct precedence")
            evaluate("settings",state())
            _=try await javascript("document.querySelector('[data-mode=split]').click();var s=document.querySelector('#source');s.focus();s.setSelectionRange(s.value.length,s.value.length);s.dispatchEvent(new Event('select'));")
            let png=Data(base64Encoded:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ0kAAAAASUVORK5CYII=")!
            try insertImage(png,ext:"png")
            try await Task.sleep(nanoseconds:200_000_000)
            try verify(documentModel.source.contains("assets/image-"),"image import creates a relative Markdown link")
            let imageStatus=try await javascript("var img=document.querySelector('#preview img');JSON.stringify({src:img?.src,complete:img?.complete,width:img?.naturalWidth,html:document.querySelector('#preview').innerHTML})") as? String
            try imageStatus?.write(to:directory.appendingPathComponent("image-status.json"),atomically:true,encoding:.utf8)
            var imageLoaded=false
            for _ in 0..<25 {
                imageLoaded=(try await javascript("Boolean(document.querySelector('#preview img')?.complete && document.querySelector('#preview img')?.naturalWidth===1)") as? Bool) == true
                if imageLoaded { break };try await Task.sleep(nanoseconds:200_000_000)
            }
            try verify(imageLoaded,"local image is served through restricted WKWebView scheme")
            let html=try await javascript("window.editor.exportHTML()") as! String
            let prepared=try preparedExport(html)
            try verify(prepared.contains("data:image/png;base64,"),"standalone HTML embeds local image bytes")
            try verify(prepared.contains("data:font/woff2;base64,"),"standalone HTML embeds math fonts")
            try Data(prepared.utf8).write(to:directory.appendingPathComponent("export.html"))
            let pdf=directory.appendingPathComponent("export.pdf")
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void,Error>) in
                writeExport(html:html,to:pdf,pdf:true) { error in
                    if let error { continuation.resume(throwing:error) } else { continuation.resume() }
                }
            }
            try verify(try Data(contentsOf:pdf).starts(with:Data("%PDF".utf8)),"native PDF export produces a valid PDF")
            let longHTML="<html><head><style>body{font:14pt/1.6 system-ui}p{margin:0 0 20px}@page{margin:20mm}</style></head><body>"+(1...80).map{"<p>Acceptance paragraph \($0). A longer document must paginate without losing any text.</p>"}.joined()+"</body></html>"
            let longPDF=directory.appendingPathComponent("multipage.pdf")
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void,Error>) in
                writeExport(html:longHTML,to:longPDF,pdf:true) { error in
                    if let error { continuation.resume(throwing:error) } else { continuation.resume() }
                }
            }
            let pdfBytes=try Data(contentsOf:longPDF)
            let provider=CGDataProvider(data:pdfBytes as CFData)!
            let pages=CGPDFDocument(provider)!.numberOfPages
            try verify(pages>1 && pages<30 && pdfBytes.count<5_000_000,"long PDF has bounded A4 pagination")
            try Data("External change\n".utf8).write(to:documentModel.fileURL!)
            let draft=Draft(id:documentModel.id,source:documentModel.source,filePath:documentModel.fileURL!.path,baselineHash:documentModel.baselineHash)
            try verify(draft.conflictsWithDisk(),"recovery detects an externally modified file")
            writeDocument(forcePanel:false)
            try verify(try String(contentsOf:documentModel.fileURL!,encoding:.utf8)=="External change\n","save does not overwrite external changes")
            let image=try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<NSImage,Error>) in
                web.takeSnapshot(with:nil) { image,error in
                    if let image { continuation.resume(returning:image) }
                    else { continuation.resume(throwing:error ?? SettingsError.invalid("No window snapshot")) }
                }
            }
            if let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) {
                try png.write(to:directory.appendingPathComponent("native-window.png"))
            }
            let unsaved=Draft(id:UUID().uuidString,source:"# Recovered new draft\r\n\r\nNever saved 😀\r\n")
            try appOwner.drafts.save(unsaved)
            try unsaved.id.write(to:directory.appendingPathComponent("recovery-id.txt"),atomically:true,encoding:.utf8)
            let report:[String:Any]=["passed":true,"checks":checks,"architecture":"arm64","engine":"WKWebView"]
            try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:directory.appendingPathComponent("native-smoke.json"))
        } catch {
            let report:[String:Any]=["passed":false,"checks":checks,"error":error.localizedDescription]
            try? JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:directory.appendingPathComponent("native-smoke.json"))
        }
        fileTimer?.invalidate()
        // Abrupt exit deliberately bypasses NSDocument's quit UI. Drafts were
        // already persisted; the next process must recover them after a crash.
        Darwin.exit(0)
    }
    @MainActor func runRecoverySmoke(directory: URL) async {
        do {
            try await Task.sleep(nanoseconds:200_000_000)
            let title=try await javascript("document.querySelector('#preview h1').textContent") as? String
            guard documentModel.fileURL == nil,
                  documentModel.source == "# Recovered new draft\r\n\r\nNever saved 😀\r\n",
                  title == "Recovered new draft" else { throw SettingsError.invalid("New draft was not restored in the second app process") }
            let report:[String:Any]=["passed":true,"checks":["never-saved draft restored in a second native app process","CRLF and Unicode preserved on recovery","recovered draft rendered in WKWebView"]]
            try JSONSerialization.data(withJSONObject:report,options:.prettyPrinted).write(to:directory.appendingPathComponent("recovery-smoke.json"))
        } catch {
            let report:[String:Any]=["passed":false,"error":error.localizedDescription]
            try? JSONSerialization.data(withJSONObject:report,options:.prettyPrinted).write(to:directory.appendingPathComponent("recovery-smoke.json"))
        }
        Darwin.exit(0)
    }
}
