---
"@cp949/geul-io": patch
---

`span`·`b`·`strong` 밖 요소의 색과 인라인 서식이 사라지던 결함을 고친다.

- `importHtml`과 클립보드 표 파서가 `<font color="red">`를 #FF0000으로, `<mark>`를 배경 #FFFF00으로 읽는다. `font`의 `color`·`style`과 `mark`의 `style`은 읽는 속성이라 `UNSAFE_ATTRIBUTE_REMOVED` 경고가 사라진다.
- `em`·`i`·`u`·`s`·`del`·`strike`·`code`의 `style`에서 색·배경·굵게·기울임·밑줄·취소선을 읽는다. `span`의 `font:italic bold 12px Arial` 같은 `font` 줄임 속성도 읽는다.
- `<b style="font-weight:300">`처럼 유효한 비굵기 값은 굵게로 읽지 않는다. 이전에는 `b` 태그라서 항상 굵게였다.
- `p`·`h1`–`h6`·`blockquote`·`li`·callout·블록 자식 없는 `div`의 `style` 색을 블록 속성 `textColor`·`backgroundColor`로 읽는다. `data-geul-*`가 있는 필드는 그쪽이 이긴다. 블록 `style`의 굵게·기울임·밑줄·취소선은 안쪽 텍스트 마크가 된다.
- 표 셀 색을 `td`·`th` → `tr` → `table` 순으로 읽는다. `style`의 색과 옛 `bgcolor` 속성을 읽고, 윗단 값이 없을 때만 아랫단을 쓴다. `importHtml`과 클립보드 표가 같은 셀 색을 낸다. 이전에는 `importHtml`이 `td`의 `style`을 읽지 않았다.
- 투명·반투명 색은 색을 정하지 않은 값이다. 셀에서는 아랫단 색이 비친다.
- 표 셀 안 블록 요소의 `style` 색은 텍스트 마크로 읽는다. 셀 속성과 겹쳐 반영되지 않는다.
- 블록 자식이 있는 래퍼 `div`의 색·배경은 읽지 않는다. VS Code 복사의 바깥 `div` 테마 색이 따라오지 않는다.
- `td`·`th`·`tr`·`table`·`em`·`p` 등 기존 태그의 `style`·`bgcolor` 제거 경고(`UNSAFE_ATTRIBUTE_REMOVED`)는 이전과 같다.
- 브라우저 복사의 계산 스타일 덤프가 붙은 요소(`style`에 `-webkit-text-stroke-width` 선언)의 색·배경은 블록 속성·표 셀 색·셀 안 블록 요소 마크로 읽지 않는다. Chrome 복사가 심는 검정 글자·흰 배경이 문서에 박히지 않는다.
- `b`·`strong`·`em`·`i`·`u`·`s`·`del`·`strike`·`code`·`font`·`mark`도 같은 표식이 있으면 `style`의 색·배경을 읽지 않는다. 서식 선언, `font`의 `color` 속성, `mark`의 기본 노랑 배경은 읽는다. `span`은 그대로다.
- 읽지 못한 `font color` 값(`rgb()` 등)은 이전처럼 `UNSAFE_ATTRIBUTE_REMOVED`로 경고한다.
- `font`·`mark`가 목록·표 같은 블록을 품으면 태그만 벗겨 블록 구조를 유지한다. 벗겨지는 태그의 `color`·`style`은 사라지므로 이전처럼 경고한다.
- `a`의 `style`, `thead`·`tbody`·`col`의 색, `mark`의 기본 글자색, 옛 속성 쓰레기 값(`bgcolor="garbage"`)은 읽지 않는다.
