---
"@cp949/geul-io": patch
---

외부 HTML 요소의 style을 마크·블록 속성·셀 색으로 읽는 규칙을 한 module로 모으고, 표면마다 빠졌던 서식을 Chromium처럼 읽도록 고친다.

- 표 셀 `td`·`tr`·`table`의 굵게·기울임·밑줄·취소선을 셀 글자 서식으로 읽는다. `importHtml`과 클립보드 표가 같다.
- `li`·`blockquote`·callout이 승격한 안쪽 `p`의 색과 서식을 읽는다. `li`가 red, `p`가 blue면 blue다.
- `summary`·`figcaption`의 `style` 색과 서식을 읽는다. 자기 export toggle의 `summary`도 서식을 읽는다.
- 안쪽 요소의 `font-weight:normal`·`400`·`font-style:normal`이 바깥 굵게·기울임을 끈다. `inherit`·`unset`은 부모를 따른다. `em`·`i`의 `font-style:normal`과 `font` 줄임은 UA 기울임을 끈다.
- 무효한 `font-style` 선언은 앞의 값을 지우지 않는다.
- `div`·`li`·`blockquote` 바로 아래 `span`의 `SAFE_BLOCK_DOWNGRADED` 경고를 없앤다. `span` 안의 미지원 블록은 그 블록 이름으로 경고한다.
- `parseInlineStyleMarks`의 `italic: boolean`을 `fontStyle`로 바꾸고 `InlineFontWeight`에 `inherit`를 더한다. 패키지 내부 API이고 `index.ts`에서 내보내지 않는다.
