---
status: accepted
---

# exportHtml은 구문 강조 seam을 동기 결과로만 소비한다

`SyntaxHighlighter`(spec `docs/specs/2026-09-08-blk-017-code-highlighting-seam-design.md` §3)는 동기·비동기 결과를 모두 허용하는 계약이지만, `exportHtml`(`packages/io`)은 `Result<string, ExportError>`를 즉시 반환하는 동기 함수로 남긴다. highlighter가 Promise를 반환하면 해당 코드 블록만 강조 없이 plain으로 export하고 `console.warn`으로 알린다. `exportHtml`을 비동기로 바꾸면 기존 모든 호출자의 시그니처가 바뀌는 breaking change이고, 별도 `exportHtmlAsync`를 신설하면 두 함수를 계속 동기화해야 하는 유지비가 생긴다 — 두 대안 모두 이 이득에 비해 비용이 크다고 판단했다. 이 손실은 CONTEXT.md의 lossy export 계약을 거치지 않는다: `exportHtml`은 애초에 strict/lossy 모드가 없어(구현 주석, `export-html.ts`) 반환값에 손실을 싣지 않으며, 대신 core의 구문 강조 seam이 이미 쓰는 관례(rejected promise는 console.warn으로만 알리고 plain으로 남긴다, `code-block-highlight-extension.ts`)를 그대로 따른다.

## Consequences

- shiki처럼 본질적으로 비동기인 하이라이터를 쓰는 소비자는 export 결과에서 해당 코드 블록의 강조가 통째로 빠질 수 있다 — 동기 캐시를 미리 채워두는 책임은 소비자에게 있다.
- 이 손실은 `exportHtml`의 반환값(`Result`)에 나타나지 않는다. 문서 의미 손실(예: 미등록 CustomBlock)과 구문 강조 seam의 손실은 서로 다른 채널(하나는 `ExportError`/lossy 보고, 하나는 console.warn)을 쓴다.
- 정말 비동기 강조가 필요해지면 `exportHtml` 시그니처를 바꾸기보다 새 함수 추가를 먼저 검토한다(기존 호출자 보호).
