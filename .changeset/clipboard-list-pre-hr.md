---
"@cp949/geul-io": patch
"@cp949/geul-core": patch
---

클립보드 표 옆 목록 항목 안 `pre`·`hr`를 항목의 자식 `codeBlock`·`divider`로 만든다.

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
