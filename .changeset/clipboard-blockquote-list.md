---
"@cp949/geul-io": patch
---

클립보드 표 옆 `blockquote`가 감싼 목록의 항목 글자를 항목 content에 남긴다.

- `<blockquote><ul><li>a</li></ul></blockquote>` 옆에 표가 있으면 항목 content가 비고 글자가 자식 문단 `a`로 갔다. 이제 `bulletListItem(content a)`이고 자식 문단이 없다.
- 여러 항목·순서 목록·중첩 목록·`span`으로 감싼 목록·`blockquote` 안 `blockquote`·`blockquote` 안 `div`도 `blockquote` 래퍼를 뺀 입력과 같은 결과를 낸다.
- 원인: 분할기가 목록 안 텍스트마다 마크 없는 조상(`blockquote`)을 복제해 씌웠고, 항목 분할이 그 복제를 블록으로 보았다. 이제 정책의 구조 조상(`isNestedBoundary`·`isTransparent`)은 복제하지 않는다.
- `ul`·`ol` 밖의 `li`가 감싼 목록도 같은 결과를 낸다.
- 래퍼 `blockquote`·`li`의 `style` 색은 항목에 따라오지 않는다. 항목 안 `li`·`div` 자신의 `style`은 읽는다.
- `span`·`b`·`a`처럼 마크가 있는 조상은 계속 항목 글자에 씌워진다.
- `importHtml` 결과는 바뀌지 않는다.
