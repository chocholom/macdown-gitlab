# MacDown GitLab

A free, native macOS Markdown editor. Write in source, edit visually, and preview
the Markdown flavour your project uses.

**macOS 14+ · Native Apple Silicon · Free and open source · Works offline**

## Features

- **Three Markdown flavours:** CommonMark, GitHub and GitLab. Pick a global
  default, a project default, or an override for one file.
- **Four editing modes:** Split, Source, Preview and Visual edit. Edit paragraphs,
  headings and table cells in the preview; switching modes keeps your source intact.
- **Formatting that fits the flavour:** toolbar actions, lists, links, fenced code,
  task checkboxes and table tools. Paste spreadsheet cells as a Markdown table;
  import or paste images with alt text.
- **Offline math and diagrams:** bundled math rendering and Mermaid in the GitLab
  profile, alongside footnotes, inline diffs and a table of contents.
- **Find your way around:** searchable heading outline, preview search with source
  jumps, linked source/preview scrolling, project file browsing and text search,
  plus file and heading link completion.
- **Protect your work:** automatic draft recovery, undo/redo, external-change
  detection and saves that refuse to overwrite a changed file. Edits preserve
  unrelated Markdown, Unicode and original line endings.
- **Share a finished document:** standalone HTML with embedded assets, or A4 PDF.
  Choose an export theme, font size and margins independently of the editor.
- **Keep it comfortable:** system, light and dark appearance, with diagnostics for
  unsupported syntax and unresolved local links.

GitHub and GitLab profiles support documented feature subsets. See
[rendering compatibility](#rendering-compatibility) for their boundaries.

## Run the application

The built application is `dist/MacDown GitLab.app`. Double-click it in Finder,
or run:

```sh
open "dist/MacDown GitLab.app"
```

The bundle is locally signed. No Rosetta, subscription, CocoaPods, runtime Node
installation or runtime dependency downloads are required to use it. It is not
an Apple-notarized public release.

## Editing

- **Split**, **Source**, **Preview**, and **Visual edit** modes share one Markdown
  source. Switching modes/flavours does not rewrite the file.
- Edit ordinary paragraphs/headings and table cells directly in Visual edit.
  Unknown HTML/extensions, reference-heavy blocks, code and diagrams retain
  their source; double-click their preview to jump to source.
- The toolbar supplies flavour-aware formatting, lists, fenced code/language,
  links, tables, image import/paste, and undo/redo. Place the cursor in a table
  to add/remove rows/columns. Paste tab-separated spreadsheet cells into source
  to insert a Markdown table.
- Filter the heading outline, find visible preview text, and jump from matches
  to their mapped source location. Link completion suggests local files and
  heading anchors.
- **Link scrolling** keeps the content at the middle of the source and preview
  together in Split mode, in either direction. Turn it off for independent
  scrolling; the preference is remembered. Switching to Source, Preview or
  Visual edit keeps your reading position.
- Use **Show in preview** at the source caret, or **Show in source** for the
  selected rendered/visual block. Right-click in either view for the same action.
  Source mapping is available in offline preview; server HTML has no local map.
- Choose a project to browse Markdown files and search project text. Relative
  links resolve from the document's directory. Local image access stays within
  the project; importing/pasting images uses an assets directory and asks for
  alt text.
- Drafts are written atomically as edits arrive. Quitting preserves unsaved
  work; closing a changed document offers Keep Draft, Discard Changes or Cancel.
  Clean files reload external changes. Save refuses to overwrite a changed or
  deleted baseline; Save As preserves both versions.

## Flavours and settings

| Flavour | Supported syntax |
| --- | --- |
| **CommonMark** | Standard Markdown, checked against all 652 CommonMark 0.31.2 examples |
| **GitHub** | CommonMark plus tables, task lists, strikethrough, bare URL linking and alerts |
| **GitLab** | The GitHub profile features plus footnotes, description lists, multiline quotes, inline diffs, TOC, math and Mermaid |

In Settings, choose whether a flavour change applies as the global default,
project default or file override. File overrides take
precedence over project defaults, which take precedence over the global default.
Use inherited setting removes an override. Save a standalone file before setting
its persistent file override.

A project uses `.macdown.json`; applying a project setting creates it. The nearest
configuration above an opened file is discovered automatically, or Choose Project
sets the workspace explicitly. Configuration errors are visible and are never
silently overwritten. Copy [the example](.macdown.example.json) to customize:

```json
{
  "version": 1,
  "dialect": "gitlab",
  "files": { "README.md": "github" },
  "assetsDirectory": "assets"
}
```

Settings are kept outside Markdown. CRLF, Unicode, reference definitions and
unrelated blocks survive edits; edited visual blocks may normalize their own
Markdown syntax. Source is UTF-8, including a preserved BOM when present.

## Rendering compatibility

CommonMark parsing is checked against all **652 official 0.31.2 examples**.
Application heading IDs and code wrappers are normalized in those comparisons.
Unsafe HTML is sanitized before display/export, so specification parsing does
not mean scripts or arbitrary styles run in the editor.

Math/fonts and diagram libraries are bundled for offline use. Heading anchors
handle Unicode and duplicates.

The profiles cover those documented local features, **not every platform/version
or server integration**. Emoji shortcode expansion, color chips, GitHub-specific
math/footnotes, PlantUML/Kroki/Graphviz services, wiki-specific features, GitLab
includes/queries and resolved issue/user references are outside the local renderer.
Source remains intact; diagnostics identify supported categories of incompatibility
and unresolved local targets.

Optional Render on GitLab sends the current document only after an explicit native
dialog. Configure an HTTPS instance and project, then enter a token in a secure
field. Tokens are kept only for that request; redirects are refused. Returned HTML
is sanitized and labelled as server preview. Styling/frontend processing may still
differ from the actual GitLab page. No live credentials are bundled.

## Export

Choose a separate export theme, font size and margins in Settings. HTML embeds
local images, math fonts and rendered diagram SVGs. PDF captures bounded pages
through WebKit and writes A4 pages with configured margins, keeping ordinary
paragraphs, text lines, images and table rows together when they fit.

PDF is visual/vector output, not a tagged accessibility PDF. PDF link annotations
are not preserved. Oversized blocks can span pages. Export an offline preview;
server preview does not silently become an editable document or export source.

## Build and test

Regression tests cover Markdown parsing, source preservation, visual editing,
linked scrolling/navigation, native settings/storage, exports and crash recovery.
Coverage thresholds and mutation checks help catch regressions; see
[validation results](docs/VALIDATION.md).

Development requires Xcode/Swift and Node.js 22+. Install dependencies once:

```sh
npm ci
npm run test:coverage
npm run test:mutations
npm run build:web
npm run test:ui
swift test --enable-code-coverage
bash scripts/check-native-coverage.sh
bash scripts/build-app.sh
bash scripts/native-smoke.sh
```

Browser tests use installed Google Chrome on macOS, or Playwright Chromium. If
Chromium is needed, run `npx playwright install chromium`. The native acceptance
script opens temporary test windows and writes only under `test-results/native`;
it also launches a second app process to verify draft recovery. It requires a
macOS graphical session. It does not upload documents or request credentials.

For a browser development preview:

```sh
npm run build:web
node scripts/serve.mjs
```

Open `http://127.0.0.1:8765`. Native file/project/asset/PDF actions are available in
the macOS application; the browser preview is a development surface.

[Requirements](docs/REQUIREMENTS.md), [implementation decisions](docs/IMPLEMENTATION.md),
and [validation/evidence](docs/VALIDATION.md) form the delivery record.
[Enhanced editor CI](.github/workflows/editor.yml) runs core/specification,
mutation, browser and native persistence tests with coverage thresholds and
builds the app. Native graphical acceptance is run locally; it is not counted
as a headless CI pass. The retained legacy XCTest suite is not included in the
reported enhanced-editor coverage.

## Project origins

This project is derived from [schuyler/macdown3000](https://github.com/schuyler/macdown3000),
using the source at commit [`962df747`](https://github.com/schuyler/macdown3000/commit/962df74793d1d98a0ad9e85628f0a1d6c24769e2).
Its upstream MIT notices and credits are preserved. The enhanced editor is a
new Swift/AppKit/WKWebView target with an independently tested Markdown core;
the original Objective-C app, assets and fixtures remain in the repository.

This repository was created with GitHub's fork flow and is linked to MacDown
3000's repository. A Git remote or copied source by itself would not establish
that relationship. See [the architecture decision](docs/IMPLEMENTATION.md) and
[upstream documentation](docs/UPSTREAM-README.md).

## Licences

New code is MIT-licensed; original MacDown notices are preserved in `LICENSE/`.
Third-party notices are generated into the bundled resources. The official
CommonMark test corpus has a separate CC BY-SA 4.0 notice in [tests/NOTICE.md](tests/NOTICE.md).
