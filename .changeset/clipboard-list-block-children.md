---
"@cp949/geul-io": patch
---

클립보드 표 옆 목록 항목 안 `p`·`h1`–`h6`를 항목의 자식 블록으로 만든다.

- `<ul><li style="color:#ff0000">t<p style="color:#00ff00">x</p></li></ul>` 옆에 표가 있으면 항목 content가 `tx`로 합쳐지고 글자가 `li` 색을 받았다. 이제 항목 content `t`(#FF0000)와 자식 문단 `x`(#00FF00)다.
- `<li><h2 style="color:#00ff00">H</h2></li>`는 빈 항목과 자식 제목 `H`(#00FF00)다.
- `p` 뒤 `p`·`h2`, `h1` 뒤 중첩 목록, 굵은 `p`, 순서 목록, 글자 사이 제목도 `importHtml`과 같은 블록 트리를 낸다.
- 원인: 클립보드의 `isBlockLevelNode`가 `p`·제목을 블록으로 보지 않았다. 이제 정책의 `isSimpleBoundary`와 `headingLevelFromTagName`을 더한다.
- 첫 실질 자식이 `p`인 항목은 이전과 같다. 승격 경로가 먼저 처리한다.
- 내용 없는 `p`·`h1`–`h6`(빈 요소, 공백뿐, `<br>`만 든 `p`)는 클립보드가 자식 블록을 만들지 않는다. `importHtml`은 빈 자식 블록을 만든다.
- `importHtml` 결과는 바뀌지 않는다.
