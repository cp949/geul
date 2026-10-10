---
"@cp949/geul-io": patch
"@cp949/geul-core": patch
---

클립보드 표 옆 문단·제목·목록 항목·블록 자식 없는 `div`의 자기 `style` 색과 서식을 `importHtml`과 같게 읽고 편집기에 남긴다.

- 표 옆 `p`·`h1`–`h6`·`li`·블록 자식 없는 `div`의 `style` 색·배경을 블록 속성 `textColor`·`backgroundColor`로 읽는다.
- 같은 요소의 굵게·기울임·밑줄·취소선을 안쪽 텍스트 마크로 읽는다.
- `li`가 승격한 `p`의 색과 서식은 `li`보다 이긴다.
- 블록 자식이 있는 래퍼 `div`의 `style`은 읽지 않는다. 안쪽 블록 자식 없는 `div`의 색과 서식만 남는다. `importHtml`과 같다.
- 목록을 품은 `div`도 래퍼다. 항목의 글자가 항목 content에 남고 래퍼 색이 항목 안 문단에 붙지 않는다.
- `ClipboardContentBlock`의 문단·제목·목록 항목에 선택 필드 `textColor`·`backgroundColor`를 더한다.
- 표 밖 캐럿에 붙이면 블록 색이 문단·제목·목록 항목(중첩 포함) 블록에 남는다.
- 셀 안 캐럿에 붙이면 문단·제목의 블록 색이 셀 텍스트의 색 마크가 된다. 안쪽의 같은 종류 색 마크가 이긴다.
- `pasteClipboardContent`는 대문자 `#RRGGBB`가 아닌 블록 색을 `CLIPBOARD_CONTENT_INVALID`로 거절하고 문서를 바꾸지 않는다.
- 한계: 표 옆 블록의 `data-geul-*`(색·정렬)는 읽지 않는다. `style`과 함께 있으면 `style` 색이 남는다.
- `li` 안 `p`·`h1`–`h6`는 content로 승격되는 첫 `p`를 뺀 모두 목록 항목의 자식 블록이 되어 자기 `style`을 읽는다. 첫 자식이 제목이면 빈 항목 content와 자식 제목이다(Issue #346).
- 정정: 위 "한계" 문장은 이 changeset 시점의 서술이다. `clipboard-table-delegation` 이후 표 옆 블록의 `data-geul-*`(색·정렬)를 읽는다. `style`과 함께 있으면 `data-geul-*`가 이긴다.
