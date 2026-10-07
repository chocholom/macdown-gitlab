# Validation and acceptance audit

Validated on 2026-10-07, Apple Silicon macOS 26.5.1, Xcode 26.5 and Node 26.10.
The new application targets macOS 14+. Minimum-version CI is configured on
macOS 14; the validation results below are from the local macOS 26.5.1 run.

## Results

- **704 core/specification/navigation tests passed**, including all 652 official
  CommonMark 0.31.2 examples, 44 application behaviour tests and 8 reading-map tests.
- JavaScript Markdown core: **100.00% line**, **82.91% branch**, **95.59% function**
  coverage. This covers `Web/core.js`, not the whole imported legacy application.
- Reading-map module `Web/navigation.js`: **100.00% line**, **93.94% branch**,
  **100.00% function** coverage. Combined measured modules: 100.00% lines,
  83.95% branches and 96.39% functions; DOM navigation is checked in browser/native
  interactions rather than included in those pure-module coverage percentages.
- **28 browser interaction tests passed** (including visual selections/links,
  CRLF source edits, multiple visual block edits, tables, task checkboxes,
  search, diagnostics, local paths, offline diagrams, safe server HTML, export,
  bidirectional linked scrolling, buttons/context actions, position-preserving
  mode switches, persistent opt-out and asynchronous layout changes).
- **12 native unit tests passed** for settings, storage, assets, project search,
  authenticated request construction and pagination.
- Native settings/storage/pagination: **98.51% line coverage** (198/201 lines),
  90.61% measured region coverage. AppKit controller code is exercised by the
  graphical acceptance runner, not included in that unit coverage percentage.
- **20 checks in the actual built WKWebView app passed**, plus **3 checks in a
  second process** that restores a never-saved draft after abrupt process exit.
- Three deliberate core mutations were all detected by assertions: losing source
  bytes outside an edit, reversed settings precedence and CRLF normalization.
- Release app built with Swift warnings treated as errors. `file` identifies a
  native **arm64 Mach-O executable**. Strict/deep code-signature verification
  passed with the local ad-hoc signature.
- Dependency installation audit reported **0 vulnerabilities** after patched
  versions and the transitive math renderer override were applied.

Coverage thresholds in CI/local commands: JavaScript core >=95% lines, >=80%
branches, >=90% functions; native persistence core >=95% lines. These are scoped
thresholds, not a promise that all bugs are prevented.

## Requirement audit

All R01–R22 are implemented. The table records the actual evidence and the
explicit limits of verification; an optional external service is not described
as live-tested without credentials.

| ID | Implementation | Validation / qualification |
| --- | --- | --- |
| R01 | Swift/AppKit document host, file/new/save/save-as/multiple-window commands | Release arm64 build; native open/save/fresh-document reopen; bundle-local resources |
| R02 | Explicit CommonMark/GitHub/GitLab profiles in `Web/core.js` | Full CommonMark corpus, extension fixtures, UI profile change and disabled commands |
| R03 | `SettingsStore`, nearest `.macdown.json`, global preferences and file overrides | Native precedence/reset/reopen/sibling isolation tests; actual app project/file checks |
| R04 | Source is authoritative; normalized textarea offsets map to original source | CRLF/Unicode tests, mode changes, source formatting and byte-exact native no-op save |
| R05 | Four editor modes and native source bridge | Browser mode switching and direct visual edits; real WKWebView bridge check |
| R06 | Mapped block patches and source fallback for opaque constructs | Paragraph/unknown syntax preservation, two-block remapping, safe image insertion and generated Unicode cases |
| R07 | Capability-gated formatting, visual selection preservation, shared history | All basic command output tests; browser bold/heading/link/undo/redo checks |
| R08 | Offline GitLab extensions, local math/fonts and Mermaid | Extension fixtures, documented math/alert/TOC variants; browser network observation and SVG label checks |
| R09 | Explicit native consent, secure token field, HTTPS/project request, ephemeral session, no redirects | Request construction/rejection tests and untrusted server HTML browser test; **live GitLab account not exercised** |
| R10 | Syntax/reference/anchor/local target diagnostics and visible config warnings | Core diagnostics tests; browser actionable warning; malformed config cannot be overwritten |
| R11 | Parser-derived filtered nested outline | Fenced-code/setext/nesting fixtures and clickable/filterable browser outline |
| R12 | Visible preview search and mapped source navigation | Highlight count, next match and exact source position browser assertions |
| R13 | Fences/language, table row/column/cell operations, spreadsheet paste, list indentation | Core fence/table/TSV/list tests, real visual table edit/add-row and clipboard-paste browser checks |
| R14 | Local path/heading suggestions and deduplicated anchors | Unicode/punctuation/repeated-heading fixtures; missing target diagnostics; browser completion options |
| R15 | Atomic edit-time drafts, explicit discard, preserved quit drafts, external baseline protection | Native independent store read, draft removal after save, second-process crash recovery and actual external-change refusal |
| R16 | Separate persistent print theme/font/margins, embedded HTML assets, bounded A4 PDF | Browser print profile/diagram export checks; native embedded image/font and single/multipage PDF checks; visual PDF review |
| R17 | Collision-safe bounded asset import/paste and native alt-text entry | Native path/bytes/collision/symlink tests; actual imported image loads in WKWebView; browser source preservation |
| R18 | Project file browsing, nearest/explicit roots and bounded text search | Native file/line search assertions; root/file UI built and source navigation wired |
| R19 | Semantic labelled controls, keyboard commands, appearance and counts | Browser focus/formatting/modes and responsive dark view; native screenshot review; **full VoiceOver audit not performed** |
| R20 | Spec/core/native/browser/native-app/mutation tests with CI thresholds | Counts and metrics above; retained legacy XCTest is not included or claimed as run |
| R21 | Build/run docs, compatibility contract, decisions, app/zip and evidence | README, REQUIREMENTS, IMPLEMENTATION, COMPATIBILITY, this matrix and recorded JSON |
| R22 | Source/preview/visual navigation buttons and context menu; persistent linked scrolling; reading anchor on mode changes | Eight pure-map tests, eight browser tests and three built-WKWebView checks; CRLF/Unicode/caret/unchanged-source assertions; server mapping disabled |

## Commands run

```sh
npm run test:coverage
npm run test:mutations
npm run build:web
npm run test:ui
swift test --enable-code-coverage
bash scripts/check-native-coverage.sh
bash scripts/build-app.sh
bash scripts/native-smoke.sh
codesign --verify --deep --strict "dist/MacDown GitLab.app"
```

Swift invocations in the managed environment used explicit scratch/cache paths
and approved compiler-cache access. Browser tests used installed Chrome. The
in-app Browser skill bootstrap failed with a transport metadata error, so the
repository Playwright suite and built native WKWebView runner provided UI evidence.

## PDF inspection

The short export is one A4 page. The long fixture is seven A4 pages with 80
numbered paragraphs. Poppler text extraction found exactly 80 unique paragraph
numbers, no duplicates and none missing. Rendered first/second pages were visually
reviewed for margins, clipping and paragraph boundaries; the short export and
native window screenshot were also inspected. PDF output contains no JavaScript.

An early native-print implementation generated runaway output from an offscreen
web view. It was stopped and removed. The delivered implementation uses bounded
per-page WebKit captures, explicit Core Graphics coordinates and a pagination
helper tested against text/oversized blocks. Graphical checks have a 45-second
process deadline and isolated run directories.

## Evidence and limits

Recorded JSON lives in `docs/test-evidence/`. Regenerable screenshots and HTML/PDF
outputs are under `test-results/native/`, with browser output isolated under
`test-results/browser/`. The packaged application is in `dist/`.

The offline compatibility boundary is detailed in COMPATIBILITY.md. It does not
claim every platform feature or pixel identity with server CSS. Visual edits may
normalize the edited block, while surrounding source remains unchanged. Project
indexing is capped at 5000 files; text search scans Markdown/text files below 2 MB
and returns up to 500 matches. PDF has bounded capture size and is not tagged for
accessibility; PDF link annotations are not retained. macOS 14 is the declared
minimum, while this local graphical run used macOS 26.5.1. CI is configured but
not remotely executed, and no live GitLab credentials were requested or used.

Reading navigation uses parser block/line maps and interpolates inside blocks.
It follows the viewport centre rather than whole-document scroll percentages;
table/diagram positions within a block are approximate. At document boundaries,
normal scroll limits can prevent exact centring. Server-rendered HTML has no
trusted local source map, so navigation is disabled until returning offline.
