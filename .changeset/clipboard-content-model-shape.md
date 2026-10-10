---
"@cp949/geul-io": minor
"@cp949/geul-core": patch
---

`ClipboardContent`의 표 아닌 블록을 model `Block` 모양으로 바꾼다. 공개 타입이 깨진다.

깨지는 점:

- `codeBlock`의 `text: string`이 `content: [{ text }]`로 바뀐다. 마크 없는 런 하나다. 이전 `text` 값은 `content[0].text`다.
- 표 아닌 모든 블록에 `id: string` 필드가 생긴다. 파서가 호출마다 `clipboard-1`, `clipboard-2`처럼 임시값을 붙인다. 같은 입력은 같은 id를 낸다. 문서 안에서 안정하지 않다. core가 붙여넣을 때 재발급한다. 표 variant `{ type: "table"; data: TabularData }`에는 id가 없다.
- `ClipboardContentBlock`이 넓어진다. model의 모든 비표 블록 타입(quote, callout, 미디어 등)과 그 필드(`textAlignment` 등)를 허용한다. 소비자의 `switch (block.type)`이 새 타입을 처리하지 않으면 타입 오류가 난다.
- `children`은 이전처럼 `readonly ClipboardContentBlock[]`다. 표도 들 수 있다.

바뀌지 않는 점:

- `parseClipboardTable`이 읽는 내용과 붙여넣기 결과는 같다. 파서는 이전처럼 paragraph, heading, `bulletListItem`, `numberedListItem`, 목록 children 안 `codeBlock`·`divider`, table만 낸다.
- 문단·제목·목록 항목의 `content`, `level`, `textColor`, `backgroundColor`, `startNumber`, `children`은 이름과 값이 같다.

core:

- core는 새 모양을 소비한다. 입력 id는 쓰지 않는다.
- 파서가 내지 않는 타입(quote, callout 등)은 `CLIPBOARD_CONTENT_INVALID`로 거절한다. 문서를 바꾸지 않는다. 표 안 캐럿도 같다. 이 범위는 후속 작업에서 넓힌다.
- `codeBlock.content`에 커스텀 inline 원소가 있으면 같은 코드로 거절한다. 마크 없는 텍스트 런만 받는다.
- 정정: 위 "바뀌지 않는 점"의 파서 출력 범위와 core의 거절은 이 changeset 시점의 서술이다. `clipboard-table-delegation`이 둘 다 넓힌다.
