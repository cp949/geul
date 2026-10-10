---
"@cp949/geul-io": patch
---

`importHtml`이 인라인·`div` 래퍼 안의 목록과 블록을 지킨다(#336).

- `<span><ul><li>a</li><li>b</li></ul></span>`는 목록 항목 둘이다. 이전에는 문단 둘이었다.
- `<b><ul><li>a</li></ul></b>`는 굵은 목록 항목이다. `div` 안 `ul`·`ol`도 목록이다.
- Google Docs 복사 모양(`<b style="font-weight:normal" id="docs-internal-guid-…">`가 전부 감쌈)의 목록이 굵지 않은 목록 항목으로 남는다.
- 래퍼 안 연속 `ol`의 번호는 최상위 연속 `ol`과 같다.
- 목록 항목·인용·callout 안에서 블록을 품은 인라인 요소(`span`·`b`·`a` 등)는 children 자리로 간다. `<ul><li>i<span>x<table>…</table></span></li></ul>`의 표는 항목의 children 표다. 이전에는 항목 글자로 접혔다.
- 같은 자리의 인라인 래퍼 안 `pre`는 children `codeBlock`이다. Tab이 남고 `UNSAFE_CODE_POINT_REMOVED`가 없다. 이전에는 본문 글자로 평탄화됐다(#354).
- 블록 자손이 없는 인라인 요소는 이전과 같다.
- 블록 자리의 미지원 태그(`span`·`b` 등)는 이전처럼 `SAFE_BLOCK_DOWNGRADED`로 경고한다.
- 일반 html 붙여넣기와 클립보드 표 붙여넣기도 같은 변환기라 같은 결과다.
