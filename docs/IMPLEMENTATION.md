# Implementation plan and decisions

## Provenance

Imported schuyler/macdown3000 at
`962df74793d1d98a0ad9e85628f0a1d6c24769e2` on 2026-10-06. Preserve MIT and
third-party notices. Prism is vendored at the upstream pinned revision; the
import is a source snapshot (not a nested Git repository). User repository is
`/Users/mirek/git/macdown-gitlab`; the `upstream` checkout inside it is a
read-only reference after import and is locally excluded from Git status.

The user created `chocholom/macdown-gitlab` using GitHub's Fork flow. Its
`main` starts at the same upstream commit as the imported snapshot, so project
work can be committed directly on top of that shared history and pushed as a
fast-forward. The local remotes are `origin` (the user's fork) and `upstream`
(MacDown 3000).

## Stages

1. Record acceptance requirements and inspect build constraints.
2. Isolate dialect parsing, source maps, patches, formatting, diagnostics,
   search, tables and HTML export in a reusable JavaScript core.
3. Supply a native AppKit/WKWebView document host with settings, project/file
   access, safe persistence, recovery, assets, PDF and optional remote preview.
4. Build source/preview/visual UI on the same source model, with outline and
   context-aware formatting. Bundle all runtime libraries for offline use.
5. Test pure core, native persistence, browser interactions and actual app.
6. Audit R01–R22, fix gaps, record evidence and produce a runnable application.

## Architecture decision (2026-10-06)

Use a new Swift/AppKit executable target inside the imported repository, sharing
MacDown's workflow, resources and test corpus. The legacy target depends on
CocoaPods and old WebView/Hoedown; CocoaPods is not installed on this machine.
The feature set would replace its editing/rendering pipeline anyway. A separate
Swift Package target avoids changing the historical target and avoids installing
system Ruby tooling solely to build the new product. This is a departure from
adding features directly to MPDocument; it keeps the new core independently
testable and allows future upstream integration. Legacy sources/tests remain
available; passing new tests must not be reported as running legacy XCTest.

Parsing uses markdown-it's CommonMark preset plus explicit profile extensions.
HTML is sanitized before display/export; Mermaid and math are bundled locally.
Rendering assigns parser-derived line maps; visual edits replace supported block
ranges rather than converting a whole document through HTML. Settings and
recovery live in the host, not untrusted document scripts.

## Findings and additions (2026-10-07)

- A textarea normalizes CRLF; mapping its selection/input offsets to original
  source is necessary to preserve line endings during actual source edits, not
  only no-op saves. Added regression coverage for both editing modes.
- Ordinary HTML is parsed according to CommonMark, then sanitized for the view.
  This supports details/summary while preserving unsafe/unknown markup in source.
  Sanitization removes document scripts, event handlers, forms and styles.
- The full 652-example CommonMark 0.31.2 corpus is included with its own licence.
  Tests remove only app heading IDs/fence wrappers before comparing spec HTML.
- Exports embed local image bytes and math fonts and render diagrams as SVG.
  PDF uses bounded WebKit capture and Core Graphics pagination, preserving text
  lines, images and table rows at page boundaries. An acceptance run exposed a
  runaway offscreen native print operation; that approach was removed before
  delivery, and a bounded multipage regression was added.
- Added periodic external-file reload for clean documents and conflict protection
  for edited ones; writes never silently replace an externally changed baseline.
- Native acceptance tests run the built WKWebView app, not only Chromium. They
  produce JSON evidence, a screenshot, saved Markdown and exported HTML/PDF.
- Existing dependency advisories were fixed; Mermaid's transitive math renderer
  is pinned to the patched direct version. Runtime and third-party licence
  notices are bundled; no runtime dependency downloads are needed.
- The in-app Browser skill connection failed with a transport metadata error.
  Browser interactions are tested by the repository's Playwright suite instead.
- Legacy Objective-C/XCTest remains unmodified and is not counted in new coverage.
- The enhanced target requires macOS 14+ and Safari 17's WebKit capabilities,
  including modern regex support used by runtime libraries. This is explicit in
  both the Swift package and application bundle; the historical target retains
  its original OS requirements.
- Native acceptance now launches a second app process to verify never-saved
  draft restoration. Test runs use isolated directories and a dedicated
  preferences suite, preserving ordinary user settings and drafts.
- Targeted mutation checks demonstrate that tests catch loss of surrounding
  source, reversed setting precedence and unwanted CRLF normalization. CI
  enforces core coverage thresholds instead of relying on informal counts.

## Validation policy

Tests assert outcomes, including known nontrivial failure cases. Expected output
must not be generated from the implementation under test. Upstream snapshots
can preserve Hoedown bugs; use specification examples and separately reviewed
extension expectations. Report skipped/native/headless limitations honestly.
Keep CI commands identical to documented local commands. Update this file for
new decisions and VALIDATION.md with actual commands/results.

## Reading navigation (2026-10-07)

R22 adds explicit Show in preview / Show in source buttons and contextual actions
for source, rendered and visual blocks. Linked scrolling defaults on, with a
persistent opt-out. Match the source line at the viewport centre to parser-mapped
rendered blocks, interpolating within multiline blocks and between adjacent
blocks. Use nested mappings for lists/quotes; retain offsets in original UTF-16
source, including CRLF. Single-pane mode changes carry the reading anchor.

Programmatic scrolling must not feed back into the other pane or move focus or
the selection. Asynchronous image/diagram layout changes should realign the
follower. Server HTML has no reliable local source map, so disable mapped
navigation while displaying it and explain this in the controls. Validate long
documents with different source/rendered heights, code/tables, both directions,
opt-out, explicit navigation, mode changes and unchanged source. Rebuild the app
and run its WKWebView acceptance checks before replacing the delivery archive.

The graphical acceptance app now uses an ephemeral WKWebView data store so
ordinary appearance/navigation preferences cannot affect tests or be changed by
them. Mapping is approximate within a block, especially table rows or diagrams;
the block's original source range is authoritative. No document is reserialized
by reading navigation, and automatic scrolling leaves focus/selection alone.
