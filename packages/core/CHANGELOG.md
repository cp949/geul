# @cp949/geul-core

## 0.2.0

### Minor Changes

- 26982d1: 클립보드 표 옆 블록을 `importHtml` 블록 변환기로 읽는다. `parseClipboardTable`이 이전에 나오지 않던 블록 type을 낸다.

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
  - `iframe` 블록이 url 없이 붙는다. 표 경로는 변환기에 iframe 설정 `{}`를 넘겨 호스트의 `iframeEmbed`를 받지 않으므로 url이 허용되지 않는다. 일반 html 붙여넣기는 받는다. (이 차이는 같은 릴리스의 `clipboard-table-iframe-embed` changeset으로 해소된다.)
  - `importHtml`이 문서 전체를 거절하는 값은 표 붙여넣기를 막지 않는다. 무효 선택 필드(`data-geul-text-color="red"` 등)는 그 필드만 빠진다. `file:`·`cid:` 이미지처럼 url이 무효인 미디어 블록은 빠진다.

  바뀌지 않는 점:

  - 표 읽기 규칙. 짧은 행은 빈 셀로 채운다. 셀 없는 빈 `<table>`은 무시한다. 레이아웃 표는 풀어 안쪽 데이터 표를 읽는다. `th`는 header 행을 만들지 않고 `td`의 `text-align`은 `align`이 된다. 크기 상한과 `CLIPBOARD_TABLE_INVALID` 거절도 같다.
  - TSV 경로와 `NOT_TABULAR` 판정.
  - 래퍼(`div`·`span`·`b`·`a`) 안의 `ul`·`ol`은 목록 항목이다. Google Docs 복사 모양이 이 경로다. 변환기도 같게 고쳤다(`io-html-wrapped-block-structure`).
  - 인용 안 인라인 래퍼(`span`·`b`·`a`)가 품은 표는 표다. `quote`의 children 표로 나온다.
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

  알려진 한계:

  - 셀 안 `details`·`figure` 경계에 줄바꿈이 생긴다. `<td>s<details>d</details></td>`는 `s`, 줄바꿈, `d`다. 이전에는 `sd`였다.

### Patch Changes

- b7bdc56: 색이 다른 인접 `span`의 `textColor`·`backgroundColor`가 첫 색으로 합쳐지던 결함을 고친다.

  - `importHtml`이 `<span style="color:#ff0000">a</span><span style="color:#0000ff">b</span>`를 `a`(#FF0000), `b`(#0000FF) 두 조각으로 읽는다. 이전에는 `ab` 한 조각에 첫 색이었다. VS Code 복사처럼 구문 강조 색이 `span`마다 다른 HTML이 색을 유지한다.
  - 같은 판정을 쓰던 model `appendOrMergeInlineItem`·`sameMarks`가 색 값까지 비교한다. 같은 색 인접 `span`은 계속 한 조각이다.
  - core `modelToTiptap`이 색이 다른 인접 조각을 가진 문서를 `contains adjacent inline runs with identical marks`로 거절하던 동작을 없앴다. `tiptapToModel`과 표 셀 코덱의 병합도 색이 다른 조각을 합치지 않는다.
  - `canonicalizeTextMarks`의 중복 제거는 그대로다. 한 조각에 같은 종류 색이 둘이면 앞의 것만 남는다.

- 896db42: 자식이 있는 블록의 끝에 여러 블록 HTML·Markdown을 붙이면 자식이 원래 부모에서 떨어지던 결함을 고친다.

  - 끝 캐럿에 붙이면 빈 문단이 생기고 기존 자식이 그 빈 문단으로 넘어갔다. 이제 열린 블록은 새 블록이 첫 자식이 되고 기존 자식은 그 뒤에 남는다.
  - 접힌 toggle의 끝에 붙이면 새 블록이 뒤 형제가 되고 숨은 자식은 toggle에 남는다.
  - heading·quote·목록 항목·toggle의 타입과 attrs가 유지된다. 자식 있는 빈 문단은 빈 문단을 유지한다.
  - 같은 블록 안 범위가 블록 끝에서 끝나면 범위를 지운 뒤 같은 규칙으로 붙는다. 삭제와 삽입은 undo 1회다.
  - 시작·중간 캐럿, 자식 없는 블록, 다른 블록에 걸친 범위, 평문 붙여넣기, drop은 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- 991dc90: `enabledBlockTypes`가 막은 블록 타입이 든 html·Markdown 붙여넣기가 허용 블록까지 잃거나 범위 선택 글자를 지우던 결함을 고친다.

  - 막은 타입이 하나라도 든 `text/html`은 같은 클립보드의 `text/plain`으로 폴백한다. 평문이 Markdown으로 감지되고 그 타입이 허용이면 평문 대신 블록으로 들어간다. 이전에는 붙여넣기가 조용히 사라졌고, 범위 선택이면 선택한 글자만 지워졌다. 허용 블록만 골라 넣지는 않는다.
  - 막은 타입이 든 Markdown 평문은 블록으로 바꾸지 않고 원문 줄을 평문으로 넣는다. 이전에는 붙여넣기를 소비하고 아무것도 넣지 않았다.
  - 막은 타입만 든 html도 `text/plain`이 함께 있으면 평문이 들어간다. 평문이 없으면 이전처럼 문서가 바뀌지 않는다.
  - 허용 타입만 든 입력과 `enabledBlockTypes` 미지정 편집기의 붙여넣기는 이전과 같다.

- b1d39c7: 표 셀 안에 여러 블록 html을 붙이면 블록이 표 밖으로 빠지거나 붙여넣기가 사라지던 결함을 고친다.

  - 셀 안 캐럿이나 같은 셀 안 범위에 여러 블록 `text/html`을 붙이면 블록 사이를 줄바꿈(hardBreak)으로 이어 셀 안에 넣는다. 이전에는 문단 여러 개의 나머지가 표 뒤 문단이 됐고, 목록 여러 항목은 붙여넣기가 사라졌다.
  - 문단·heading·quote·목록 항목·callout·codeBlock의 내용이 문서 순서로 이어진다. 중첩 항목은 부모 다음 줄이다. 접두어와 들여쓰기는 붙이지 않는다. 블록 종류 서식은 남지 않는다.
  - 빈 블록, `<br>`뿐인 블록, 공백뿐인 블록, 구분선, 이미지, 동영상, 오디오, 파일은 줄을 만들지 않는다. 내용을 가진 블록이 둘 이상이면 줄이 하나만 남아도 셀 안에 넣고 표 뒤에 빈 문단을 만들지 않는다. 줄 안 마크(굵게, 링크, 글자색 등)는 유지된다. 캐럿 위치의 마크는 이어지지 않는다. 무효 문자는 지운다.
  - 한 블록 html, 표가 들어 있는 html, 서식 없이 붙여넣기(Ctrl+Shift+V)와 여러 셀을 고른 상태(CellSelection)는 이전과 같다.
  - 붙여넣기 뒤 선택은 삽입 끝이다. undo 1회로 복원된다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 6fc7747: 표 셀 안 한 블록 HTML 붙여넣기·drop이 색 마크와 `<pre>` 줄바꿈을 잃던 결함과, 빈 HTML이 함께 온 평문 drop이 사라지던 결함을 고친다.

  - 셀 안에 한 블록 HTML을 붙이거나 drop하면 여러 블록과 같은 방식으로 넣는다. 글자색·배경색 마크가 유지된다.
  - `<pre>`의 줄바꿈이 공백이 되지 않고 `hardBreak`로 들어간다. code 마크는 붙지 않는다.
  - 소스에 개행이 든 문단(`<p>one\ntwo</p>`)은 공백 하나로 접힌다. `<br>`만 `hardBreak`로 들어간다(`@cp949/geul-io` 수정).
  - 스타일 기반 서식(`font-weight:700` 등)과 `<del>`·`<strike>`는 마크로 읽는다(`@cp949/geul-io` 수정). 표 밖 붙여넣기와 같은 기준이다. 링크는 `href`만 유지한다.
  - `<b>`·`<i>`·`<u>`·`<s>`·`<code>`·제목·목록·`<br>`와 빈 문단·구분선·이미지뿐인 HTML은 이전과 같다.
  - 빈 HTML이 함께 온 평문을 drop하면 평문이 drop 위치에 들어간다. `<meta>`뿐인 HTML, 빈 문단, 구분선, 이미지가 해당한다. 이전에는 문서가 그대로였다.
  - 한 줄 평문에는 drop 위치의 마크가 입혀진다. 여러 줄은 일반 블록 배치와 셀 안 `hardBreak`를 따른다.
  - HTML에 내용이 있으면 평문은 쓰지 않는다. 내부 드래그, 파일 동반, 평문 없음도 이전과 같다.
  - 구분선·이미지 HTML과 평문을 붙여넣으면 구분선·이미지가 생기지만, drop은 평문을 넣는다.
  - 줄 양끝의 공백과 개행은 자른다. `<p>\n      Some text here\n    </p>`는 `Some text here` 하나다. 줄 안쪽의 개행·연속 공백·들여쓰기는 공백 하나로 접힌다. `<br>`는 `hardBreak`다.
  - Google Docs 복사의 굵지 않은 `<b style="font-weight:normal">` 래퍼는 이제 굵게가 아니다(`@cp949/geul-io` 수정). 표 밖 붙여넣기와 여러 블록도 같다.
  - `<title>`만 든 HTML은 `<title>` 텍스트가 문단이 되어 셀에 들어가고 평문은 쓰이지 않는다. 표 밖 붙여넣기와 같다.
  - 외부 복사의 색(Chrome의 `color:rgb(0,0,0)`, VS Code의 글자색)이 글자색·배경색 마크로 들어간다. 이전에는 버렸다. 표 밖 붙여넣기와 같은 기준이다.
  - 저장 문서 형식은 바뀌지 않는다.

- 2feb3df: 여러 셀을 고른 상태(CellSelection)에서 서식 있는 html을 붙이면 붙여넣기가 사라지던 결함을 고친다.

  - html 인라인 내용이 선택을 대체한다. 선택한 모든 셀의 내용을 비우고 문서 순서 첫 셀에 넣는다. 이전에는 문서가 그대로였다.
  - 줄 안 마크(굵게, 링크, 글자색 등)는 html의 것을 유지한다. 첫 셀의 기존 텍스트와 마크는 대체된다.
  - 여러 블록, 목록, `<pre>`는 줄 사이를 줄바꿈(hardBreak)으로 이어 첫 셀에 넣는다. 블록 종류 서식은 남지 않는다.
  - 셀 노드·병합 값·`cellId`와 셀의 글자색·정렬·배경 attrs는 유지된다.
  - 바꿀 줄이 없는 html(빈 문단 여러 개, 무효 문자뿐인 문단 여러 개, html 해석 실패)은 평문을 넣는다. 평문도 비면 이벤트만 소비한다.
  - 정리 뒤 내용이 없는 html(빈 문단 하나, 구분선, 이미지)은 이전과 같다. 평문이 있으면 평문을 넣는다.
  - 서식 없이 붙여넣기(Ctrl+Shift+V), html 없는 평문, 표 html·TSV 붙여넣기, 셀 안 캐럿·범위 붙여넣기는 이전과 같다.
  - 붙여넣기 뒤 선택은 첫 셀 삽입 끝이다. undo 1회로 복원된다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 85680e9: 여러 셀을 고른 상태(CellSelection)에서 평문을 붙이면 붙여넣기가 사라지던 결함을 고친다.

  - 평문 정리본이 선택을 대체한다. 선택한 모든 셀의 내용을 비우고 문서 순서 첫 셀에 넣는다. 이전에는 문서가 그대로였다.
  - 셀 노드·병합 값·`cellId`와 셀의 글자색·정렬·배경 attrs는 유지된다.
  - 여러 줄 평문은 줄 사이를 줄바꿈(hardBreak)으로 이어 첫 셀에 넣는다. 무효 문자는 지운다. 정리본이 비면 이벤트만 소비한다.
  - `text/html`이 없거나 빈 내용이면 이 규칙을 따른다. 서식 없이 붙여넣기(Ctrl+Shift+V)는 html이 함께 와도 같다. 서식 있는 html 일반 붙여넣기와 셀 조각 붙여넣기는 이전과 같다.
  - 붙여넣기 뒤 선택은 첫 셀 삽입 텍스트 끝이다. undo 1회로 복원된다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 298cfc0: 클립보드 표 옆 문단·제목·목록 항목·블록 자식 없는 `div`의 자기 `style` 색과 서식을 `importHtml`과 같게 읽고 편집기에 남긴다.

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

- 94e11c5: 표 셀 안 캐럿에 목록과 표가 든 클립보드를 붙일 때 목록 항목 글자를 셀에 남긴다.

  - 수정 전에는 셀 안 캐럿 붙여넣기가 문단·제목만 셀에 합치고 목록 항목과 그 `children`을 버렸다. 거절 통지도 없었다.
  - 목록 항목(중첩 `children` 포함)은 문단처럼 셀 줄이 된다. `children`은 부모 다음 줄이고 깊이 우선이다.
  - 표 앞 줄은 좌상단 셀 앞에, 표 뒤 줄은 우하단 셀 뒤에 읽기 순서로 붙는다. 번호·글머리·들여쓰기는 남기지 않는다.
  - 목록 항목의 블록 색은 줄 텍스트의 색 마크가 된다. 안쪽의 같은 종류 색 마크가 이긴다.
  - 목록 항목 `children` 안 표는 표 개수에 든다. 최상위 표가 있는데 더해지면 `CLIPBOARD_CONTENT_INVALID`로 거절하고 문서를 바꾸지 않는다. `onPasteRejected`가 불린다. 최상위 표가 없으면 붙여넣기 확장이 먼저 물러나 통지하지 않는다.
  - 한계: 목록 모양은 셀에 남지 않는다. 글자만 남는다.

- 91d66d2: `ClipboardContent`의 표 아닌 블록을 model `Block` 모양으로 바꾼다. 공개 타입이 깨진다.

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

- d760ad0: 클립보드 표 옆 목록 항목 안 `pre`·`hr`를 항목의 자식 `codeBlock`·`divider`로 만든다.

  - `<ul><li>t<pre><code class="language-ts">a(줄바꿈)  b</code></pre></li></ul>` 옆에 표가 있으면 `pre` 글자가 항목 content에 붙고 줄바꿈·들여쓰기가 공백 하나로 접혔다. 이제 항목 content `t`와 자식 `codeBlock`(`language` `typescript`, 줄바꿈·들여쓰기 보존)이다.
  - `<li>t<hr></li>`는 `hr`가 사라졌다. 이제 자식 `divider`다.
  - 첫 자식이 `pre`·`hr`인 항목은 빈 content와 자식 블록이다. `div`·`blockquote`·중첩 목록 안도 같다.
  - 원인: 클립보드 `ClipboardContentBlock`에 `codeBlock`·`divider`가 없었고 `isBlockLevelNode`가 `pre`·`hr`를 블록으로 보지 않았다.
  - io: `ClipboardContentBlock`에 `codeBlock`(`text`, `language?`)과 `divider`를 더한다. 목록 항목 children에서만 나온다. 표 밖 최상위 `pre`·`hr`는 이전과 같다.
  - io: `pre`의 `language` 선택 규칙을 함수로 추출해 `importHtml`과 공유한다. `importHtml` 결과와 경고는 바뀌지 않는다.
  - io: `pre`의 `wrap`·`caption`·`id`는 읽지 않는다. `figure` 안 `pre`의 `figcaption` 글자는 `codeBlock.caption`이 아니라 별도 자식 문단으로 남는다.
  - io: 코드 글자는 줄바꿈·들여쓰기·Tab을 보존하고 무효 코드포인트만 지운다. 내용 없는 `pre`는 자식 블록을 만들지 않는다. `importHtml`은 빈 `codeBlock`을 만들 수 있다.
  - core: 목록 항목 자식 `codeBlock`·`divider`를 `blockGroup` 안 노드로 넣는다. 최상위 `codeBlock`·`divider`는 `CLIPBOARD_CONTENT_INVALID`로 거절하고 문서를 바꾸지 않는다.
  - core: 표 안 캐럿에서 `codeBlock`은 글자의 줄마다 셀 줄이 되고 `divider`는 줄이 없다.
  - 표 밖 캐럿에서 `enabledBlockTypes`가 `codeBlock` 또는 `divider`를 막으면 붙여넣기는 평문 폴백으로 처리된다. 캐럿이나 선택이 표 안이면 막은 타입을 검사하지 않아 셀 줄로 붙는다.
  - `li` 안 `img` 등 미디어는 클립보드에 미디어 블록 타입이 없어 이전처럼 사라진다.
  - 정정: 위 io·core 문장 중 최상위 `pre`·`hr`, 읽지 않는 속성, 내용 없는 `pre`, 최상위 거절, `li` 안 미디어 서술은 이 changeset 시점의 서술이다. `clipboard-table-delegation`이 모두 바꾼다.
    - 최상위 `pre`·`hr`도 `codeBlock`·`divider`가 된다. core가 거절하지 않는다.
    - `wrap`·`caption`·`data-geul-block-id`를 읽는다. `figure` 안 `figcaption`은 `codeBlock.caption`이다.
    - 내용 없는 `pre`는 빈 `codeBlock`이 된다.
    - `li` 안 `img`는 자식 `image`가 된다.

- cb1a318: 표가 든 `text/html` 붙여넣기도 호스트의 `iframeEmbed` 설정으로 표 옆 `iframe` 블록의 url을 판정한다.

  - io: `parseClipboardTable` 입력에 선택 필드 `iframeEmbed?: IframeEmbedConfig`를 더한다. 추가형이라 기존 호출은 그대로다. 필드를 주지 않으면 이전처럼 url 없는 `iframe` 블록이다.
  - core: `TablePasteExtension`이 편집기 옵션 `iframeEmbed`를 `parseClipboardTable`에 넘긴다. 이전에는 표 없는 붙여넣기만 호스트 설정을 따라 같은 `iframe`이 표 유무에 따라 다르게 판정됐다.

- b67b00f: codeBlock과 텍스트 블록이 합쳐질 때 개행이 사라지거나 내용이 쪼개지던 결함을 고친다.

  - 여러 줄 codeBlock을 앞뒤 문단·제목·인용에 Backspace·Delete로 합치면 개행이 줄바꿈(hardBreak)으로 남는다. 이전에는 화면은 한 줄, export는 두 줄이었고 다음 입력에서 개행이 공백으로 바뀌었다.
  - divider·표를 건너뛴 Backspace의 대상이 codeBlock이면 문단이 남고 codeBlock 내용을 앞에 붙인다. 이전에는 문단이 codeBlock에 날것으로 들어가 줄바꿈 뒤가 새 블록으로 쪼개지고 블록 id와 서식을 잃었다.
  - divider·표를 건너뛴 Delete로 codeBlock을 합쳐도 개행이 줄바꿈으로 남는다.
  - 문단 중간부터 codeBlock 안까지 범위를 잡고 입력·삭제·Enter·붙여넣기를 하거나 codeBlock 조각을 문단으로 끌어 옮겨도 개행이 줄바꿈으로 남는다. `setText`에 개행을 넘겨도 같다.
  - codeBlock에서 시작해 그 밖까지 걸친 범위에서 Enter를 누르면 범위를 지운 뒤 그 자리에서 Enter를 누른 것과 같다. 이전에는 범위만 지우고 줄을 나누지 않았다.
  - 저장 문서 형식은 바뀌지 않는다. 각 조작은 undo 한 번으로 되돌아간다.

- a7eb2d3: 코드 블록에 걸친 범위에 여러 블록 HTML을 붙이면 둘째 블록 이후가 형제로 놓이도록 고친다.

  - 시작이 코드 블록 밖인 범위에 HTML을 붙이면 범위를 대체해 비코드 범위와 같은 규칙으로 삽입한다. 이전에는 둘째 블록이 앞 블록의 자식이 되었다.
  - 목록·heading·코드 블록 HTML의 서식이 보존된다. 이전에는 서식이 사라졌다.
  - 끝 코드 블록의 남은 텍스트는 코드 블록으로 남는다.
  - 시작이 자식 블록이면 새 블록은 그 자식과 같은 층위의 형제다.
  - 시작이 코드 블록 안인 범위, 캐럿이 코드 블록 안인 붙여넣기, Markdown·평문 붙여넣기는 바뀌지 않는다.
  - 저장 문서 형식은 바뀌지 않는다.

- c473b7a: `code` 글자가 색 마크와 함께 있어도 편집기 문서가 스키마상 유효하게 한다.

  - 수정 전 `code` 마크는 모든 마크와 배타였다. model이 허용하는 `code`+`textColor`·`backgroundColor` 조합은 표 셀 안팎 붙여넣기와 초기 문서 로드에서 `doc.check()`가 `Invalid collection of marks for node text`를 던졌다.
  - 이제 `code`는 `textColor`·`backgroundColor`와 함께 걸 수 있다. 나머지 마크와의 공존은 `code-mark-full-coexistence` changeset이 다룬다.
  - `code` 글자에 색을 입힐 수 있고 `toggleCode`는 색을 지우지 않는다. 접힌 캐럿에서 `code` 위에 색을 켜도 거절하지 않는다.
  - 커스텀 스타일 마크도 `code`와 함께 걸 수 있다. model이 이미 허용하는 조합이다.
  - model 규칙과 저장 문서의 형식은 그대로다.

- f47708f: `code` 글자가 `bold`·`italic`·`underline`·`strike`·`link`와 함께 있어도 편집기 문서가 스키마상 유효하게 한다.

  - 수정 전 `code` 마크는 이 다섯 마크와 배타였다. model, io, 마크다운이 허용하는 조합은 초기 문서 로드에서 `doc.check()`가 `Invalid collection of marks for node text: bold,code`를 던졌고, 표 밖 붙여넣기(`<b><code>x</code></b>`, `<a href><code>x</code></a>`)는 처리되지 않은 `RangeError`를 냈다.
  - 이제 `code`는 다른 마크를 배제하지 않는다. 저장 문서의 형식과 model 규칙은 그대로다. 이전에 열리지 않던 문서가 열린다.
  - 동작 변경: `toggleCode`는 `bold`·`italic`·`underline`·`strike`를 지우지 않는다. `code` 글자에 굵게·기울임·밑줄·취소선·링크를 걸 수 있다. 접힌 캐럿에서 `code` 위에 이 마크를 켜도 `COMMAND_NOT_APPLICABLE`을 반환하지 않는다.
  - 표 셀 안 html 붙여넣기는 `bold`+`code`를 `code`만 남기지 않고 둘 다 유지한다. 표 밖과 같다.

- 5b51236: codeBlock 안에 제어문자가 섞인 평문을 붙이면 붙여넣기가 사라지던 결함을 고친다.

  - 캐럿이 codeBlock 안이거나 시작이 codeBlock 안인 범위에 제어문자나 짝 없는 surrogate가 섞인 평문을 붙이면 무효 문자만 지운 평문이 선택을 대체한다. 이전에는 문서가 그대로였고 붙여넣기가 사라졌다.
  - Tab과 줄바꿈은 코드 내용이라 지우지 않는다.
  - 제어문자만 있는 붙여넣기는 문서를 바꾸지 않는다. 이벤트는 소비한다.
  - 유효한 평문은 이전처럼 PM 기본 처리에 맡긴다.
  - 저장 문서 형식은 바뀌지 않는다.

- 3790344: codeBlock에 걸친 범위에 제어문자가 섞인 한 줄 평문을 붙이면 붙여넣기가 사라지던 결함을 고친다.

  - 시작이 codeBlock 밖인 범위에 제어문자나 짝 없는 surrogate가 섞인 한 줄 평문을 붙이면 무효 문자를 지운 평문이 범위를 대체한다. 이전에는 문서가 그대로였고 붙여넣기가 사라졌다.
  - codeBlock `NodeSelection`·`AllSelection`처럼 직접 삽입이 안 되는 선택의 여러 줄 평문도 같다.
  - 제어문자만 있는 붙여넣기는 문서를 바꾸지 않는다. 이벤트는 소비한다.
  - 유효한 한 줄 평문은 이전처럼 PM 기본 처리에 맡긴다.
  - 캐럿이 codeBlock 안일 때와 시작이 codeBlock 안인 범위는 바뀌지 않았다.
  - 저장 문서 형식은 바뀌지 않는다.

- b6fc175: codeBlock 안에 Tab이 든 평문이나 html 표를 붙이면 표 블록이 생기던 결함을 고친다.

  - 캐럿이나 범위 시작이 codeBlock 안이면 표 붙여넣기가 물러난다. 평문이 코드 텍스트로 들어간다. 이전에는 코드 뒤에 표 블록이 생겼다.
  - 코드 내용 끝이나 빈 codeBlock에서 시작하는 범위도 같다.
  - 탭 들여쓰기 코드, `a⇥b` 한 줄, 스프레드시트 복사(html 표 + TSV)가 모두 해당한다.
  - 물러남은 거절이 아니다. `onPasteRejected`를 부르지 않는다.
  - 시작이 codeBlock 밖인 범위와 표 밖 붙여넣기는 이전처럼 표를 만든다.
  - 저장 문서 형식은 바뀌지 않는다.

- b02e19d: 다른 블록에서 시작해 자식 있는 블록의 끝에서 끝나는 범위에 여러 블록 HTML·Markdown을 붙이면 빈 블록이 자식을 가져가던 결함을 고친다.

  - 범위를 먼저 지운 뒤 캐럿에 붙인다. 끝 블록의 자식은 시작 블록의 자식으로 남고 새 블록이 그 첫 자식이 된다.
  - Backspace·글자 입력으로 같은 범위를 지울 때와 자식 귀속이 같다.
  - 시작 블록의 타입과 attrs가 유지된다. 삭제와 삽입은 undo 1회다.
  - 끝 블록에 자식이 없는 범위, 끝이 내용 끝이 아닌 범위, 같은 블록 범위, 평문 붙여넣기, drop은 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- de74d5f: `enabledBlockTypes`가 막은 타입을 `insertBlocks`·`replaceBlocks`·`updateBlock`에 넘기면 `RangeError`를 던지던 결함을 고친다.

  - 막은 타입이 블록 자체나 중첩 `children` 안에 있으면 `{ ok: false, error: { code: "EDITOR_FEATURE_UNAVAILABLE", message } }`를 돌려준다. 이전에는 `RangeError: Unknown node type: ...`가 났다.
  - `deny`·`allow` 모드 모두 같다.
  - 거절하면 문서와 undo 스택이 바뀌지 않는다.
  - 메시지는 `initialDocument`·`replaceDocument` 거절과 같은 형식이다.
  - `updateBlock`의 타입 변경은 이전과 같이 `COMMAND_NOT_APPLICABLE`이다.
  - 막은 타입이 없는 입력, 허용 타입 삽입·교체, `removeBlocks`·`moveBlocksUp/Down`과 `enabledBlockTypes` 미지정 편집기는 이전과 같다.

- af486d0: 여러 줄 평문을 drop하거나 코드 블록에 걸친 범위에 붙여도 기존 자식이 마지막 줄 블록으로 넘어가지 않도록 고친다.

  - 자식 있는 문단 중간에 drop하면 새 블록이 원본의 첫 자식이고 기존 자식은 그대로다. 이전에는 기존 자식이 마지막 줄 블록으로 넘어갔다.
  - 접힌 토글 라벨 중간에 drop하면 펼친 토글이 형제로 생긴다. 숨은 자식은 원본에 남는다.
  - drop은 현재 selection을 지우지 않고 삽입한 범위를 선택한다. undo 한 번으로 되돌아간다.
  - 시작이 코드 블록 밖인 범위에 여러 줄 평문을 붙이면 범위 끝 뒤의 자식이 마지막 줄 블록으로 넘어가지 않는다. 이 범위의 평문은 Markdown을 감지하지 않는다.
  - 내부 드래그, 파일·HTML이 함께 오는 drop, 한 줄 평문, 표 셀과 블록 사이 위치의 drop은 바뀌지 않는다.
  - 저장 문서 형식은 바뀌지 않는다.

- 0351d6e: 툴바 버튼처럼 편집기 밖 요소에 포커스가 있을 때도 `keyboardShortcuts`에 등록한 `Mod-z`·`Mod-Shift-z`·`Mod-y` handler가 내장 undo·redo보다 먼저 실행되도록 고친다.

  - 이전에는 undo·redo 폴백(`HistoryKeydownFallbackExtension`)이 등록 handler를 거치지 않고 내장 undo·redo를 바로 실행했다. 편집기 안 keydown에서만 handler가 먼저 실행됐다.
  - handler가 `true`를 반환하면 내장 undo·redo를 건너뛴다. `false`를 반환하면 내장 동작이 이어진다.
  - 폴백이 undo·redo로 판정한 세 키에서만 handler를 호출한다. 한글 두벌식 `ㅋ`(`KeyZ`)와 `Shift-Mod-z` 표기도 같다.
  - 읽기 전용·조합 입력 중 keydown, 입력 컨트롤에서 보낸 keydown, DOM selection이 이 편집기 안에 없는 keydown에서는 handler를 호출하지 않는다.
  - #307 변경(`keyboard-shortcuts-consumer-first`)의 한계 "툴바 등 편집기 밖에서 눌린 undo/redo fallback은 계약 밖"을 정정한다. 이제 계약 밖은 `beforeinput` `historyUndo` 경로(키 정보가 없다)와 열린 SlashMenu·EmojiPicker의 캡처 리스너다.
  - 한계: 편집기 밖 keydown에서는 undo·redo 키가 아닌 등록 키의 handler를 호출하지 않는다.
  - 공개 API 시그니처와 저장 문서 형식은 바뀌지 않는다.

- e743185: HTML이 블록을 만들지 못하면 같은 클립보드의 평문을 붙이도록 고친다.

  - 블록이 하나도 없는 HTML이나 가져오기에 실패한 HTML과 평문이 함께 오면 평문을 붙인다. 이전에는 붙여넣기가 조용히 사라졌다.
  - 폴백 후 규칙은 평문만 있는 붙여넣기와 같다. Markdown 감지와 여러 줄 배치가 적용된다.
  - 코드 블록에 걸친 범위는 Markdown을 감지하지 않고 평문을 그대로 붙인다.
  - 위험 URL·제어문자를 담은 HTML은 여전히 가져오지 않는다.
  - 빈 문단만 있는 HTML은 이전처럼 HTML이 우선이다.
  - 평문도 비어 있으면 이전처럼 문서를 바꾸지 않는다.
  - 저장 문서 형식은 바뀌지 않는다.

- 5689e4e: iframe 문서에 렌더한 편집기의 오버레이와 undo·redo가 메인 문서와 같게 동작한다. custom style `render`가 iframe 문서 요소를 반환해도 같다.

  - 바깥 pointerdown과 편집기 안 React 요소가 막은 Escape로 오버레이가 닫힌다.
  - 표 hover 뒤 편집기 밖으로 옮기면 행·열 핸들이 사라진다.
  - 블록 타입 메뉴, 표 행 메뉴, 표 그립 메뉴가 자동으로 닫히면 초점이 편집기로 돌아온다.
  - StaticToolbar의 ArrowLeft·ArrowRight·Home·End와 블록 타입 메뉴의 화살표 키가 초점을 옮긴다.
  - 스크롤 영역 밖 표 행·열 핸들이 숨는다.
  - iframe 블록의 Interact 버튼을 다시 누르면 상호작용이 풀린다.
  - 노드 판정을 전역 DOM 생성자 `instanceof` 대신 `nodeType` 기준으로 바꿨다. React가 iframe 문서에 그린 노드는 다른 realm 인스턴스라 판정이 거짓이었다.
  - iframe 문서의 편집기 밖 버튼에 초점이 있을 때 `Mod-z`가 undo하고 `Mod-Shift-z`·`Mod-y`가 redo한다.
  - custom style `render`가 iframe 문서로 만든 HTML 요소를 반환해도 그 태그와 속성으로 렌더한다. 편집기 위치와 무관하다.
  - core의 노드 판정도 `nodeType` 기준으로 바꿨다. iframe 문서가 만든 keydown 대상과 `render` 반환 요소에서 판정이 거짓이었다.

- 3ba5f52: `importHtml`이 `pre`·`code`의 무효 language 후보를 만나도 문서를 거절하지 않고 없는 것으로 본다.

  - `data-language`나 `class="language-*"`에 제어문자·짝 없는 surrogate가 있으면 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다. 이제 그 후보를 빼고 나머지 후보에서 우선순위대로 고른다.
  - `<pre data-language="a&#1;b" class="language-js">`는 language `javascript`인 `codeBlock`이다. 후보가 모두 무효면 language 없는 `codeBlock`이다.
  - 빠진 후보마다 `UNSAFE_ATTRIBUTE_REMOVED`를 반환한다. `attribute`는 `dataLanguage` 또는 `className`이고 `element`는 `pre` 또는 `code`다. 같은 노드의 `class`에 무효 토큰이 여럿이어도 한 건이고, 무효 토큰을 뺀 첫 토큰을 쓴다.
  - 무효 문자만 지운 값(`ab`)은 language로 쓰지 않는다.
  - 무효 후보는 `CODE_BLOCK_LANGUAGE_METADATA_IGNORED` 판정에 들지 않는다. 선택된 값은 유효하고 선택되지 않은 후보만 무효인 입력(`<pre data-language="js" class="language-a&#1;b">`)은 이전에도 성공했고 `CODE_BLOCK_LANGUAGE_METADATA_IGNORED`를 반환했다. 이제 그 경고 대신 `UNSAFE_ATTRIBUTE_REMOVED`를 반환한다.
  - 최상위 `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`가 같다.
  - 클립보드 파서(`parseClipboardTable`)는 같은 선택 규칙을 쓰고 경고는 내지 않는다. 선택된 값이 무효이고 다른 유효 후보가 있으면 이제 그 후보를 language로 쓴다.
  - core: `text/html`이 `pre`의 무효 language 후보만 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 language 없는 `codeBlock`이 붙고 `text/plain`은 쓰지 않는다.

- 0e9a15c: `importHtml`이 무효 미디어 url과 무효 `data-geul-*` 선택 표시 값 하나로 문서 전체를 거절하지 않는다.

  - `image`·`video`·`audio`의 `src`가 미디어 url 정책을 통과하지 못하면(`file:`, `cid:`, `javascript:` 등) 그 블록만 버리고 `UNSAFE_URL_REMOVED`를 반환한다. 이전에는 `HTML_DOCUMENT_INVALID`였다. `figure[data-geul-media-type="file"]` 안 `img`의 무효 `src`도 같다.
  - 색·정렬·callout `icon`·production 목록 시작 번호·미디어 `backgroundColor`·`textAlignment`·`previewWidth`·`aspectRatio`·표 셀 색·정렬·열 폭의 무효 값은 그 필드만 버리고 `UNSAFE_ATTRIBUTE_REMOVED`를 반환한다. `attribute`는 `data-geul-text-color` 같은 HTML 속성 이름이다. 무효 `data-geul-*` 색은 `style`의 색으로 되살리지 않는다.
  - `HtmlImportWarning`의 `UNSAFE_URL_REMOVED`는 `element`가 `"a" | "img" | "video" | "audio"`, `attribute`가 `"href" | "src"`로 넓어진다. 값만 늘어난다. `element === "a"`를 가정한 소비자는 좁히기가 필요하다.
  - 정규형 입력의 결과는 바뀌지 않는다. 중복 id, 중첩 깊이 초과, 표 격자 위반 같은 구조 위반은 계속 `HTML_DOCUMENT_INVALID`다.
  - 버린 미디어 블록의 `alt`와 `data-geul-media-type` 마커가 붙은 `figure`의 `figcaption` 글자는 경고 없이 함께 사라진다. 마커 없는 `figure`의 캡션 글자는 문단으로 남는다.
  - 클립보드 파서(`parseClipboardTable`)는 변환기 결과를 그대로 쓴다. 비표 블록마다 하던 재프로브(`modelSafeBlock`)를 지웠다. 경고는 내지 않는다. 결과는 같다. 단 두 목록 사이에 무효 `img`가 끼면 둘째 목록의 번호가 이어붙지 않고 1부터 다시 시작한다(`importHtml`로 `<ol>a</ol><ol>b</ol>`을 읽은 결과와 같다).
  - core: `text/html`이 `<img src="javascript:x">` 같은 무효 url만 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 그 이미지를 뺀 나머지 블록이 붙는다.

- 6ff09fc: `importHtml`이 `pre` 안 무효 문자를 만나도 문서를 거절하지 않고 지운다.

  - `<pre>a&#13;b</pre>`, `<pre>a&#1;b</pre>`, NUL 원문은 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다. 이제 `ab`인 `codeBlock`과 `UNSAFE_CODE_POINT_REMOVED` 경고를 반환한다.
  - 최상위 `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`가 같다. 경고 `element`는 무효 문자가 든 글자의 부모 태그다(`pre`, `pre > code`면 `code`).
  - CR은 줄바꿈으로 바꾸지 않고 지운다. `codeBlock`이 되는 `pre`의 Tab·LF는 코드 내용이라 남기고 경고도 없다. 인라인 글자로 평탄화되는 `pre`의 Tab 삭제는 경고한다(#354).
  - `data-language`의 무효 문자는 이 변경에서 거절을 유지했다. 이후 #353이 거절을 없앴다.
  - model: `sanitizeCodeBlockSource`를 공개한다. `isValidCodeBlockSource`가 거부하는 문자만 지우고 출력은 항상 검증을 통과한다.
  - io: 클립보드 `pre` 정제가 이 함수를 쓴다. 결과는 바뀌지 않는다.
  - core: 붙여넣기 `normalizeKeepingTabs`가 이 함수를 쓴다. 결과는 바뀌지 않는다.
  - core: `text/html`이 `pre` 안 무효 문자를 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 무효 문자를 지운 `codeBlock`이 붙고 `text/plain`은 쓰지 않는다. 지운 뒤 글자가 비면 빈 `codeBlock`이 붙는다(빈 `<pre></pre>`와 같다).

- ac59533: 인라인 atom만 든 문단에서 atom을 고르고 여러 줄 평문을 붙이면 블록 id가 바뀌던 결함을 고친다.

  - 인라인 atom을 선택한 상태로 여러 줄 평문을 붙이면 그 문단의 블록 id와 타입이 유지된다. 이전에는 문단 id가 새로 매겨졌다.
  - 첫 줄은 그 문단에 들어가고 나머지 줄은 Enter 분할 규칙의 새 블록이 된다. 자식이 있는 문단이면 새 블록이 기존 자식 앞의 첫 자식으로 놓인다.
  - 구분선 같은 블록 선택, 전체 선택, 여러 셀 선택, 표 셀 안, 한 줄 평문, drop은 이전과 같다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 59d4e80: `enabledBlockTypes`가 막은 `divider`·`table`을 `insertDivider`·`insertTable`·`pasteTabularData`로 넣으면 `TypeError`를 던지던 결함을 고친다.

  - `{ ok: false, error: { code: "EDITOR_FEATURE_UNAVAILABLE", message } }`를 돌려준다. 이전에는 `TypeError: Schema is missing table/tableRow/tableCell nodes` 등이 났다.
  - `deny`·`allow` 모드 모두 같고 `clearAfterBlockText` 옵션을 줘도 같다.
  - `divider`를 허용해도 `paragraph`를 막은 설정의 `insertDivider`는 `paragraph` 이름으로 거절한다.
  - 거절하면 문서와 undo 스택이 바뀌지 않는다.
  - 메시지는 `Block type "<type>" is disabled via CreateEditorOptions.enabledBlockTypes` 형식이다.
  - 허용 타입 삽입, 다른 쪽 타입만 막은 설정, `enabledBlockTypes` 미지정 편집기는 이전과 같다.

- 32a80f8: `keyboardShortcuts`에 내장 키와 같은 키를 등록하면 등록 handler가 내장 handler보다 먼저 실행되도록 고친다.

  - 등록 확장의 priority를 내장 확장보다 높게 둔다. 이전에는 일부 내장 키가 등록 handler보다 먼저 실행됐다.
  - 영향받던 키: Enter, Backspace·Delete 계열(Mod·Shift 조합 포함), codeBlock 안과 표 경계 범위의 Shift-Enter, codeBlock 안 서식 단축키(Mod-b·i·u·e, Mod-Shift-s).
  - handler가 `true`를 반환하면 내장 동작(표 경계·codeBlock 보호 포함)을 건너뛴다. `false`를 반환하면 내장 동작이 이어진다.
  - 겹침 경고 문구가 이 동작을 알린다.
  - 한계: 편집기 DOM에 도달한 keydown의 keymap 단계 기준이다. `beforeinput` `historyUndo` 경로와 열린 SlashMenu·EmojiPicker의 캡처 리스너는 계약 밖이다. 툴바 포커스의 undo·redo 키 폴백은 `history-fallback-consumer-shortcuts` 변경(#319)이 계약 안으로 옮겼다.
  - 한계: 조합 중(IME)·읽기 전용 상태의 keydown은 handler를 호출하지 않는다.
  - 한계: 키 표기가 다르면(`Mod-Shift-z` vs `Shift-Mod-z`) 겹침 경고가 나지 않을 수 있다. 동작은 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- c5138cf: 여러 줄 평문을 붙여넣거나 drop하면 둘째 줄 이후가 Enter 분할과 같은 위치에 놓이도록 고친다.

  - 문단 중간에 두 줄을 붙이면 둘째 줄이 다음 형제 블록이 된다. 이전에는 들여쓰기 없던 문단이 붙여넣기만으로 자식을 얻었다. Ctrl+V와 Ctrl+Shift+V 모두 같다.
  - 자식 있는 블록 중간에 붙이면 새 블록이 원본의 첫 자식이고 기존 자식은 그대로다. 이전에는 기존 자식이 마지막 줄 블록으로 넘어갔다.
  - 접힌 토글 라벨 중간에 붙이면 펼친 토글이 형제로 생긴다. 숨은 자식은 원본에 남는다.
  - 범위 선택은 Enter와 같은 기준으로 지운 뒤 붙인다. 붙여넣기는 undo 한 번으로 되돌아간다.
  - 무효 제어문자가 낀 여러 줄도 문자를 지운 뒤 같은 배치로 붙는다.
  - drop과 코드 블록에 걸친 범위의 자식 없는 블록도 같은 형제 배치다.
  - 한 줄 평문, HTML 동봉 붙여넣기, 빈 줄이 낀 Markdown 감지, 표 셀 안, 코드 블록 안은 바뀌지 않는다.
  - 저장 문서 형식은 바뀌지 않는다.

- 8ef0b7b: 표 밖에서 Ctrl+Shift+V(서식 없이 붙여넣기)가 `text/html`의 서식을 넣던 결함을 고친다.

  - 표 밖에서 서식 없이 붙여넣기를 하면 `text/html`이 함께 있어도 `text/plain`만 들어간다. 이전에는 Shift를 구분하지 않아 html의 서식이 들어갔다.
  - Shift 없는 붙여넣기, Shift+Insert, 평문 없이 html만 있는 클립보드는 이전처럼 html을 가져온다.
  - 평문 단독 클립보드의 Markdown 감지는 바뀌지 않는다. Shift는 html 분기만 건너뛴다.
  - 표 형태 html·TSV(표 붙여넣기)와 파일·이미지 붙여넣기는 Shift를 구분하지 않는다.
  - 표 셀 안·codeBlock 안·drop·`CellSelection`은 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- 2929983: 붙여넣기·drop 평문에서 단독 CR이 사라지고 제어문자 하나가 Markdown 감지를 끄던 결함을 고친다.

  - 단독 CR(`\r`)이 줄 경계로 처리된다. 이전에는 지워져 두 줄이 한 줄로 합쳐졌다. CRLF·CR·LF가 같은 배치다.
  - ESC 같은 Tab 외 제어문자가 섞여도 Markdown(heading·코드 펜스·문단 경계)이 감지된다.
  - Tab 처리는 이전과 같다. 줄 앞 Tab 들여쓰기, 마커 뒤 Tab, 코드 안 Tab은 구조와 내용을 유지한다. 인라인 본문에 Tab이 있으면 이전처럼 감지되지 않고 평문으로 들어간다.
  - 직접 삽입과 감지, drop이 같은 정리본을 본다. 단독 CR 평문 drop도 줄이 나뉜다.
  - 제어문자만 있는 붙여넣기는 이전처럼 문서를 바꾸지 않는다.
  - 저장 문서 형식은 바뀌지 않는다.

- e69cf05: 붙여넣기·drop이 사라지던 결함 셋을 고친다.

  - 표 셀에서 시작해 뒤 문단에서 끝나는 범위에 무효 문자(제어문자 등)가 든 html을 붙이면 정리본이 셀에 들어간다. 이전에는 범위만 지워지고 붙여넣기가 사라졌다.
  - 무효 문자가 든 평문·html을 문단·코드블록·표 셀에 drop하면 정리본이 들어간다. 결과는 같은 위치 붙여넣기와 같다. 코드블록에서는 Tab을 남긴다. 이전에는 drop이 사라졌다.
  - `pasteHandler`가 `defaultPasteHandler()`의 결과를 그대로 돌려줘도 붙여넣기가 남는다. `defaultPasteHandler()`는 처리했으면 `true`, 붙일 내용이 없으면 `false`를 돌려준다. 이전에는 한 줄 평문 같은 입력에서 `false`를 돌려줘 취소로 읽혔다.
  - 그 밖의 붙여넣기·drop 결과와 저장 문서 형식은 바뀌지 않는다.

- e3f70c2: 색 마크 캐럿에 한 줄 평문을 붙이면 색이 빠지던 결함을 고친다.

  - 글자색·배경색이 있는 위치에 한 줄 평문을 붙이거나 drop하면 삽입 텍스트에 색이 이어진다. 이전에는 색 없이 들어갔고, 같은 위치에 여러 줄을 붙이면 색이 이어졌다.
  - 표 안과 표 밖, Ctrl+V, Ctrl+Shift+V, 한 줄 평문 drop이 모두 같다.
  - 색 구간 안 범위 선택에 붙이면 범위 시작 위치의 색을 유지한다. 색이 없는 위치는 이전처럼 마크 없이 들어간다.
  - bold·link 등 다른 서식 상속, 직전에 켠 서식을 무시하는 동작, 빈 문단의 블록 id는 이전과 같다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- e4c9f09: 표 경계에 걸친 범위를 지울 때 라벨이 범위에 든 상위 블록이 타입과 attrs를 잃던 결함을 고친다.

  - 범위가 표 셀과 표 밖 블록에 걸치고 끝 블록이 상위 블록의 자식이면 상위 블록이 빈 문단으로 바뀌었다. 이제 heading 레벨·callout 아이콘·toggle 접힘·번호 시작·체크 상태를 유지한 빈 라벨로 남고 끝 블록은 그 자식으로 남는다.
  - 조부모 체인의 모든 상위 블록과 끝이 표 셀인 경우(표를 감싼 상위 블록)에도 같다. 끝 블록 앞의 형제 블록은 범위에 든 사이 블록이라 지우고 뒤 형제는 남긴다.
  - 끝 블록이 다른 상위 블록의 자식이면 앞 상위 블록으로 합류하던 결함과 끝 블록 텍스트를 전부 덮을 때 서브트리가 사라지던 결함도 같이 고친다.
  - Backspace·Delete·`Mod-Backspace`·`Mod-Delete`와 글자 입력·Cut·붙여넣기·`Shift-Enter` 경로에 같이 적용된다. 시작 쪽 거울, 같은 표 안 범위, 표 셀 선택, 표를 완전히 감싸는 범위는 이전과 같다.

- 60ea49d: 표 경계에 걸친 범위에서 글자 입력·IME 조합 시작·Cut·붙여넣기·끌어 놓기·Shift-Enter·`insertCustomInlineContent`가 문서를 망가뜨리던 결함을 고친다.

  - 범위가 표 셀과 표 밖 블록에 걸치면 이 동작들이 선택하지 않은 뒷부분 텍스트를 셀로 옮기거나 표를 지웠다. 이제 선택한 텍스트만 Backspace와 같이 지우고 삽입은 범위 시작의 캐럿에 한다.
  - Cut은 Copy와 같은 내용을 클립보드에 싣고 선택한 텍스트만 지운다. 붙여넣기는 먼저 지운 뒤 기존 경로가 캐럿 기준으로 이어 받는다. 표·TSV 붙여넣기는 undo가 2회 필요하고, 붙여넣기를 취소해도 선택한 텍스트는 지워진다(undo 1회로 복원).
  - 붙일 내용이 없는 붙여넣기는 선택을 지우지 않는다. 읽기 전용에서는 Cut·IME 조합 시작이 경계 범위를 지우지 않는다.
  - 내부에서 끌어 옮기는 drop은 문서를 바꾸지 않고 소비한다. 복사 드래그와 외부 drop은 이전과 같다.
  - `Shift-Enter`는 head 위치와 무관하게 지운 뒤 캐럿에 줄바꿈을 넣는다. 줄바꿈을 받을 수 없는 블록(코드 블록, h1)에서는 지우기만 한다.
  - 글자 입력은 입력 규칙(`> ` 등)보다 먼저 처리해 경계 범위에서 블록 변환을 일으키지 않는다.
  - 같은 표 안 범위, 표 셀 선택, 표를 완전히 감싸는 범위, 표 밖 범위는 이전과 같다.

- 4e2c732: 표 경계에 걸친 범위에서 Enter·Backspace·Delete가 문서를 망가뜨리던 결함을 고친다.

  - 범위가 표 셀과 표 밖 블록에 걸치면 Enter가 예외를 던지거나 표를 지웠다. 이제 문서를 바꾸지 않고 키만 소비한다.
  - 같은 범위에서 Backspace·Delete가 선택하지 않은 뒷부분 텍스트를 셀로 옮기거나 셀을 지웠다. 이제 선택한 텍스트만 지운다.
  - 표 안은 셀 텍스트만 지워 셀·행·열 구조를 유지한다. 표 밖은 일반 삭제하고 끝 블록은 텍스트만 줄어 남는다.
  - `Mod-Backspace`·`Mod-Delete`도 같다. 삭제는 단일 transaction이라 undo 1회로 복원한다.
  - 같은 표 안 범위, 표 셀 선택, 표를 완전히 감싸는 범위는 이전과 같다.

- c4d7c34: 표 셀 경계의 Backspace·Delete와 첫 블록이 표일 때의 범위 삭제가 캐럿을 문서 끝으로 보내던 결함을 고친다.

  - 셀 맨 앞 Backspace(`Mod-Backspace` 포함)와 셀 맨 끝 Delete(`Mod-Delete` 포함)가 키를 소비하고 문서·selection·undo 스택을 바꾸지 않는다. 이전에는 문서가 그대로인데 캐럿이 문서 끝으로 가고 빈 undo 항목이 남았다. 첫 셀·마지막 셀·빈 셀·중첩 위치 표에서도 수정 후 동작이 같다.
  - 같은 표 안 서로 다른 셀에 걸친 범위의 Backspace·Delete도 키를 소비하고 문서를 바꾸지 않는다. 한 셀 안 범위 삭제와 셀 중간 문자 삭제, 셀 맨 앞 Enter는 이전과 같다.
  - 첫 블록이 표이고 범위가 첫 셀 시작에서 문서 끝까지면 Backspace·Delete·Cut이 표 구조를 유지하고 텍스트만 지운다. 이전에는 삭제가 통째로 사라졌다.
  - 문서 검증이 실패해 변경을 되돌릴 때 selection과 stored mark도 되돌림 전 값으로 복원한다. 이전에는 캐럿이 문서 끝으로 갔다.

- 7d1791e: 표 셀 안에 제어문자가 섞인 평문을 붙이면 붙여넣기가 사라지던 결함을 고친다.

  - 표 셀 안 캐럿이나 같은 셀 안 범위에 제어문자나 짝 없는 surrogate가 섞인 평문을 붙이면 무효 문자와 Tab을 지운 평문이 선택을 대체한다. 이전에는 문서가 그대로였고 붙여넣기가 사라졌다.
  - 제어문자만 있는 붙여넣기는 문서를 바꾸지 않는다. 이벤트는 소비한다. 표 경계에 걸친 범위는 먼저 지워지므로 예외다.
  - 여러 줄은 유효한 여러 줄과 구조가 같다. 마지막 셀에서만 반영된다. 마지막이 아닌 셀·병합 셀·헤더 셀은 문서가 그대로다.
  - 유효한 평문은 이전처럼 PM 기본 처리에 맡긴다.
  - 셀 안 인라인 atom을 선택한 상태에서도 같다. 정리본이 atom을 대체한다.
  - `text/html`이 함께 오거나 `CellSelection`이면 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- 8c67733: 표 셀 위에 여러 블록 HTML을 drop하면 블록이 표 밖으로 빠지거나 drop이 사라지던 결함을 고친다.

  - 셀 안 위치에 여러 블록 `text/html`을 drop하면 블록 사이를 줄바꿈(hardBreak)으로 이어 그 셀에 넣는다. 이전에는 문단 여러 개가 첫 문단만 셀에 들어가고 나머지가 표 뒤 문단이 됐다. 목록 여러 항목은 drop이 사라졌다.
  - 같은 위치에 캐럿 붙여넣기를 한 결과와 문서가 같다.
  - 줄 안 서식(굵게·링크 등)은 HTML의 것이다. drop 위치의 서식은 이어지지 않는다.
  - drop 뒤 선택은 삽입 범위다. 현재 선택은 지워지지 않는다. undo 1회로 복원된다.
  - 한 블록 HTML, 내부 드래그, 파일을 함께 놓는 drop, 셀이 아닌 위치의 drop은 이전과 같다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- b072173: 표 셀 위에 여러 줄 평문을 drop하면 첫 줄만 셀에 들어가고 나머지가 표 뒤 문단이 되던 결함을 고친다.

  - 셀 안 위치에 외부 여러 줄 평문(`text/plain`만 있는 drop)을 놓으면 줄 사이를 줄바꿈(hardBreak)으로 이어 그 셀 안에 넣는다. 같은 위치 캐럿 붙여넣기와 문서가 같다. 이전에는 첫 줄만 셀에 넣고 나머지를 표 뒤 문단으로 만들었다.
  - 연속 개행은 줄바꿈 하나다. 앞·뒤 개행은 줄바꿈 하나로 남는다. 무효 문자는 지운다.
  - 서식(bold 등)은 drop 위치의 마크를 따른다. 현재 선택한 범위는 지우지 않는다.
  - drop 뒤 선택은 삽입한 범위다. undo 1회로 복원된다.
  - 한 줄 평문, `text/html`이 함께 오는 drop, 내부 드래그, 파일 drop, 셀 밖 위치는 이전과 같다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 1bafdbc: 표 셀 위에 표를 포함한 HTML을 drop하면 drop이 사라지던 결함을 고친다.

  - 셀 안 위치에 표가 든 `text/html`을 drop하면 표를 셀 단위 줄로 풀어 줄바꿈(hardBreak)으로 이어 그 셀에 넣는다. 문단 + 표, 표 + 문단, 문단 + 표 + 문단, 표 둘이 해당한다. 이전에는 문서가 그대로였다.
  - 표 안은 행 우선, 표 밖 블록과는 문서 순서다. 빈 셀과 공백뿐인 셀은 줄을 내지 않는다.
  - 표 구조(행·열·셀 id)는 그대로이고 표 뒤 문단이 생기지 않는다. 표 서식(병합·정렬·색)은 셀 안에 남지 않는다.
  - 셀 content의 줄 안 서식(굵게·링크 등)은 유지한다. drop 위치의 서식은 이어지지 않는다.
  - drop 뒤 선택은 삽입 범위다. 현재 선택은 지워지지 않는다. undo 1회로 복원된다.
  - 같은 위치에 붙여넣으면 표가 셀 전체를 대체한다. drop은 위치 삽입이라 결과 형태가 다르다.
  - 한 블록 HTML, 내부 드래그, 파일을 함께 놓는 drop, 셀이 아닌 위치의 drop은 이전과 같다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 280dd09: 표 셀 위에 표 하나만 든 HTML을 drop하면 내용이 표 밖으로 새거나 사라지던 결함을 고친다.

  - 셀 안 위치에 표 하나만 든 `text/html`을 drop하면 표를 셀 단위 줄로 풀어 줄바꿈(hardBreak)으로 이어 그 셀에 넣는다. 표가 든 HTML은 모두 같은 방식이다.
  - 이전에는 셀 안 문단이 둘이면 첫 문단만 셀에 들어가고 나머지가 표 밖 문단이 됐다. 셀 안 목록은 drop이 사라졌다. 2x2 표는 셀 사이 구분 없이 이어졌다.
  - 표 안은 행 우선이다. 셀 안 줄바꿈(`<br>`, `<pre>`의 개행)은 줄바꿈으로 남는다. 셀 content의 줄 안 서식(굵게·링크 등)은 유지한다.
  - 셀이 하나뿐인 표도 직접 넣는다. ASCII 공백뿐인 셀로 이루어진 표는 이전과 같이 문서가 바뀌지 않는다. NBSP뿐인 셀의 표는 PM 기본이 NBSP를 넣는다.
  - 셀 안 문단과 목록은 한 줄로 이어 붙는다(`<td><p>a</p><p>b</p></td>`는 `ab`). 이 변환은 이번에 바꾸지 않는다.
  - 표 서식(병합·정렬·색)은 셀 안에 남지 않는다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 00c911d: 표 셀 안에서 빈 `text/html`과 함께 붙인 평문이 사라지던 결함을 고친다.

  - 표 셀 안 캐럿이나 같은 셀 안 범위에서 `text/html`이 공백·`<meta>`·`StartFragment` 주석·빈 문단처럼 PM 파싱 결과가 빈 slice이면 `text/plain`이 셀에 들어간다. 이전에는 문서가 그대로였고 붙여넣기가 사라졌다.
  - 평문의 무효 문자와 Tab은 지운다. 제어문자만 있는 평문은 문서를 바꾸지 않는다. 표 경계에 걸친 범위는 먼저 지워지므로 예외다.
  - html이 실제 내용을 가지면 이전처럼 PM 기본이 html만 쓴다. 평문이 비면 이전과 같다.
  - 여러 줄은 마지막 셀에서만 반영되고 나머지는 표 뒤 문단이 된다. 마지막이 아닌 셀은 문서가 그대로다.
  - `CellSelection`이면 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- 1551d99: 표 셀 안에서 무효 문자가 든 `text/html`과 Ctrl+Shift+V 평문을 붙이면 사라지던 결함을 고친다.

  - 표 셀 안 캐럿이나 같은 셀 안 범위에서 붙인 내용의 제어문자·짝 없는 surrogate·DEL을 지우고 셀에 넣는다. 이전에는 문서가 그대로였고 붙여넣기가 사라졌다.
  - html의 서식(mark)은 유지한다. 무효 문자만 지운다.
  - Ctrl+Shift+V로 붙인 평문도 같다. 서식은 없다.
  - 지운 뒤 내용이 비면 `text/plain`이 셀에 들어간다. 평문도 없으면 문서를 바꾸지 않는다. 같은 셀 안 범위는 선택만 지워진다.
  - `CellSelection`·표 밖·codeBlock 안·drop은 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- d292d3c: 표 셀 안에 여러 줄 평문을 붙이면 줄이 표 밖으로 빠지거나 붙여넣기가 사라지던 결함을 고친다.

  - 셀 안 캐럿이나 같은 셀 안 범위에 붙이면 줄 사이를 줄바꿈(hardBreak)으로 이어 셀 안에 넣는다. 이전에는 마지막 셀이 첫 줄만 넣고 나머지를 표 뒤 문단으로 만들었고, 마지막이 아닌 셀은 붙여넣기가 사라졌다.
  - 연속 개행은 줄바꿈 하나다. 앞·뒤 개행은 줄바꿈 하나로 남는다. 표 밖 여러 줄 붙여넣기와 같은 규칙이다.
  - 여러 셀을 고른 상태(CellSelection)의 연속 개행도 줄바꿈 하나가 된다.
  - 무효 문자는 지운다. 무효 문자가 섞인 여러 줄도 정리본이 들어간다.
  - 캐럿의 서식(bold 등)이 삽입 텍스트와 줄바꿈에 이어진다. 인라인 atom을 고른 상태면 atom을 대체한다.
  - 서식 없이 붙여넣기(Ctrl+Shift+V)는 서식 있는 html이 함께 와도 평문 여러 줄을 넣는다.
  - 한 줄 평문, 서식 있는 html 일반 붙여넣기, 표·TSV 붙여넣기, 셀 조각 붙여넣기는 이전과 같다. 표 경계 범위는 삭제 규칙이 이전과 같고, 지운 뒤 캐럿이 셀 안이면 여러 줄이 셀 안에 들어간다.
  - 붙여넣기 뒤 선택은 삽입 텍스트 끝이다. undo 1회로 복원된다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 5158410: 표가 든 `text/html`을 붙일 때 표 앞뒤 문단·제목이 앞 블록의 자식으로 중첩되던 결함과, 목록 항목 안에만 표가 있는 html이 사라지던 결함을 고친다.

  - `<p>x</p><p>y</p><table>`을 붙이면 `x`·`y`·표가 최상위 형제 블록이 된다. 이전에는 `x`의 자식이었다.
  - 제목·문단이 표 앞뒤에 섞여도 같다. 편집기 안 복사도 같다.
  - 최상위에 표가 없고 목록 항목 안에만 표가 있는 html은 거절 없이 붙는다. 이전에는 `PASTE_TARGET_NOT_FOUND`로 거절되고 붙여넣기가 사라졌다.
  - 표 단독, 문단 하나와 표 하나, 표 둘 이상, drop은 이전과 같다.
  - 표 셀 안 캐럿에서 목록 항목 안에만 표가 있는 html은 이전의 `PASTE_TARGET_NOT_FOUND` 거절 통지가 사라진다. 붙지는 않는다(셀 안 붙여넣기 정책은 별건).
  - 저장 문서 형식은 바뀌지 않는다.

- 973153d: `enabledBlockTypes`가 일부 타입을 막은 편집기에서 표 붙여넣기가 미처리 예외를 던지고 붙여넣기가 사라지던 결함을 고친다.

  - `table`을 막은 편집기에 평문 TSV나 html 표를 붙이면 같은 클립보드의 `text/plain`이 들어간다. 이전에는 `TypeError: Schema is missing table/tableRow/tableCell nodes`가 났고 문서는 그대로였다. 탭은 문단에 못 들어가 지워진다. 평문이 없는 html 표는 문서가 바뀌지 않는다.
  - 표를 허용해도 제목·목록 같은 막은 타입이 표와 섞인 클립보드(목록 항목 안 중첩 포함)는 표까지 `text/plain`으로 들어간다. 이전에는 `RangeError: Unknown node type: ...`가 났다. 허용 블록만 골라 넣지는 않는다.
  - 이 물러남은 거절이 아니라서 `onPasteRejected`를 부르지 않는다.
  - 막은 타입이 없는 입력, 표 셀 안 캐럿 붙여넣기와 `enabledBlockTypes` 미지정 편집기의 표 붙여넣기는 이전과 같다.

- Updated dependencies [b7bdc56]
- Updated dependencies [ed89209]
- Updated dependencies [298cfc0]
- Updated dependencies [a970ce1]
- Updated dependencies [91d66d2]
- Updated dependencies [bb23080]
- Updated dependencies [d760ad0]
- Updated dependencies [26982d1]
- Updated dependencies [cb1a318]
- Updated dependencies [c794bc3]
- Updated dependencies [4bc8da2]
- Updated dependencies [7f0a28b]
- Updated dependencies [404c495]
- Updated dependencies [8e7a052]
- Updated dependencies [31e3191]
- Updated dependencies [cd53d86]
- Updated dependencies [3ec8db8]
- Updated dependencies [eee55c7]
- Updated dependencies [9ace4c7]
- Updated dependencies [8dd9ac2]
- Updated dependencies [3ba5f52]
- Updated dependencies [0e9a15c]
- Updated dependencies [6ff09fc]
- Updated dependencies [764e5cc]
- Updated dependencies [5aa7807]
- Updated dependencies [7d4161b]
- Updated dependencies [76f5292]
- Updated dependencies [902876f]
- Updated dependencies [105559d]
- Updated dependencies [5caf9ef]
- Updated dependencies [603236e]
- Updated dependencies [e7a7570]
- Updated dependencies [fae9d69]
- Updated dependencies [54c14b0]
- Updated dependencies [0a4c808]
- Updated dependencies [9632810]
  - @cp949/geul-model@0.2.0
  - @cp949/geul-io@0.2.0

## 0.1.2

### Patch Changes

- npm 패키지 메타데이터(description, repository, homepage, bugs)를 추가한다. 0.1.1까지는 4개 패키지 모두 이 필드가 없어 npm 패키지 페이지에 홈페이지·이슈 링크·설명이 표시되지 않았다.
- Updated dependencies
  - @cp949/geul-model@0.1.2
  - @cp949/geul-io@0.1.2

## 0.1.1

### Patch Changes

- - 코드블록에 wrap 토글, caption(클릭 편집), toolbar(복사·삭제·hover 노출) 추가
  - 미디어 4종 블록에 기본 margin과 caption 클릭 편집 추가, toolbar를 more 메뉴로 재설계해 다음 블록과의 겹침 제거
  - 표 인접, atom(구분선·미디어) 인접 Backspace/Delete가 선택 대신 건너뛰어 병합하도록 수정
  - 표 셀 화살표 키 이동 stale selection, 토글 블록 Backspace 오동작, 블록 경계 밖 클릭 시 커서 미생성 결함 수정
  - CodeBlock↔Text 경계 병합/분리, selection copy-paste, toolbar 상호 배타성 등 CodeBlock 결함 다수 수정
  - 미디어 caption 레이아웃(문서 flow 높이 미반영, 좌측 정렬 미추종, 코드블록 caption 간격) 결함 수정
  - markdown list 중첩 파싱에 사전 스캔 가드를 추가해 초선형 시간 폭발(DoS) 취약점 차단
  - sass 전이 의존 immutable을 5.1.9로 올려 Dependabot 취약점 2건 해소, devDependencies 9개 minor 업그레이드
- Updated dependencies
  - @cp949/geul-model@0.1.1
  - @cp949/geul-io@0.1.1
