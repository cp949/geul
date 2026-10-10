---
"@cp949/geul-io": patch
"@cp949/geul-core": patch
---

`importHtml`이 `pre`·`code`의 무효 language 후보를 만나도 문서를 거절하지 않고 없는 것으로 본다.

- `data-language`나 `class="language-*"`에 제어문자·짝 없는 surrogate가 있으면 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다. 이제 그 후보를 빼고 나머지 후보에서 우선순위대로 고른다.
- `<pre data-language="a&#1;b" class="language-js">`는 language `javascript`인 `codeBlock`이다. 후보가 모두 무효면 language 없는 `codeBlock`이다.
- 빠진 후보마다 `UNSAFE_ATTRIBUTE_REMOVED`를 반환한다. `attribute`는 `dataLanguage` 또는 `className`이고 `element`는 `pre` 또는 `code`다. 같은 노드의 `class`에 무효 토큰이 여럿이어도 한 건이고, 무효 토큰을 뺀 첫 토큰을 쓴다.
- 무효 문자만 지운 값(`ab`)은 language로 쓰지 않는다.
- 무효 후보는 `CODE_BLOCK_LANGUAGE_METADATA_IGNORED` 판정에 들지 않는다.
- 최상위 `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`가 같다.
- 클립보드 파서(`parseClipboardTable`)는 같은 선택 규칙을 쓰고 경고는 내지 않는다. 선택된 값이 무효이고 다른 유효 후보가 있으면 이제 그 후보를 language로 쓴다.
- core: `text/html`이 `pre`의 무효 language 후보만 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 language 없는 `codeBlock`이 붙고 `text/plain`은 쓰지 않는다.
