---
"@cp949/geul-model": patch
"@cp949/geul-io": patch
"@cp949/geul-core": patch
---

`importHtml`이 `pre` 안 무효 문자를 만나도 문서를 거절하지 않고 지운다.

- `<pre>a&#13;b</pre>`, `<pre>a&#1;b</pre>`, NUL 원문은 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다. 이제 `ab`인 `codeBlock`과 `UNSAFE_CODE_POINT_REMOVED` 경고를 반환한다.
- 최상위 `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`가 같다. 경고 `element`는 무효 문자가 든 글자의 부모 태그다(`pre`, `pre > code`면 `code`).
- CR은 줄바꿈으로 바꾸지 않고 지운다. `codeBlock`이 되는 `pre`의 Tab·LF는 코드 내용이라 남기고 경고도 없다. 인라인 글자로 평탄화되는 `pre`의 Tab 삭제는 경고한다(#354).
- `data-language`의 무효 문자는 이전처럼 `HTML_DOCUMENT_INVALID`로 거절한다.
- model: `sanitizeCodeBlockSource`를 공개한다. `isValidCodeBlockSource`가 거부하는 문자만 지우고 출력은 항상 검증을 통과한다.
- io: 클립보드 `pre` 정제가 이 함수를 쓴다. 결과는 바뀌지 않는다.
- core: 붙여넣기 `normalizeKeepingTabs`가 이 함수를 쓴다. 결과는 바뀌지 않는다.
- core: `text/html`이 `pre` 안 무효 문자를 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 무효 문자를 지운 `codeBlock`이 붙고 `text/plain`은 쓰지 않는다. 지운 뒤 글자가 비면 빈 `codeBlock`이 붙는다(빈 `<pre></pre>`와 같다).
