# Direct production dependency licenses

The table records every direct external production dependency in the R0 workspace. Workspace-local `@cp949/geul-*` packages are excluded. Versions and licenses are checked from the installed lockfile graph by `pnpm check:licenses`.

| Dependency | Version | License | Used by | Purpose |
| --- | --- | --- | --- | --- |
| `@tiptap/core` | `3.30.1` | MIT | core | Headless editor runtime and extension API |
| `@tiptap/pm` | `3.30.1` | MIT | core | ProseMirror runtime modules used through Tiptap |
| `@tiptap/starter-kit` | `3.30.1` | MIT | core | R0 paragraph, heading, list, and inline editing extensions |
| `hast-util-sanitize` | `5.0.2` | MIT | io | HTML AST allowlist sanitization |
| `rehype-parse` | `9.0.1` | MIT | io | HTML-to-HAST parsing |
| `rehype-stringify` | `10.0.1` | MIT | io | Sanitized HAST-to-HTML serialization |
| `remark-gfm` | `4.0.1` | MIT | io | GitHub Flavored Markdown tables and syntax |
| `remark-parse` | `11.0.0` | MIT | io | Markdown-to-MDAST parsing |
| `remark-stringify` | `11.0.0` | MIT | io | MDAST-to-Markdown serialization |
| `unified` | `11.0.5` | MIT | io | HTML and Markdown transformation pipelines |
| `zod` | `4.4.3` | MIT | model | Runtime document schema decoding and validation |
| `react` | `19.2.8` | MIT | react, demo | React bindings and demo UI |
| `react-dom` | `19.2.8` | MIT | react, demo | Browser rendering for React bindings and demo UI |

This inventory and automated allowlist are engineering controls only. They do not replace legal review, license-text distribution checks, or approval for a production release.
