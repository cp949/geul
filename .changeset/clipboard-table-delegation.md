---
"@cp949/geul-io": minor
"@cp949/geul-core": minor
---

클립보드 표 옆 블록을 `importHtml` 블록 변환기로 읽는다. `parseClipboardTable`이 이전에 나오지 않던 블록 type을 낸다.

바뀌는 점(io). 표가 든 `text/html`의 표 옆 블록이 같은 html의 `importHtml` 결과와 같아진다:

- `<blockquote>`는 문단이 아니라 `quote`다. 안의 문단·목록은 자식 블록이다.
- 최상위 `<pre>`는 `codeBlock`이다. `language`, 줄바꿈, 들여쓰기를 지킨다. 이전에는 문단이었다.
- 최상위 `<hr>`는 `divider`다. 이전에는 사라졌다.
- 단독 `img`와 `figure` 안 `img`는 `image`다. 이전에는 사라졌다. `figure` 안 `pre`와 `figcaption`은 `codeBlock`의 `caption`이 된다.
- `li data-geul-checked`는 `checkListItem`이다. 이전에는 `bulletListItem`이었다.
- 연속한 `ol`의 둘째 목록 첫 항목은 `startNumber` 1이다.
- 블록의 `data-geul-*`(`data-geul-text-color` 등 색·정렬)를 읽는다. 이전에는 읽지 않았다.
- 빈 `<p></p>`, 빈 제목, 제로폭 문자만 든 `p`가 블록으로 남는다. 이전에는 버렸다. 내용 없는 `pre`는 빈 `codeBlock`이 된다.
- 자기 export의 callout, toggle, quote, 문단 children, `codeBlock` `wrap`이 구조대로 읽힌다. 이전에는 평탄한 문단이었다.
- 중첩은 `MAX_NESTING_DEPTH`(64)에서 평탄화한다. 이전 표 옆 블록에는 깊이 가드가 없었다.
- 경고는 내지 않는다.
- `iframe` 블록이 url 없이 붙는다. 표 경로는 변환기에 iframe 설정 `{}`를 넘겨 호스트의 `iframeEmbed`를 받지 않으므로 url이 허용되지 않는다. 일반 html 붙여넣기는 받는다.
- `importHtml`이 문서 전체를 거절하는 값은 표 붙여넣기를 막지 않는다. 무효 선택 필드(`data-geul-text-color="red"` 등)는 그 필드만 빠진다. `file:`·`cid:` 이미지처럼 url이 무효인 미디어 블록은 빠진다.

바뀌지 않는 점:

- 표 읽기 규칙. 짧은 행은 빈 셀로 채운다. 셀 없는 빈 `<table>`은 무시한다. 레이아웃 표는 풀어 안쪽 데이터 표를 읽는다. `th`는 header 행을 만들지 않고 `td`의 `text-align`은 `align`이 된다. 크기 상한과 `CLIPBOARD_TABLE_INVALID` 거절도 같다.
- TSV 경로와 `NOT_TABULAR` 판정.
- 이미 `importHtml`과 같았던 입력. `p`·`span` 색, 소스 공백, h1–h3, 중첩 `ul`, `li` 안 `p`·`pre`·`hr`, `div` `style`, 표 뒤 `p`·`ul`, caption, 표 둘, `javascript:` 링크, 원시 `details`.
- `ClipboardContentBlock` 타입. RD-004가 이미 model의 모든 비표 블록을 허용했다.
- 저장 문서 형식.

core:

- 표 붙여넣기가 model의 모든 비표 블록(`quote`, `callout`, `checkListItem`, `toggleListItem`, 미디어 4종, `iframe`, 최상위 `codeBlock`·`divider`)을 받는다. 이전에는 `quote` 등과 최상위 `codeBlock`·`divider`를 `CLIPBOARD_CONTENT_INVALID`로 거절하고 문서를 바꾸지 않았다.
- 뮤테이션 전에 새 type과 기존 type을 model로 검증한다. model 프로브 위반은 `Clipboard <type> block <field> is invalid: ...`로, 새 type의 `content` inline 위반(빈 텍스트 런 등)은 `Clipboard <type> block content <reason>`으로 거절한다. 리프 블록(`codeBlock`, `divider`, 미디어, `iframe`)의 children은 거절한다.
- 표 안 캐럿은 `content`를 가진 모든 블록을 셀 줄로 합친다. 줄 정책은 셀 안 html 붙여넣기와 같다. `divider`·미디어·`iframe`은 줄이 없다.
- 막은 타입 검사가 새 type과 모든 children을 본다.
- id는 최상위 문단·제목을 빼고 `createId`로 발급한다. 부모가 자식보다 먼저다. 이전 목록 항목 children은 자식이 먼저였다.

소비자 영향:

- `parseClipboardTable` 결과에 `switch (block.type)`을 쓰는 소비자는 `quote`, `callout`, `checkListItem`, `toggleListItem`, 미디어, 최상위 `codeBlock`·`divider`를 처리해야 한다. 이전에는 이 type이 나오지 않았다. `codeBlock`·`divider`는 목록 항목 children에서만 나왔다.

알려진 한계(`importHtml` 변환기 결함, #336 계열):

- `div`·`span`·`b`·`a`가 감싼 `ul`·`ol`이 목록 항목이 아니라 문단이 된다. Google Docs 복사 모양이 이 경로다. 이전 클립보드 순회는 보존했다. 표 없는 붙여넣기와 `importHtml`은 이미 같은 결과다.
- 인용 안 인라인 래퍼가 품은 표가 표로 나오지 않는다. 다른 표가 없으면 `NOT_TABULAR`다. 이전 클립보드 순회는 표로 읽었다.
- 셀 안 `details`·`figure` 경계에 줄바꿈이 생긴다. `<td>s<details>d</details></td>`는 `s`, 줄바꿈, `d`다. 이전에는 `sd`였다.
