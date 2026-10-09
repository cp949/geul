---
"@cp949/geul-model": patch
"@cp949/geul-io": patch
"@cp949/geul-core": patch
---

색이 다른 인접 `span`의 `textColor`·`backgroundColor`가 첫 색으로 합쳐지던 결함을 고친다.

- `importHtml`이 `<span style="color:#ff0000">a</span><span style="color:#0000ff">b</span>`를 `a`(#FF0000), `b`(#0000FF) 두 조각으로 읽는다. 이전에는 `ab` 한 조각에 첫 색이었다. VS Code 복사처럼 구문 강조 색이 `span`마다 다른 HTML이 색을 유지한다.
- 같은 판정을 쓰던 model `appendOrMergeInlineItem`·`sameMarks`가 색 값까지 비교한다. 같은 색 인접 `span`은 계속 한 조각이다.
- core `modelToTiptap`이 색이 다른 인접 조각을 가진 문서를 `contains adjacent inline runs with identical marks`로 거절하던 동작을 없앴다. `tiptapToModel`과 표 셀 코덱의 병합도 색이 다른 조각을 합치지 않는다.
- `canonicalizeTextMarks`의 중복 제거는 그대로다. 한 조각에 같은 종류 색이 둘이면 앞의 것만 남는다.
