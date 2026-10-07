# Supported Markdown profiles

The local renderer has explicit capabilities, not an unrestricted claim of pixel
identity with every GitHub/GitLab version. Source preservation applies even to
unsupported syntax. HTML is parsed but sanitized before it enters a document view.

| Syntax | CommonMark | GitHub | GitLab |
| --- | --- | --- | --- |
| CommonMark 0.31.2 core | Yes | Yes | Yes |
| Raw HTML | Sanitized | Sanitized | Sanitized |
| Tables, task lists, strikethrough | No | Yes | Yes |
| Bare URL autolinks | No | Yes | Yes |
| Alerts (including custom titles) | No | Yes | Yes |
| Footnotes and description lists | No | No | Yes |
| Multiline `>>>` quotes/alerts | No | No | Yes |
| Inline diff curly/square delimiters | No | No | Yes |
| `[TOC]`, `[[_TOC_]]`, `[[TOC]]` | No | No | Yes |
| Inline `$...$`, dollar/backtick math | No | No | Yes |
| Display `$$...$$`, math fences | No | No | Yes |
| Mermaid fences | Ordinary code | Ordinary code | Local diagrams |
| GitLab references, includes, GLQL | Literal/source | Literal/source | Needs server context |

Heading anchors use Unicode-aware, deduplicated slugs, preserving repeated
spaces/hyphens according to modern GitHub/GitLab examples. Snippet filename
prefixes and wiki context are not synthesized. Platform CSS is approximated by
the application stylesheet; HTML structure/semantics matter more than exact
pixel matching.

Unknown/raw HTML is kept in source. The view removes scripts, event handlers,
document styles, forms, embeds and unsafe URLs. Visual edits are enabled for
ordinary mapped paragraphs/headings and table cells. Reference-heavy paragraphs,
math/extension blocks, HTML, code and diagrams have a source editing path.

Not provided by the local renderer: platform emoji shortcodes/color chips,
PlantUML/Kroki/Graphviz services, GitHub-specific math/footnote extensions,
GitLab wiki-specific syntax, includes, queries and resolved issue/user references.
Diagnostics flag several of these categories; they do not claim to detect every
possible third-party Markdown extension.

The opt-in GitLab API returns server HTML with project context. It requires an
HTTPS instance and a token entered in a native secure field for each request.
Requests never happen on typing/opening/saving. Redirects are refused and returned
HTML is sanitized. Server styling and frontend widgets may differ. This route
is implemented and request/response handling is tested locally; a live account
was not available during validation.

Primary compatibility references:

- https://spec.commonmark.org/0.31.2/
- https://github.github.com/gfm/
- https://docs.gitlab.com/user/markdown/
- https://docs.gitlab.com/development/gitlab_flavored_markdown/
- https://docs.gitlab.com/api/markdown/
