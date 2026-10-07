# MacDown GitLab requirements

Status: implemented; final validation is recorded in VALIDATION.md. This is the acceptance contract; see
IMPLEMENTATION.md for decisions and VALIDATION.md for measured results.

## Product

A free, offline-first, native Apple Silicon macOS Markdown editor with the
MacDown source/preview workflow, selectable dialects, and safe visual editing.
Documents remain ordinary UTF-8 Markdown files. No paid editor service is needed.

## Required outcomes

| ID | Requirement | Acceptance check |
| --- | --- | --- |
| R01 | Native macOS application; open, new, save, save as, multiple documents | Build arm64 app; open/edit/save/reopen actual file |
| R02 | CommonMark, GitHub, GitLab profiles | Same fixture has profile-specific parse/render and enabled commands |
| R03 | Global default, project default, persistent file override | File > project > global; reset override; reopen; sibling project isolation |
| R04 | Settings never inserted into Markdown | No-op save and dialect changes preserve original bytes, including CRLF |
| R05 | Source, preview, visual and split modes | Mode switch preserves source; edit rendered text; source updates |
| R06 | Visual edits preserve unrelated Markdown and unsupported constructs | Edit paragraph in mixed document; surrounding bytes identical; unknown blocks remain source editable |
| R07 | Flavour-aware formatting | Bold/italic/headings/links/lists/code/table/task/strike actions; unsupported commands disabled; undo/redo |
| R08 | Offline GitLab rendering | Tables/tasks/strike/footnotes/alerts/math/Mermaid/TOC/inline diff; unsupported server features explained |
| R09 | Optional instance-rendered GitLab preview | Explicit action only; HTTPS instance, project context, authentication; errors visible; no background document upload |
| R10 | Diagnostics | Unsupported constructs, missing references/local links/images, malformed project settings; navigate to source |
| R11 | Heading outline | Nested clickable headings, filter, no headings from fenced code |
| R12 | Preview search and jump to source | Highlight visible text; next/previous matches; mapped source navigation |
| R13 | Structured editing | Insert code fence/language; tables add/remove rows/columns; spreadsheet paste; list indentation |
| R14 | Link/anchor assistance | Complete local Markdown files/headings; validate targets; profile-correct deduplicated heading IDs |
| R15 | Draft recovery | Never-saved and modified documents survive restart/crash; saved draft removed; explicit discard; no overwrite of externally changed file |
| R16 | Export profiles | HTML/PDF export uses selected dialect and independent print settings; screen style unchanged |
| R17 | Image handling | Paste/import image to project assets, relative link, alt text, collision-safe name |
| R18 | Project tooling | Folder/file navigation and project-wide text search; choose project root |
| R19 | Accessibility and usability | Labelled keyboard-operable controls, light/dark/system appearance, status/counts, responsive layout |
| R20 | Regression protection | Parser fixtures/spec examples, source preservation, settings, commands, recovery/native I/O, actual browser interaction, reproducible CI |
| R21 | Delivery and traceability | Build/run instructions, executable app, requirement-by-requirement validation, decisions and known limitations recorded |
| R22 | Bidirectional reading navigation | Show caret/block in the other view via buttons and context menu; linked scrolling follows the viewport centre in both directions; persistent opt-out; mode switches retain position; no source changes |

## Compatibility boundary

GitLab compatibility means a documented offline syntax profile, not a promise to
duplicate every GitLab server/version. References such as #123 and @user need
server/project data; includes and queries also need server services. They must
remain unchanged and be identified as context-dependent. An opt-in API preview
can supply server HTML, but CSS/frontend processing can still differ. Its label
must distinguish it from offline preview. CommonMark/GFM claims must be supported
by fixtures rather than the appearance of the theme.

## Preservation and editing

Markdown source is authoritative. Mode/flavour changes do not serialize it.
Visual editing operates on mapped supported blocks and patches only their source
ranges. Unknown HTML/extensions/front matter/code/diagrams retain their original
source and have a source editing path. An edited block may normalize its own
syntax; surrounding blocks, reference definitions, whitespace and line endings
must remain untouched. Undo records actual document changes across modes.

## Settings

Project configuration: `.macdown.json`, schema version 1, default `dialect`,
relative-path `files` overrides, `assetsDirectory`, and optional GitLab instance
and project. Global settings use macOS preferences. Standalone file overrides use
local application metadata. Explicit project choice and nearest configuration
are supported. Malformed configuration is surfaced, never silently overwritten.
Credentials are never written to project configuration, exported HTML, or logs.

## Scope decisions

All features above are in delivery scope, including the later export and project
tooling suggestions. Collaboration, cloud sync, AI writing, plugin marketplace,
and a general Git client are outside scope. Remote preview is optional and must
never block offline editing. No external publication or push is authorized.
