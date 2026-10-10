---
"@cp949/geul-io": patch
---

`importHtml`의 경고가 실제 변환 결과와 어긋나던 오탐과 누락을 고친다.

- `<p>` 안 Tab, 탭 들여쓰기한 외부 HTML 같이 공백으로 접혀 글자가 남는 입력에 `UNSAFE_CODE_POINT_REMOVED`를 내지 않는다.
- `<script>` 안 제어문자는 `UNSAFE_ELEMENT_REMOVED` 하나만 낸다. 이전에는 `UNSAFE_CODE_POINT_REMOVED`가 더해졌다.
- 제목 안 인용·callout, 토글 `summary`, children wrapper, 생산 편집기 목록 `div` 안에서 평탄화되는 `<pre>`의 Tab 삭제도 경고한다.
- `<caption>` 안 글자의 경고 `element`가 `table`이다. sanitize가 벗긴 요소가 아니라 남은 부모 태그를 쓴다.
- 속성 보존 경고를 노드 단위로 맞춘다. 같은 태그·속성을 가진 다른 노드의 경고가 사라지던 오류가 없어진다.
- 경고 순서는 sanitize 손실, 변환 손실, 속성 보존 순이다. 반환하는 문서는 바뀌지 않는다.
