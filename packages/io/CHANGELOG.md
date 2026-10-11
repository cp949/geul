# @cp949/geul-io

## 0.2.0

### Minor Changes

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

- cb1a318: 표가 든 `text/html` 붙여넣기도 호스트의 `iframeEmbed` 설정으로 표 옆 `iframe` 블록의 url을 판정한다.

  - io: `parseClipboardTable` 입력에 선택 필드 `iframeEmbed?: IframeEmbedConfig`를 더한다. 추가형이라 기존 호출은 그대로다. 필드를 주지 않으면 이전처럼 url 없는 `iframe` 블록이다.
  - core: `TablePasteExtension`이 편집기 옵션 `iframeEmbed`를 `parseClipboardTable`에 넘긴다. 이전에는 표 없는 붙여넣기만 호스트 설정을 따라 같은 `iframe`이 표 유무에 따라 다르게 판정됐다.

### Patch Changes

- b7bdc56: 색이 다른 인접 `span`의 `textColor`·`backgroundColor`가 첫 색으로 합쳐지던 결함을 고친다.

  - `importHtml`이 `<span style="color:#ff0000">a</span><span style="color:#0000ff">b</span>`를 `a`(#FF0000), `b`(#0000FF) 두 조각으로 읽는다. 이전에는 `ab` 한 조각에 첫 색이었다. VS Code 복사처럼 구문 강조 색이 `span`마다 다른 HTML이 색을 유지한다.
  - 같은 판정을 쓰던 model `appendOrMergeInlineItem`·`sameMarks`가 색 값까지 비교한다. 같은 색 인접 `span`은 계속 한 조각이다.
  - core `modelToTiptap`이 색이 다른 인접 조각을 가진 문서를 `contains adjacent inline runs with identical marks`로 거절하던 동작을 없앴다. `tiptapToModel`과 표 셀 코덱의 병합도 색이 다른 조각을 합치지 않는다.
  - `canonicalizeTextMarks`의 중복 제거는 그대로다. 한 조각에 같은 종류 색이 둘이면 앞의 것만 남는다.

- ed89209: `importHtml`과 클립보드 붙여넣기가 style 속성의 `(`·`[`·`{` 블록을 Chromium처럼 종류별로 센다.

  - 블록 안의 `;`는 선언을 끝내지 않는다. `font-family:[;font-weight:bold`는 굵게가 아니다. 이전에는 굵게였다.
  - 짝 맞는 닫는 글자만 블록을 닫는다. `font-family:[);font-weight:bold`는 굵게가 아니다. `font-family:[)];font-weight:bold`는 굵게다.
  - 블록 밖 닫는 글자는 무시한다. `font-family:a];font-weight:bold`는 굵게다.
  - 블록 안에서도 따옴표·주석·이스케이프는 그대로 읽는다. `font-family:[']';font-weight:bold`는 굵게가 아니다. `font-family:\[;font-weight:bold`는 굵게다.
  - 개행이 끝낸 따옴표 뒤의 블록도 같다. `font-family:'a⏎[;font-weight:bold`는 굵게가 아니다.
  - 같은 규칙이 색·배경색(`font-family:'a⏎[;background-color:yellow`)과 `white-space`(`font-family:'a⏎[;white-space:pre`) 선언에 적용된다.
  - 동작 변화: `(` 안의 다른 블록에 든 `)`는 `(`를 닫지 않는다. `font-family:([)];font-weight:bold`는 굵게가 아니다. 이전에는 굵게였다. Chromium도 굵게가 아니다.
  - 한계: 속성 이름 앞 쓰레기 글자는 무시한다. `font-weight:bold;}color:red`는 빨강이다. Chromium은 color 선언을 버린다.

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

- a970ce1: 클립보드 표 옆 `blockquote`가 감싼 목록의 항목 글자를 항목 content에 남긴다.

  - `<blockquote><ul><li>a</li></ul></blockquote>` 옆에 표가 있으면 항목 content가 비고 글자가 자식 문단 `a`로 갔다. 이제 `bulletListItem(content a)`이고 자식 문단이 없다.
  - 여러 항목·순서 목록·중첩 목록·`span`으로 감싼 목록·`blockquote` 안 `blockquote`·`blockquote` 안 `div`도 `blockquote` 래퍼를 뺀 입력과 같은 결과를 낸다.
  - 원인: 분할기가 목록 안 텍스트마다 마크 없는 조상(`blockquote`)을 복제해 씌웠고, 항목 분할이 그 복제를 블록으로 보았다. 이제 정책의 구조 조상(`isNestedBoundary`·`isTransparent`)은 복제하지 않는다.
  - `ul`·`ol` 밖의 `li`가 감싼 목록도 같은 결과를 낸다.
  - 래퍼 `blockquote`·`li`의 `style` 색은 항목에 따라오지 않는다. 항목 안 `li`·`div` 자신의 `style`은 읽는다.
  - `span`·`b`·`a`처럼 마크가 있는 조상은 계속 항목 글자에 씌워진다.
  - `importHtml` 결과는 바뀌지 않는다.
  - 정정: 위 결과 서술은 이 changeset 시점의 서술이다. `clipboard-table-delegation` 이후 `blockquote`는 `quote` 블록이고 목록은 그 children이다. `blockquote` 안 `span`·`b`·`a`가 감싼 목록도 `quote` children의 목록 항목이다(`io-html-wrapped-block-structure`).

- bb23080: 클립보드 표 옆 목록 항목 안 `p`·`h1`–`h6`를 항목의 자식 블록으로 만든다.

  - `<ul><li style="color:#ff0000">t<p style="color:#00ff00">x</p></li></ul>` 옆에 표가 있으면 항목 content가 `tx`로 합쳐지고 글자가 `li` 색을 받았다. 이제 항목 content `t`(#FF0000)와 자식 문단 `x`(#00FF00)다.
  - `<li><h2 style="color:#00ff00">H</h2></li>`는 빈 항목과 자식 제목 `H`(#00FF00)다.
  - `p` 뒤 `p`·`h2`, `h1` 뒤 중첩 목록, 굵은 `p`, 순서 목록, 글자 사이 제목도 `importHtml`과 같은 블록 트리를 낸다.
  - 원인: 클립보드의 `isBlockLevelNode`가 `p`·제목을 블록으로 보지 않았다. 이제 정책의 `isSimpleBoundary`와 `headingLevelFromTagName`을 더한다.
  - 첫 실질 자식이 `p`인 항목은 이전과 같다. 승격 경로가 먼저 처리한다.
  - 내용 없는 `p`·`h1`–`h6`(빈 요소, 공백뿐, `<br>`만 든 `p`)는 클립보드가 자식 블록을 만들지 않는다. `importHtml`은 빈 자식 블록을 만든다.
  - `importHtml` 결과는 바뀌지 않는다.
  - 정정: 위 원인 문장과 내용 없는 `p`·`h1`–`h6` 문장은 이 changeset 시점의 서술이다. `clipboard-table-delegation` 이후 `isBlockLevelNode`는 없다. 클립보드도 `importHtml`처럼 빈 자식 블록을 만든다.

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

- c794bc3: 표가 섞인 html을 붙여넣을 때 목록 텍스트가 사라지고 셀 안 단어가 붙던 결함과, 긴 `style` 속성에서 붙여넣기가 멈추던 결함을 고친다.

  - 목록 안에서 `li`가 아닌 직속 자식(`ul` 안의 `ul`, 목록 직속 텍스트)의 텍스트가 사라지지 않는다. 그 내용은 항목 사이에 같은 깊이의 형제 블록으로 들어간다. 이전 항목의 하위 항목으로 해석하지는 않는다.
  - 표 셀 안 블록 요소(`p`·`div`·`ul`·`li`·`h1`–`h6`·`pre`·`blockquote` 등) 사이가 줄바꿈 하나로 나뉜다. 이전에는 `<td><p>a</p><p>b</p></td>`가 `ab`로 붙었다. 셀 맨 앞 개행·들여쓰기는 줄바꿈을 만들지 않는다. 셀 안 목록 표식은 붙지 않는다.
  - `style` 속성 파싱(`parseStyleDeclarations`)이 입력 길이에 선형이다. 클립보드 표 셀과 importHtml의 `span` 색 판정이 쓴다. 이전에는 `:`가 없는 알파벳 run 80,000자에 약 6.6초가 걸렸다. 읽는 선언과 결과는 같다.
  - 저장 문서 형식과 공개 API는 바뀌지 않는다.

- 4bc8da2: 클립보드 표 뒤 문단·목록 줄이 사라지거나 엉뚱한 셀에 붙는 결함을 고친다.

  - 수정 전 `withParagraphsMergedIntoCells`는 표 뒤 줄을 마지막 행에서 시작하는 셀 중 가장 오른쪽 셀 뒤에 붙였다.
  - 위 행에서 내려온 `rowSpan` 셀이 우하단을 덮으면 논리 우하단이 아닌 셀에 붙었다.
  - 마지막 행에 셀이 하나도 없으면 줄이 어느 셀에도 붙지 않고 사라졌다. 거절 통지도 없었다.
  - 이제 표 뒤 줄은 격자 칸(마지막 행, 마지막 열)을 덮는 셀 뒤에 붙는다. 표 앞 줄은 칸 (0, 0)을 덮는 셀 앞에 붙는다. `rowSpan`·`columnSpan`을 모두 따진다.
  - 덮는 셀이 없는 유효하지 않은 격자를 직접 넘기면 읽기 순서의 첫/마지막 셀에 붙인다. 줄을 버리지 않는다.
  - 시그니처와 줄 합치기 규칙(LF 구분, 빈 줄 건너뛰기, 마크 병합)은 그대로다. 병합 없는 표의 결과도 같다.

- 7f0a28b: `color`·`background-color`·`background` 값을 CSS 문법대로 읽도록 고친다.

  - `importHtml`과 클립보드 표 파서가 색 이름(`red`, `rebeccapurple`), 3·4·8자리 hex, `rgb()`·`rgba()`의 공백 문법·%·소수, `hsl()`·`hsla()`·`hwb()`를 읽는다. Word·Outlook·Excel HTML의 `color:red`, `background:yellow`가 색을 유지한다.
  - `!important`와 `/* */` 주석을 처리하고, 나중 선언이 `inherit`·`transparent`면 앞 값을 지운다. 문법이 틀린 선언은 버리고 앞 값을 유지한다.
  - `background` 줄임 속성에서 `url()`·`no-repeat` 같은 다른 토큰 옆의 색을 읽는다. 색이 없는 줄임 속성은 앞 `background-color`를 지운다.
  - 반투명 색(`rgba(255,0,0,0.5)`, `#ff000080`)과 투명은 색 마크를 만들지 않는다. 이전에는 alpha를 버리고 불투명 색으로 읽었다.
  - 선언을 괄호·따옴표 밖 `;`에서 잘라 `url(data:...;base64,...)` 뒤의 색도 읽는다.
  - `lab()`·`oklch()`·`color()`·`color-mix()`·`var()`·`calc()`·시스템 색은 읽지 않는다.

- 404c495: `importHtml`과 클립보드 붙여넣기가 `text-decoration`·`text-decoration-line`의 사용자 정의 함수 호출(`--f(…)`)을 꺼짐으로 읽는다. 이전에는 모르는 함수 토큰으로 보아 선언을 무효로 버렸다. 앞 선언의 밑줄·취소선이 남았다.

  - 호출이 값 어디에 있든 앞의 밑줄·취소선을 끈다. `text-decoration:underline --f(1px)`·`underline --f()`·`underline red --f(1px)`·`--f(1px)`가 꺼짐이다. 이전에는 앞의 값을 지켰다.
  - 호출 위치, 앞뒤 토큰의 유효 여부, 괄호 닫힘 여부를 보지 않는다. `foo --f(1px)`·`underline calc(--f(1px))`·`underline --f(1px)red`·`underline --f(`도 꺼짐이다.
  - 호출은 이름 글자 run이 `--`로 시작하고 길이가 3 이상이며 바로 뒤가 `(`인 경우다. `underline ---f(1px)`·`underline --1(1px)`은 꺼짐이다. `underline --(1px)`·`underline --f (1px)`·`underline foo--f(1px)`는 호출이 아니라 앞의 값을 지킨다.
  - run 바로 앞 글자가 `!`·`#`·`@`·`{`·`}`·`]`·따옴표·비ASCII 글자이면 호출이 아니다. `underline #--f(1px)`·`underline é--f(1px)`·`underline "--f(1px)"`는 앞의 값을 지킨다.
  - 깊이 0의 바깥 `)`가 있으면 호출이 있어도 무효다. `underline --f(1px))`는 앞의 값을 지킨다.
  - 동작 변화: `underline var(--x(1))`은 꺼짐이다. 이전에는 `var(…)` 치환 토큰으로 읽어 밑줄이었다. Chromium은 무효다.
  - 이유: `@function` 정의는 스타일시트에만 둘 수 있고 `importHtml`은 `<style>`을 읽지 않는다. 클립보드 입력의 호출은 늘 미정의라 Chromium 결과가 늘 꺼짐이다.
  - 한계: 이름은 ASCII 글자만 읽는다. `underline --é(1px)`는 Chromium은 꺼짐이고 우리는 앞의 값을 지킨다.
  - 한계: 따옴표 안 낱말, `{}` 블록 안, `url(`·`env(`·`attr(` 인자의 호출을 구분하지 않는다. `underline "a --f(1px)"`·`underline {a --f(1px)}`·`underline url(--f(1px))`는 Chromium은 무효이고 우리는 꺼짐이다. 따옴표 안의 `)`는 바깥 `)`로 센다. `underline --f("a)")`는 Chromium은 꺼짐이고 우리는 앞의 값을 지킨다.
  - 한계: `underline var(--x, --f(1px))`는 `--x`가 정의돼 있으면 Chromium은 밑줄이다. 우리는 `--x` 정의를 읽지 않아 꺼짐이다.

- 8e7a052: `importHtml`과 클립보드 붙여넣기가 `text-decoration`·`text-decoration-line`의 함수 토큰에서 괄호 짝을 본다. 이전에는 토큰이 `)`로 끝나는지만 보아 괄호가 안 맞는 값을 잘못 읽었다.

  - 바깥 `)`가 든 값은 무효라 앞의 밑줄·취소선을 지킨다. `text-decoration:underline calc(1px))`·`underline rgb(0,0,0))`는 앞의 값을 지킨다. 이전에는 밑줄이 켜졌다.
  - `)` 뒤에 글자가 붙은 함수 토큰은 무효다. `underline calc(1px)foo(2px)`·`underline calc(1px)calc(2px)`는 앞의 값을 지킨다.
  - 치환 함수가 있어도 바깥 `)`는 꺼짐이 아니라 무효다. `underline var(--x))`·`underline red var(--x))`는 앞의 값을 지킨다. 이전에는 `var(--x))`를 치환 토큰으로 건너뛰었다.
  - `)` 뒤에 글자가 붙은 치환 `underline var(--x)foo(1)`과 열린 치환 `underline var(--x`는 치환 토큰이 아니다. 값에 치환 함수가 있어 꺼짐이다.
  - 닫히지 않은 함수 토큰은 값 끝에서 닫은 것으로 읽는다. `underline lab(50 20 20`·`underline calc(1px`은 밑줄이다. 이전에는 무효였다.
  - 한계: 따옴표와 `\` 이스케이프 안의 괄호도 센다.
  - 한계: 인자 개수와 열린 괄호 안 낱말을 검증하지 않는다. `underline rgb(0, 0`은 Chromium은 무효이고 우리는 밑줄이다.
  - 한계: 열린 `underline var(--x`는 칸 없이 꺼짐이다. Chromium은 `--x`가 정의돼 있으면 밑줄이다.
  - 한계: 열린 함수 안의 치환 함수는 이름만 본다. `underline calc(var(--x)`는 Chromium은 꺼짐이고 우리는 밑줄이다.
  - 한계: `)` 바로 뒤에 공백 없이 붙은 유효 토큰도 무효로 본다. `underline calc(1px)red`는 Chromium은 밑줄이고 우리는 앞의 값을 지킨다.

- 31e3191: `importHtml`과 클립보드 붙여넣기가 `text-decoration`·`text-decoration-line`의 함수·식별자 토큰을 이름으로 읽는다. 이전에는 못 읽는 토큰이 든 값을 통째로 무효로 버려 밑줄·취소선이 꺼졌다.

  - 색 함수 14개(`rgb`·`hsl`·`hwb`·`lab`·`lch`·`oklab`·`oklch`·`color`·`color-mix`·`light-dark`·`contrast-color`·`alpha` 등)를 색으로 읽는다. `text-decoration:underline lab(50 20 20)`은 밑줄이다.
  - 수식 함수 10개(`calc`·`min`·`max`·`clamp`·`round`·`mod`·`rem`·`abs`·`hypot`·`-webkit-calc`)를 thickness로 읽는다. `text-decoration:underline calc(1px + 2px)`는 밑줄이다.
  - 시스템 색 식별자 45개를 색으로 읽는다. `text-decoration:underline windowtext`는 밑줄이다.
  - 같은 칸을 두 번 쓰거나 모르는 이름이면 무효다. `underline windowtext red`·`underline foo(1px)`는 앞의 값을 지킨다.
  - `var()`·`env()`·`attr()`·`if()`는 칸을 차지하지 않는다. `underline var(--x)`는 밑줄이다. line 낱말이 하나도 없으면 선언을 버린다. `var(--d)` 하나는 앞의 값을 지킨다.
  - 동작 변화: 값에 치환 함수가 있는데 다른 토큰이 무효면 앞의 밑줄·취소선을 끈다. `text-decoration:underline;text-decoration:underline foo var(--x)`는 꺼짐이다. 이전에는 밑줄이 남았다. Chromium은 인자가 정상인 치환 함수가 든 선언이 항상 앞 선언을 덮는다.
  - 한계: 함수 안쪽을 검증하지 않는다. `underline calc(1)`·`underline lab(foo)`는 Chromium은 무효이고 우리는 밑줄이다.
  - 한계: 치환 결과를 추적하지 않는다. `<style>`과 조상의 `--x` 정의를 읽지 않는다. 정의 없는 `underline var(--x)`는 Chromium은 꺼짐이고 우리는 밑줄이다.
  - 한계: 인자가 비었거나 잘못된 치환 함수(`underline foo var()`)는 Chromium과 다르게 읽는다.
  - 한계: font 경로(`font`·`font-style`·`font-weight`)의 수식 함수는 `calc`·`min`·`max`·`clamp` 넷뿐이다. 색 경로(`color`·`background-color`)의 `lab()`·`windowtext`는 무효다.

- cd53d86: 외부 HTML 요소의 style을 마크·블록 속성·셀 색으로 읽는 규칙을 한 module로 모으고, 표면마다 빠졌던 서식을 Chromium처럼 읽도록 고친다.

  - 표 셀 `td`·`tr`·`table`의 굵게·기울임·밑줄·취소선을 셀 글자 서식으로 읽는다. `importHtml`과 클립보드 표가 같다.
  - `li`·`blockquote`·callout이 승격한 안쪽 `p`의 색과 서식을 읽는다. `li`가 red, `p`가 blue면 blue다.
  - `summary`·`figcaption`의 `style` 색과 서식을 읽는다. 자기 export toggle의 `summary`도 서식을 읽는다.
  - 안쪽 요소의 `font-weight:normal`·`400`·`font-style:normal`이 바깥 굵게·기울임을 끈다. `inherit`·`unset`은 부모를 따른다. `em`·`i`의 `font-style:normal`과 `font` 줄임은 UA 기울임을 끈다.
  - 무효한 `font-style` 선언은 앞의 값을 지우지 않는다.
  - `div`·`li`·`blockquote` 바로 아래 `span`의 `SAFE_BLOCK_DOWNGRADED` 경고를 없앤다. `span` 안의 미지원 블록은 그 블록 이름으로 경고한다.
  - `parseInlineStyleMarks`의 `italic: boolean`을 `fontStyle`로 바꾸고 `InlineFontWeight`에 `inherit`를 더한다. 패키지 내부 API이고 `index.ts`에서 내보내지 않는다.

- 3ec8db8: `importHtml`의 경고가 실제 변환 결과와 어긋나던 오탐과 누락을 고친다.

  - `<p>` 안 Tab, 탭 들여쓰기한 외부 HTML 같이 공백으로 접혀 글자가 남는 입력에 `UNSAFE_CODE_POINT_REMOVED`를 내지 않는다.
  - `<script>` 안 제어문자는 `UNSAFE_ELEMENT_REMOVED` 하나만 낸다. 이전에는 `UNSAFE_CODE_POINT_REMOVED`가 더해졌다.
  - 제목 안 인용·callout, 토글 `summary`, children wrapper, 생산 편집기 목록 `div` 안에서 평탄화되는 `<pre>`의 Tab 삭제도 경고한다.
  - `<caption>` 안 글자의 경고 `element`가 `table`이다. sanitize가 벗긴 요소가 아니라 남은 부모 태그를 쓴다.
  - 속성 보존 경고를 노드 단위로 맞춘다. 같은 태그·속성을 가진 다른 노드의 경고가 사라지던 오류가 없어진다.
  - 경고 순서는 sanitize 손실, 변환 손실, 속성 보존 순이다. 반환하는 문서는 바뀌지 않는다.

- eee55c7: `importHtml`의 codeBlock 메타 경고와 벗겨지는 `font`·`mark` 속성 경고를 변환기가 낸다.

  - codeBlock이 되는 `pre`와 그 첫 직속 `code`의 `data-language`·`class`·`data-geul-block-id`·`data-geul-code-wrap`만 보존으로 본다.
  - codeBlock `pre` 안에서 버려지는 메타를 `UNSAFE_ATTRIBUTE_REMOVED`로 새로 경고한다. 안쪽 `pre`, 두 번째 직속 `code`, `<pre><span><code>`의 `code`가 그렇다. 이전에는 경고가 없었다.
  - 블록을 품어 벗겨지는 `font`·`mark`의 `color`·`style` 경고는 그대로 난다. 순서는 수집기 경고 뒤로 간다.
  - 블록이 sanitize로 사라진 `font`(`<font color="red"><object><p>x</p></object></font>`)는 색을 읽어 `color` 경고가 없다. 이전 경고는 거짓이었다.
  - sanitize가 자식째 지운 `object`·`svg`·`math` 안의 codeBlock 메타와 벗겨질 `font`·`mark` 속성은 따로 경고하지 않는다. 요소 제거 경고 하나로 보고한다.
  - 블록 강등 경고(`SAFE_BLOCK_DOWNGRADED`)는 바뀌지 않는다.

- 9ace4c7: `importHtml`이 `pre`를 `codeBlock`이 아닌 인라인 글자로 평탄화할 때 지우는 Tab도 `UNSAFE_CODE_POINT_REMOVED`로 경고한다.

  - 목록 항목, 중첩 목록 항목, 인용, callout의 본문 구간에서 인라인 래퍼(`span`, `b`, `a`, `em`, `code` 등)를 지난 `pre`는 `codeBlock`이 되지 않는다. 부모 블록 본문 글자가 된다. 이때 지운 Tab을 이전에는 경고하지 않았다.
  - 경고 `element`는 Tab이 든 글자의 부모 태그다(`pre`, `pre > code`면 `code`).
  - 결과 문서(블록 구조와 글자)는 바뀌지 않는다. 경고만 는다.
  - `codeBlock`이 되는 `pre`는 Tab을 남기고 경고도 없다. 래퍼 없는 `pre`, `font`·`mark` 래퍼 `pre`, `div` 안 `pre`, 본문 뒤 children의 `pre`가 같다.
  - CR·C0 경고 개수와 표 셀 안 `pre`의 경고는 이전과 같다.
  - 정정: 위 첫 문장의 평탄화 자리는 이 changeset 시점의 서술이다. `io-html-wrapped-block-structure` 이후 목록 항목·인용·callout 안 인라인 래퍼를 지난 `pre`는 children `codeBlock`이다. 평탄화와 Tab 경고는 표 셀과 토글 `summary` 안 `pre`에 남는다.

- 8dd9ac2: `importHtml`이 `iframeEmbed` 정책(custom URL 허용, provider 허용 등)을 통과한 iframe `data-geul-src` 하나가 정적 url 검증을 통과하지 못해도 문서 전체를 거절하지 않는다.

  - 정책을 통과했지만 `isSupportedLinkHref`를 통과하지 못하는 값(공백·제어문자 등)은 url 없는 빈 `iframe` 블록으로 남기고 `UNSAFE_URL_REMOVED`를 반환한다. 이전에는 `HTML_DOCUMENT_INVALID`였다.
  - 경고의 `element`는 wrapper 태그(`a`·`div`·`figure`), `attribute`는 `data-geul-src`다. 정책 불허는 이전처럼 경고 없는 빈 `iframe`이다.
  - `HtmlImportWarning`의 `UNSAFE_URL_REMOVED`는 `element`가 `"a" | "img" | "video" | "audio" | "div" | "figure"`, `attribute`가 `"href" | "src" | "data-geul-src"`로 넓어진다. 값만 늘어난다. `element`나 `attribute`를 exhaustive하게 좁히는 소비자는 분기를 더해야 한다.
  - 정상 url과 기본 설정(`allowCustomUrl` 없음)의 결과는 바뀌지 않는다.

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

- 764e5cc: `importHtml`과 클립보드 붙여넣기가 인라인 스타일의 `font-weight`·`font-style`·`text-decoration(-line)`·`font` 선언을 Chromium과 같은 규칙으로 읽는다.

  - 무효 선언은 통째로 버리고 앞의 유효 값을 지우지 않는다. `text-decoration:underline;text-decoration:foo`는 밑줄이다. 이전에는 밑줄이 꺼졌다.
  - `!important`가 우선순위를 정한다. `font-weight:normal !important;font-weight:bold`는 굵지 않고, `font-weight:bold ! important`(`!`와 낱말 사이 공백)는 굵게다.
  - 따옴표·괄호 안 `;`는 선언을 끝내지 않는다. `font-family:'a;font-style:italic '`는 기울임이 아니다.
  - `font-style`은 값 전체를 판정한다(`italic foo` 무효). `text-decoration`은 line·style·thickness·색 문법 전체를 판정한다.
  - 한계: `oblique` 각도 범위는 판정하지 않는다.

- 5aa7807: Chrome 복사의 계산 스타일 덤프가 붙은 요소에서 작성자가 쓴 색·배경을 읽는다. 색 `span`을 통째로 포함한 복사에서 색이 사라지던 결함을 고친다.

  - 덤프 표식(`style`의 `-webkit-text-stroke-width` 선언)이 있는 요소는 표식 뒤의 마지막 `text-decoration*` 선언 뒤의 선언만 색·배경으로 읽는다. 표식 앞의 `text-decoration*`은 앵커가 아니다. 앵커가 없으면 색을 읽지 않는다.
  - Chromium 153은 요소를 통째로 포함한 복사에서 작성자 `color`·`background-color`를 덤프 맨 끝에 붙인다. 같은 속성의 테마 값은 덤프에서 빠진다.
  - 줄임 `text-decoration`을 같이 건 `span`도 읽는다.
  - `importHtml` 문단, `importHtml` 표 셀, 클립보드 표 셀이 같다. 적용 요소는 `span`·`b`·`strong`·`em`·`i`·`code`·`font`·`mark`와 블록(`p`·`h1`–`h6`·`blockquote`)·`table`이다.
  - 작성자 색이 없는 덤프 요소는 이전처럼 색 마크가 없다. 서식 선언은 지금처럼 style 전체에서 읽는다.
  - 한계: 요소 안쪽만 복사하면 작성자 색이 덤프 맨 앞에 와서 테마 색과 구분할 수 없다. 읽지 않는다.
  - 한계: 색 `span`이 문단의 유일한 자식인 복사도 같은 이유로 읽지 않는다.
  - 한계: `u`·`s`·`del`·`strike`·`a`는 `text-decoration*` 선언이 없고 작성자 배경이 테마 배경과 같은 자리에 와서 읽지 않는다.
  - 한계: 스타일시트 클래스로 `text-decoration`을 받은 요소는 `text-decoration`이 `style`의 첫 선언(표식 앞)에 와서 읽지 않는다. 인라인 `color`·`background-color`를 같이 걸어도 같다. 테마 색이 작성자 색으로 박히는 오독을 막는다. 밑줄·취소선·굵게 서식은 읽는다.
  - 한계: Chromium 153.0.8010.12 한 종에서 잰 직렬화 순서에 기댄다. Firefox·Safari는 측정하지 않았다.

- 7d4161b: `span`·`b`·`strong` 밖 요소의 색과 인라인 서식이 사라지던 결함을 고친다.

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
  - `span`·`b`·`strong`·`em`·`i`·`u`·`s`·`del`·`strike`·`code`·`font`·`mark`도 같은 표식이 있으면 `style`의 테마 색·배경을 읽지 않는다. 작성자 색은 `io-chrome-copy-author-color` 항목이 읽는다. 서식 선언, `font`의 `color` 속성, `mark`의 기본 노랑 배경은 읽는다. 표식 없는 `span`의 색은 이전과 같다.
  - 요소 안쪽만 복사하면 작성자 색과 테마 색을 구분할 수 없어 읽지 않는다. 색 `span`을 통째로 포함한 복사의 작성자 색은 `io-chrome-copy-author-color`가 읽는다.
  - 읽지 못한 `font color` 값(`rgb()` 등)은 이전처럼 `UNSAFE_ATTRIBUTE_REMOVED`로 경고한다.
  - `font`·`mark`가 목록·표 같은 블록을 품으면 태그만 벗겨 블록 구조를 유지한다. 벗겨지는 태그의 `color`·`style`은 사라지므로 이전처럼 경고한다.
  - `a`의 `style`, `thead`·`tbody`·`col`의 색, `mark`의 기본 글자색, 옛 속성 쓰레기 값(`bgcolor="garbage"`)은 읽지 않는다.

- 76f5292: `importHtml`이 블록 경계에서 단어를 붙이던 결함을 고친다. 소스 공백 접기가 경계 양쪽 공백을 지운 뒤, 경계를 구분자 없이 이어 붙이던 경로들이다.

  - `figure`·`figcaption`·`details`·`summary`는 미디어·codeBlock·toggle로 읽히지 않으면 `div`처럼 문단 경계다. `<div>Intro <figure>Figure body</figure> outro</div>`는 문단 셋(`Intro`·`Figure body`·`outro`)이다. 이전에는 `IntroFigure bodyoutro` 한 문단이었다.
  - 표 셀 안 블록 요소(`p`·`div`·`pre`·제목·목록·`figure` 등) 경계는 줄바꿈 하나가 된다. `<td><p>a</p><p>b</p></td>`는 `a`·줄바꿈·`b`다. 이전에는 `ab`였다.
  - `div`·`figure`·`details` 안 `blockquote`의 텍스트가 인용 content가 된다. 이전에는 `div` 안이면 content가 비고 텍스트가 자식 문단으로 내려갔다.
  - 제목 안 `figure`·`details`는 `div`와 같이 제목을 문단으로 나눈다(`<h2>a<figure>b</figure>c</h2>` → 문단 셋).
  - 클립보드 표 파서(`parseClipboardTable`)는 바뀌지 않는다. 셀 안 `<p>a</p><p>b</p>`는 여전히 `ab`다.
  - 한계: 제어문자만 든 셀 안 블록은 셀 끝에 빈 줄을 남긴다. 셀 경계 줄바꿈에는 마크가 붙지 않는다.
  - 정정: 위 클립보드 표 파서 문장은 이 changeset 시점의 서술이다. #325 이후 셀 안 `<p>a</p><p>b</p>`는 `a`·줄바꿈·`b`다. `clipboard-table-delegation` 이후 표 옆 블록도 `importHtml` 변환기가 읽어 이 changeset의 경계 규칙을 따른다.

- 902876f: 굵지 않은 `<b>` 래퍼가 본문 전체를 굵게 만들던 결함을 고친다.

  - `font-weight:normal` 또는 `400` 인라인 스타일이 붙은 `<b>`·`<strong>`은 굵게(bold)로 읽지 않는다. 공백·대소문자·`!important`는 무시하고 마지막 선언을 기준으로 한다.
  - Google Docs 복사는 문서 전체를 `<b style="font-weight:normal">`로 감싼다. 이 HTML을 가져오거나 붙여넣으면 본문이 굵지 않게 들어온다. 글자색 같은 안쪽 서식은 유지된다.
  - 표 밖 붙여넣기, 여러 블록 붙여넣기, `importHtml`이 모두 같다.
  - 일반 `<b>`·`<strong>`은 이전처럼 굵게다. `font-weight:700` 같은 스타일 기반 굵게는 `span`·`b`·`strong`에서 읽는다(같은 릴리스의 스타일 마크 인식).
  - `style` 속성 제거 경고(`UNSAFE_ATTRIBUTE_REMOVED`)는 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- 105559d: `importHtml`이 외부 HTML의 인라인 스타일 서식과 소스 공백을 브라우저 렌더링 규칙대로 읽도록 고친다.

  - `span`·`b`·`strong`의 `font-weight`·`font-style`·`text-decoration(-line)` 스타일을 굵게·기울임·밑줄·취소선으로 읽는다. `700`·`bold`·`600` 이상은 굵게, `italic`·`oblique`는 기울임, `underline`은 밑줄, `line-through`는 취소선이다. 마지막 선언이 이기고 `!important`·대소문자·공백은 무시한다.
  - 마크는 누적만 한다. `font-weight:normal`이나 `text-decoration:none`이 바깥 요소의 마크를 지우지 않는다.
  - `<del>`·`<strike>`는 취소선으로 읽는다. `<ins>`와 `p`·`div`의 마크 스타일(굵게·색 등)은 읽지 않는다. `div`의 `white-space`는 읽는다.
  - 소스 개행·탭·연속 공백은 공백 하나로 접는다. `<p>one\ntwo</p>`는 `one two`다. 요소 경계를 넘어 접는다.
  - 블록 양끝과 `<br>` 앞뒤의 공백은 지운다. `<br>`는 줄바꿈으로 남는다. 블록 사이 공백뿐인 텍스트는 블록을 만들지 않는다.
  - NBSP는 접지도 자르지도 않는다. `<pre>`와 `white-space`가 `pre`·`pre-wrap`·`break-spaces`인 `span` 안도 접지 않는다. `pre-line`과 `div`의 `white-space`는 이후 수정(io-html-white-space-div-pre-line)이 읽는다.
  - 입력에 `data-geul-block-id`나 `data-geul-cell-id`가 하나라도 있으면 문서 전체를 접지 않는다. `exportHtml`이 낸 공백이 왕복에서 보존된다. 외부 조각이 섞인 입력도 접지 않는다.
  - 클립보드 표 붙여넣기도 같은 마크를 읽는다. 표 파서의 공백 접기는 이전과 같다.
  - 저장 문서 형식은 바뀌지 않는다.

- 5caf9ef: `importHtml`이 `div`의 `white-space`와 `span`의 `white-space:pre-line`을 소스 공백 접기에 반영한다.

  - `div`의 `white-space`가 `pre`·`pre-wrap`·`break-spaces`이면 하위 텍스트의 들여쓰기·연속 공백·개행을 보존한다. VS Code 복사(`<div style="white-space: pre">…`)의 들여쓰기가 더는 접히지 않는다.
  - `div`·`span`의 `white-space:pre-line`은 공백 run을 한 칸으로 접고 개행을 줄바꿈으로 남긴다. 개행 앞뒤 공백은 지운다.
  - 하위 요소의 `white-space:normal`·`nowrap`은 다시 접는다. `inherit`·`initial`·`unset`·`revert`·`revert-layer`·선언 없음은 부모 모드를 따른다. 무효한 선언은 브라우저처럼 버리고 앞의 유효 선언을 유지한다.
  - CSS Text 4 값(`preserve`·`preserve-breaks`·`collapse`·`wrap`과 `preserve nowrap` 같은 짝)도 읽는다.
  - `p`·`li`·`td` 등 다른 태그의 `white-space`는 읽지 않는다.
  - `div`의 `style`은 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 이전처럼 낸다.
  - 저장 문서 형식은 바뀌지 않는다.

- 603236e: `importHtml`이 인라인·`div` 래퍼 안의 목록과 블록을 지킨다(#336).

  - `<span><ul><li>a</li><li>b</li></ul></span>`는 목록 항목 둘이다. 이전에는 문단 둘이었다.
  - `<b><ul><li>a</li></ul></b>`는 굵은 목록 항목이다. `div` 안 `ul`·`ol`도 목록이다.
  - Google Docs 복사 모양(`<b style="font-weight:normal" id="docs-internal-guid-…">`가 전부 감쌈)의 목록이 굵지 않은 목록 항목으로 남는다.
  - 래퍼 안 연속 `ol`의 번호는 최상위 연속 `ol`과 같다.
  - 목록 항목·인용·callout 안에서 블록을 품은 인라인 요소(`span`·`b`·`a` 등)는 children 자리로 간다. `<ul><li>i<span>x<table>…</table></span></li></ul>`의 표는 항목의 children 표다. 이전에는 항목 글자로 접혔다.
  - 같은 자리의 인라인 래퍼 안 `pre`는 children `codeBlock`이다. Tab이 남고 `UNSAFE_CODE_POINT_REMOVED`가 없다. 이전에는 본문 글자로 평탄화됐다(#354).
  - 블록 자손이 없는 인라인 요소는 이전과 같다.
  - 블록 자리의 미지원 태그(`span`·`b` 등)는 이전처럼 `SAFE_BLOCK_DOWNGRADED`로 경고한다.
  - 일반 html 붙여넣기와 클립보드 표 붙여넣기도 같은 변환기라 같은 결과다.

- e7a7570: `preview.css`가 빈 문단과 빈 제목에 한 줄 높이를 준다(Issue #322, #327). 빈 `<p>`는 줄 상자가 없어 높이 0이었고, 에디터의 빈 줄 N개가 미리보기에서 사라졌다.

  - `.geul-preview p:empty::before { content: "\200b"; }` 규칙을 추가한다. `h1`–`h6` 셀렉터도 같은 선언 블록에 병합한다. 높이는 `.geul-preview`의 `line-height`를 따른다.
  - ZWSP는 대체 텍스트 구문(`/ ""`)으로 접근성 트리에서 뺀다. 이 구문을 모르는 엔진(Chrome 75)은 첫 선언만 쓴다.
  - 빈 제목(h1–h6)도 같은 레벨의 한 줄 높이를 얻는다. 높이는 같은 레벨의 내용 있는 제목과 같다.
  - `exportHtml()` 출력은 바뀌지 않는다. 빈 문단은 `<p …></p>` 그대로다.
  - 빈 callout·인용·목록 항목 안쪽 `<p>`도 한 줄 높이를 얻는다. 내용이 있는 문단과 callout 안쪽 `<p>`의 높이·간격은 그대로다.
  - `preview.css`를 쓰지 않는 소비자는 빈 문단이 높이 0인 채로 남는다. README에 대응을 적었다.

- fae9d69: 중첩 `span`의 색이 바깥 `span` 색으로 읽히던 결함을 고친다.

  - `importHtml`이 `<span style="color:#ff0000"><span style="color:#0000ff">x</span></span>`를 `x`(#0000FF)로 읽는다. 이전에는 바깥 색 #FF0000이었다. 브라우저 렌더링과 같다.
  - `<span red>a<span blue>x</span>b</span>`는 `a`(#FF0000), `x`(#0000FF), `b`(#FF0000) 세 조각이다. `background-color`도 같다.
  - 안쪽 색이 읽지 못하는 값(`lab()`·`var()` 등)이거나 색을 정하지 않는 값(`transparent`·`inherit`·반투명)이면 바깥 색이 남는다.
  - 안쪽 `background-color:rgba(0,0,0,0)`은 바깥 배경을 덮지 않는다.

- 54c14b0: `importHtml`과 클립보드 붙여넣기가 style 속성의 닫히지 않은 따옴표를 Chromium처럼 개행에서 끝낸다.

  - 개행(LF·CR·FF, CRLF는 하나)이 닫히지 않은 따옴표를 끝낸다. 그 선언은 버리고 다음 `;`부터 선언을 다시 읽는다.
  - `font-family:'a⏎;font-weight:bold`는 굵게다. 이전에는 따옴표가 입력 끝까지 이어져 굵게를 삼켰다.
  - 같은 규칙이 색·배경색(`font-family:'a⏎;background-color:yellow`)과 `white-space`(`font-family:"a⏎;white-space:pre`) 선언에 적용된다.
  - `&#13;` 문자 참조는 CR로 남아 따옴표를 끝낸다.
  - 백슬래시 뒤 개행은 문자열을 잇는다. `font-family:'a\⏎;font-weight:bold`는 굵게가 아니다.
  - VT와 U+2028은 개행이 아니다. 따옴표를 끝내지 않는다.
  - 개행에서 끝난 선언은 값 판정 전에 버린다. `font-weight:bold;font:italic 12px 'a⏎`는 굵게이고 기울임이 아니다. `background:url("a⏎") red`는 배경색이 없다.
  - 동작 변화: `font-family:"a⏎b";font-weight:bold`는 굵게가 아니다. 개행이 첫 문자열을 끝내고 `b"`가 새 문자열을 열어 뒤 선언을 삼킨다. 이전에는 `"a⏎b"`를 문자열 하나로 읽어 굵게였다. Chromium도 굵게가 아니다.

- 0a4c808: `importHtml`과 클립보드 붙여넣기가 style 속성의 따옴표 없는 `url(`을 Chromium처럼 url 토큰으로 읽는다. 이전에는 안의 `'`·`/*`·`[`·`{`가 따옴표·주석·블록을 열어 뒤 선언을 삼켰다.

  - `)`까지 한 덩어리다. `background:url(it's.png);color:red`는 빨강, `background:url(a/*b);color:red`도 빨강이다. `background:url(it's.png);font-weight:bold`는 굵게, `background:url(it's.png);white-space:pre`는 공백 보존이다.
  - 안의 짝 없는 `[`·`{`는 블록이 아니다. `font-family:url(a[);font-weight:bold`는 굵게, `background:url(a[) red;font-weight:bold`는 배경 빨강·굵게다. #365 직후에는 둘 다 뒤 선언을 잃었다.
  - 개행이 끝낸 따옴표 뒤도 같다. `font-family:'a⏎url(it's);color:red`는 빨강이다. #362 직후에는 색이 없었다.
  - `url(` 뒤 공백은 건너뛴다. 다음 글자가 따옴표면 보통 함수 블록이라 따옴표 안 `;`가 선언을 끝내지 않는다. `color:red;background:url( 'a;color:blue' )`는 빨강이다. 그 밖의 글자면 토큰이다. `background:url( it's.png);color:red`는 빨강이다.
  - 이름은 대소문자를 구분하지 않는다. `URL(it's)`·`Url(it's)`가 같다. 앞 글자가 이름 글자(a–z, A–Z, 0–9, `-`, `_`, NUL, 비ASCII)·`#`·`@`이거나 이스케이프된 글자이면 url 함수가 아니다. `myurl(it's)`·`#url(it's)`·`-url(it's)`·`1url(it's)`·`a\ url(it's)`·`\)url(it's)`는 따옴표를 열어 뒤 선언을 삼킨다. `\url(it's)` 단독은 `\u`가 u라서 url 함수다. `\`+개행은 유효 이스케이프가 아니라 `a\⏎url(it's)`는 url 함수다.
  - 이스케이프된 `)`는 토큰을 닫지 않는다. 토큰 안 `;`는 선언을 끝내지 않는다. `background:url(;color:red);font-weight:bold`는 굵게다. 닫히지 않은 토큰은 입력 끝까지 한 선언이다. `background:url(;font-weight:bold`는 굵게가 아니다.
  - 한계: 값 판독기는 bad url을 모른다. Chromium은 `url(it's.png)`처럼 따옴표·`(`·가운데 공백이 든 url을 bad-url로 보고 그 선언을 통째로 버린다. `color:red;background-color:blue;background:url(it's.png)`는 Chromium이 배경 파랑이고 우리는 배경을 지운다. `background:url(a b.png) red`는 Chromium이 배경 없음이고 우리는 빨강이다.
  - 한계: 이름 안의 이스케이프는 읽지 않는다. `\75rl(it's)`·`u\rl(it's)`는 Chromium이 url로 읽고 우리는 아니다. `\31 url(it's)`는 Chromium이 url이 아니고 우리는 url로 읽는다.

- 9632810: `importHtml`과 클립보드 붙여넣기가 `div`·`span`의 `white-space` 선언을 색·인라인 서식 선언과 같은 규칙으로 읽는다.

  - 따옴표·괄호 안 `;`는 선언을 끝내지 않는다. `font-family:"a;white-space:pre;b"`는 `white-space` 선언이 아니라 부모 모드를 따른다. 이전에는 공백을 보존했다.
  - `!important`가 우선순위를 정한다. `white-space:pre !important;white-space:normal`과 `white-space:pre ! important;white-space:normal`은 공백을 보존한다. 이전에는 접었다.
  - 상속 키워드(`inherit` 등)에 붙은 `!important`도 칸을 차지한다. `white-space:inherit !important;white-space:pre`는 부모 모드를 따른다.
  - 값 안 `/* */` 주석은 값을 끊지 않는다. `white-space:/*c*/pre`는 공백을 보존한다.
  - 한계: 속성 이름 앞 쓰레기 글자는 무시한다. `x white-space:pre`와 `_white-space:pre`는 공백을 보존한다. `white-space:pre;_white-space:normal`은 공백을 접는다. Chromium은 이런 선언을 버린다. 이전에는 Chromium과 같았다.

- Updated dependencies [b7bdc56]
- Updated dependencies [6ff09fc]
  - @cp949/geul-model@0.2.0

## 0.1.2

### Patch Changes

- npm 패키지 메타데이터(description, repository, homepage, bugs)를 추가한다. 0.1.1까지는 4개 패키지 모두 이 필드가 없어 npm 패키지 페이지에 홈페이지·이슈 링크·설명이 표시되지 않았다.
- Updated dependencies
  - @cp949/geul-model@0.1.2

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
