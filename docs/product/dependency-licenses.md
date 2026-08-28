# Direct production dependency licenses

The table records every direct external production dependency in the R0 workspace. Workspace-local `@cp949/geul-*` packages are excluded. Versions and licenses are checked from the installed lockfile graph by `pnpm check:licenses`.

| Dependency | Version | License | Used by | Purpose |
| --- | --- | --- | --- | --- |
| `@tiptap/core` | `3.30.1` | MIT | core | Headless editor runtime and extension API |
| `@tiptap/pm` | `3.30.1` | MIT | core | ProseMirror runtime modules used through Tiptap |
| `@tiptap/starter-kit` | `3.30.1` | MIT | core | R0 paragraph, heading, list, and inline editing extensions |
| `hast-util-from-parse5` | `8.0.3` | MIT | io | Parse5-tree-to-HAST conversion, run after the iterative depth cap bounds its recursion (Issue #130) |
| `hast-util-sanitize` | `5.0.2` | MIT | io | HTML AST allowlist sanitization |
| `parse5` | `7.3.0` | MIT | io | Spec-compliant HTML parsing with iterative tree construction (safe at any input depth) |
| `rehype-stringify` | `10.0.1` | MIT | io | Sanitized HAST-to-HTML serialization |
| `remark-gfm` | `4.0.1` | MIT | io | GitHub Flavored Markdown tables and syntax |
| `remark-parse` | `11.0.0` | MIT | io | Markdown-to-MDAST parsing |
| `remark-stringify` | `11.0.0` | MIT | io | MDAST-to-Markdown serialization |
| `unified` | `11.0.5` | MIT | io | HTML and Markdown transformation pipelines |
| `zod` | `4.4.3` | MIT | model | Runtime document schema decoding and validation |
| `lucide-react` | `1.31.0` | ISC | react | Icon-only control SVG icons. Source uses per-file named imports from the package barrel; unused icons are dropped only by bundlers honoring `sideEffects: false` (no `exports` map — the CJS `main` is a single ~1 MB file that non-bundled consumers load whole) |
| `react` | `19.2.8` | MIT | react, demo | React bindings and demo UI |
| `react-dom` | `19.2.8` | MIT | react, demo | Browser rendering for React bindings and demo UI |
| `core-js` | `3.50.0` | MIT | demo | Chrome 75 consumer-role runtime polyfills loaded by the demo entry (ADR 0009); library packages never load it |

## Patched dependencies

The workspace ships one modified third-party package. Patching redistributes modified source, so each entry records the upstream license that permits it and the issue that owns removal (ADR 0006).

| Dependency | Version | License | Reached through | Patch | Owner |
| --- | --- | --- | --- | --- | --- |
| `micromark-extension-gfm-table` | `2.1.1` | MIT | `remark-gfm` → `micromark-extension-gfm` | `patches/micromark-extension-gfm-table@2.1.1.patch` — replaces the `EditMap.addImplementation` linear scan with an `at -> index` `Map` lookup; output is unchanged, only cost | Issue #26. Drop the patch once the fix lands upstream |

Transitive dependencies do not appear in the direct dependency table above, so `pnpm check:licenses` audits their licenses but does not record the patch on their own — this section is the record for both transitive and direct patched dependencies.

This inventory and automated allowlist are engineering controls only. They do not replace legal review, license-text distribution checks, or approval for a production release.
