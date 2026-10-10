---
"@cp949/geul-io": patch
---

`importHtml`이 `pre`를 `codeBlock`이 아닌 인라인 글자로 평탄화할 때 지우는 Tab도 `UNSAFE_CODE_POINT_REMOVED`로 경고한다.

- 목록 항목, 중첩 목록 항목, 인용, callout의 본문 구간에서 인라인 래퍼(`span`, `b`, `a`, `em`, `code` 등)를 지난 `pre`는 `codeBlock`이 되지 않는다. 부모 블록 본문 글자가 된다. 이때 지운 Tab을 이전에는 경고하지 않았다.
- 경고 `element`는 Tab이 든 글자의 부모 태그다(`pre`, `pre > code`면 `code`).
- 결과 문서(블록 구조와 글자)는 바뀌지 않는다. 경고만 는다.
- `codeBlock`이 되는 `pre`는 Tab을 남기고 경고도 없다. 래퍼 없는 `pre`, `font`·`mark` 래퍼 `pre`, `div` 안 `pre`, 본문 뒤 children의 `pre`가 같다.
- CR·C0 경고 개수와 표 셀 안 `pre`의 경고는 이전과 같다.
- 정정: 위 첫 문장의 평탄화 자리는 이 changeset 시점의 서술이다. `io-html-wrapped-block-structure` 이후 목록 항목·인용·callout 안 인라인 래퍼를 지난 `pre`는 children `codeBlock`이다. 평탄화와 Tab 경고는 표 셀과 토글 `summary` 안 `pre`에 남는다.
