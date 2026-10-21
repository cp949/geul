# @cp949/geul-io

## 0.3.0

### Minor Changes

- 6fb3b6b: 이미지에 `name`·`caption`과 별개로 선택 `alt`를 저장하고 HTML 왕복에서 보존한다.

  - model: `ImageBlock`에 선택 필드 `alt`를 추가한다. `MediaOwnField`에 `"alt"`가 늘고 `MEDIA_BLOCK_FIELDS`는 `alt`를 image만 소유한다고 답한다. 값 검증은 문자열 타입뿐이다. 빈 문자열은 유효하다.
  - io: `exportHtml`이 출력 `alt`로 `alt ?? caption ?? name ?? ""`를 쓰고, `alt` 필드가 있을 때만 `data-geul-alt`를 바깥 요소에 낸다. `importHtml`은 `data-geul-alt`를 먼저 읽고, geul 마커가 있는 요소는 `alt`를 만들지 않으며, 마커가 없는 `<img alt>`를 `alt`로 읽는다.
  - io 동작 변화: 마커 없는 `<img alt>`(구 에디터 HTML, 웹 페이지 붙여넣기 포함)가 `alt`로 들어온다. 이전에는 읽지 않고 버렸다. 그 결과 이전에 strict GFM export를 통과하던 이미지가 `IMAGE_ALT`로 거절될 수 있다. lossy export는 이전과 같이 동작한다.
  - io: GFM export는 `alt ?? name ?? url`을 쓰고, `alt`가 있으며 `name ?? ""`와 다르면 `MarkdownLoss.kind` `IMAGE_ALT`로 보고한다. `name`이 없는 이미지의 `alt`도 같은 규칙으로 strict에서 거절한다. `alt`가 빈 문자열이고 `name`도 없으면 손실이 아니다.
  - core: `alt`를 PM attr와 codec으로 보존하고 편집 화면 `<img alt>`에 `alt ?? caption ?? name ?? ""`를 쓴다. `alt`를 입력하는 UI와 명령은 없다. `replaceDocument`나 `importHtml`로만 넣을 수 있다.
  - 0.2.3 호환(0.2.3 패키지로 실측): `alt`가 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`가 `DOCUMENT_INVALID`(`Unrecognized key: "alt"`)로 거절한다. `replaceDocument`는 `{ ok: false }`를 돌려주고 기존 문서를 바꾸지 않는다. 0.2.3 `importHtml`은 마커 없는 `<img alt>`의 `alt`를 경고 없이 무시한다.

- 6fb3b6b: 링크 `target`을 문서에 저장하고 HTML 왕복에서 보존한다. 새 링크에는 `target`이 붙지 않는다.

  - model: `link` 마크에 선택 필드 `target`을 추가한다. 허용값은 `_blank`·`_self`·`_parent`·`_top`이다. 신규 export는 `LINK_TARGETS`, `LinkTarget`, `isCanonicalLinkTarget`, `normalizeLinkTarget`이다. `normalizeLinkTarget`은 ASCII 대소문자만 소문자로 바꾼다(`_BLANK` → `_blank`). 허용 밖 값을 가진 문서는 `marks[i].target` 경로로 거절한다. 인접 조각 병합 판정(`sameMarkKind`)이 `target`을 비교한다.
  - io: `importHtml`이 `<a target>`을 읽고 `exportHtml`이 `target`을 낸다. `exportHtml`은 `target="_blank"`일 때만 `rel="noopener noreferrer"`를 붙인다. 허용 밖 `target`은 필드 없이 `UNSAFE_ATTRIBUTE_REMOVED(a, target)` 경고 1건을 낸다. `target="_blank"`에 정확히 `rel="noopener noreferrer"`가 붙은 자체 export는 `rel` 경고를 내지 않는다. 구 에디터가 낸 `rel="noopener noreferrer nofollow"`는 이전처럼 `rel` 경고를 낸다.
  - io: `MarkdownLoss.kind`에 `LINK_TARGET`이 늘었다. GFM은 `target`을 표현하지 못해 손실로 보고하고, strict 모드는 `target`이 있는 문서를 거절한다.
  - core: 본문과 표 셀 두 codec 경로가 `target`을 보존한다. StarterKit의 Link 기본값(`target="_blank"`, `rel`, `class`)을 껐다. 새 링크에 `target`이 생기지 않고, 편집 화면 링크 DOM에서 `target="_blank" rel="noopener noreferrer nofollow"`가 사라진다. 편집 화면 링크 클릭을 직접 처리하는 소비자는 확인한다.
  - 구 에디터 HTML을 가져올 때 경고 수가 줄어든다. 링크마다 나던 `target` 경고가 없어지고 `rel` 경고는 남는다.
  - 0.2.3 호환(0.2.3 패키지로 실측): `target`이 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`·`replaceDocument`가 거절하지 않는다. `target`을 오류나 경고 없이 지워 로드하므로, 0.2.3 앱이 열어 저장하면 `target`이 유실된다. 0.2.3 `importHtml`은 `<a target>`의 `target`을 지우고 `UNSAFE_ATTRIBUTE_REMOVED(target)` 경고를 낸다.

- 6fb3b6b: 미디어 폭을 HTML 가져오기에서 더 넓게 읽는다.

  - `data-geul-preview-width`의 소수 폭(`320.5`)을 읽는다. 이전에는 정수만 읽어 소수 폭이 HTML 왕복에서 사라졌다. 허용 문법은 `^[+-]?\d+(\.\d+)?$`이고 유한한 수만 받는다. 문법은 맞지만 양수가 아닌 값은 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 낸다.
  - `data-geul-preview-width`가 없는 image의 안쪽 `<img style="width: Npx">`를 `previewWidth`로 읽는다(구 에디터가 저장한 HTML). `%`·`auto`·`calc()`는 값 없음이다. video에는 적용하지 않는다. 웹 페이지에서 복사한 `<img style="width: 600px">`를 붙여넣어도 `previewWidth: 600`이 된다. 이전에는 폭을 버렸다.
  - `img`의 `style` 제거 경고는 이전과 같다.

  - inline 폭의 무효 후행 선언(`width: 320px; width: bogus`, 음수 길이 등)은 건너뛰어 앞 유효 폭을 보존한다. 유효한 `%`·`auto` 등은 승자가 되면 여전히 폭을 저장하지 않는다.

- 6fb3b6b: 텍스트 블록 정렬이 `justify`를 받고, 외부 HTML의 inline `text-align`을 읽고, 편집 화면에 보인다.

  - model: `TextBlockProps.textAlignment`가 `left`·`center`·`right`·`justify`를 받는다. 신규 export는 `TEXT_BLOCK_ALIGNMENTS`, `TextBlockAlignment`, `isCanonicalTextBlockAlign`이다. 표 셀 `align`과 미디어 `textAlignment`는 `isCanonicalCellAlign`(`left`·`center`·`right`)을 그대로 쓰고 `justify`를 계속 거절한다.
  - io: `data-geul-text-alignment`가 없는 `p`·`h1`–`h6`·`blockquote`·`li`·callout·블록 자식 없는 `div`의 `style` `text-align`을 `textAlignment`로 읽는다. `data-geul-text-alignment`가 있으면 style은 보지 않고, 무효 값은 필드 없이 경고하며 style로 복구하지 않는다. 블록 자식 없는 `div`는 `data-geul-*`를 읽지 않고 style만 읽는다.
  - io 선택 규칙: `!important`가 먼저이고 같은 중요도는 뒤 선언이 이긴다. 키워드는 ASCII 대소문자를 구분하지 않는다. 문법상 무효한 값(`foo` 등)의 선언은 브라우저처럼 없는 것으로 본다. 문법상 유효하지만 허용 4값이 아닌 값(`start`·`end`·`inherit`·`var()` 등)이 이기면 값 없음이고 앞 선언으로 되돌아가지 않는다. `li`·`blockquote`·callout이 승격한 `p`는 바깥 요소보다 안쪽 우선이다. 브라우저 복사의 계산 스타일 덤프 안 `text-align: start`는 정렬로 읽지 않는다.
  - io: GFM strict export는 `justify`를 기존 정렬과 같은 `BLOCK_ALIGN` 손실로 거절한다.
  - core: `setBlockTextAlignment`가 `justify`를 받는다. 공개 타입의 `align`이 `TextBlockAlignment | null`로 넓어졌다. 편집 화면은 정렬을 blockContent 노드에 `text-align`으로 보여 준다. 이전에는 저장만 되고 화면에 보이지 않았다. 자식 블록은 부모 정렬을 상속하지 않는다. `justify` 버튼은 없다. 블록 메뉴는 현재 정렬을 바꾸지 않는 한 `justify` 블록을 덮어쓰지 않는다.
  - 0.2.3 호환(0.2.3 패키지로 실측): `textAlignment: "justify"`가 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`가 `DOCUMENT_INVALID`(`textAlignment must be one of left, center, right`)로 거절한다. `replaceDocument`는 `{ ok: false }`를 돌려준다. 0.2.3 `importHtml`은 `data-geul-text-alignment="justify"`를 필드 없이 제거하고 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 낸다. 0.2.3은 `style`의 `text-align`을 읽지 않고 `style` 제거 경고를 낸다.

  - 빈 `data-geul-text-alignment`도 무효 속성으로 경고하고 style로 복구하지 않는다. CSS 정렬 키워드는 이스케이프를 푼 토큰으로 읽으며, 잘못된 `var(foo)`·`var()` 선언은 앞 유효 정렬을 지우지 않는다.

### Patch Changes

- Updated dependencies [6fb3b6b]
- Updated dependencies [6fb3b6b]
- Updated dependencies [6fb3b6b]
  - @cp949/geul-model@0.3.0

## 0.2.3

### Patch Changes

- fc82881: Markdown 가져오기가 맨몸 URL·www·이메일을 link 마크로 만들던 문제를 고친다.

  - GFM autolink literal은 link 없이 평문으로 들어온다. 글자는 그대로다.
  - 이전에는 평문 URL을 내보내고 다시 가져오면 link 마크가 새로 붙었다. 경고는 없었다.
  - href가 무효인 맨몸 입력(예: `http://.` 뒤 NBSP)이 `importMarkdown` 실패를 일으키던 문제도 사라진다.
  - `[text](url)`, `<url>`, 참조 링크는 이전처럼 link다.
  - 클립보드 Markdown 붙여넣기(`detectMarkdownPaste`)도 같은 경로라 맨몸 URL이 link가 되지 않는다.

- 4a20c43: markdown 내보내기가 같은 mark를 가진 인접 글자 런을 한 구문으로 합쳐 내보낸다. strike와 code에서 재가져오기 때 구분자가 글자로 새던 결함이 고쳐진다.

  - strike 두 런(`a`, `b`)이 `~~a~~~~b~~`로 나가 재가져오기에서 `a~~~~b`가 되던 출력이 `~~ab~~`로 바뀐다.
  - code 두 런(`a`, `b`)이 `` `a``b` ``로 나가 재가져오기에서 `a``b`가 되던 출력이 `` `ab` ``로 바뀐다. backtick을 가진 런도 같은 규칙으로 하나의 code로 나간다.
  - bold, italic과 `href`가 같은 link도 인접하면 한 구문으로 나간다(예: `**ab**`, `[ab](https://a.com)`). 이전에도 재가져오기 결과는 같았다.
  - 일부만 겹치는 조합도 안쪽 구문을 합쳐 낸다. 예: bold `a` + bold·strike `b`가 `**a~~b~~**`로 나가고 글자와 mark가 원본과 같다.
  - 합치지 않는 경우는 출력이 그대로다. strike 사이에 평문이 끼면 `~~a~~x~~b~~`다. `href`가 다른 link도 따로 나간다.
  - 재가져오기 결과는 인접한 같은 mark 런이 하나의 런으로 돌아온다. 입력 런의 분할만 사라지고 글자와 mark는 같다.

- 1b9d938: lossy markdown 내보내기가 mark 없이 통과한 런 옆의 `\`+글자를 재가져오기에서 글자 그대로 되돌리게 한다.

  - lossy는 underline·textColor·backgroundColor 런을 mark 없이 내보낸다. 이 런이 앞뒤 평문과 나란히 놓여 `\`+글자로 이어지면 `\&#x61;**(**`처럼 나가 재가져오기에서 `a`가 글자 `&#x61;`로 남던 결함이 고쳐진다. `\`가 하나 더 붙어 `\\&#x61;**(**`로 나간다. 재가져오기 결과가 원본(mark 손실 제외)과 같다.
  - 예: `\` + underline(`a`) + bold(`(`)가 `\&#x61;**(**`에서 `\\&#x61;**(**`로 나간다. `x\` + underline(`a`) + italic(`(`)가 `x\&#x61;*(*`에서 `x\\&#x61;*(*`로 나간다.
  - 이미 맞던 출력에도 `\`가 늘 수 있다. 예: bold(`\`) + bold·underline(`a`) + `(`가 `**\a**(`에서 `**\\a**(`로 나간다. 재가져오기 결과는 같다. 앞 changeset의 보수적 보정과 같은 비용이다.
  - strict 출력은 정규형 문서(mark 집합이 같은 인접 런을 합친 문서)에서 바뀌지 않는다. 합치지 않은 문서는 인접 평문 text가 이어질 때 이스케이프가 늘거나 줄 수 있다. 예: `a_` + `_b`는 `a\_\_b`에서 `a__b`로, `1` + `. x`는 `1. x`에서 `1\. x`로 나간다. 재가져오기 결과는 같거나 더 낫다. 뒤쪽 예는 목록으로 읽혀 글자가 사라지던 출력이 고쳐진 것이다.
  - 원인은 인접한 평문 `text` 노드 둘이 합쳐지지 않는 것이다. 앞 노드 끝의 `\`는 뒤 노드의 첫 글자를 구분자로 보지 못해 보정을 건너뛴다. 출력 트리에서 인접한 평문 `text` 노드를 합치는 패스를 더했다. 의존 변경은 없다.

- 53bf9ed: markdown 내보내기가 구분자 옆 astral 글자(이모지, 수학 기호 등) 앞뒤의 `_`를 이스케이프하게 한다.

  - 구분자(strike 등) 뒤 평문이 astral 글자로 시작하고 둘째 글자가 `_`이면 `_`가 이스케이프되지 않아 재가져오기가 깨지던 결함이 고쳐진다. `𝐚`(U+1D41A) 뒤 `_b.`가 `~~)~~&#x1D41A;_b.**_(_**`로 나가 `_`가 여는 구분자로 읽혔다. `~~)~~&#x1D41A;\_b.**_(_**`로 나간다. 재가져오기 결과가 원본과 같다.
  - 거울 방향도 같은 결함이었다. 마지막 글자가 astral이고 끝에서 둘째 글자가 `_`이며 뒤에 strike가 오면 `_`가 닫는 구분자로 읽혔다. `a\_&#x1D41B;`처럼 `\_`가 붙어 나간다.
  - `😀_b.`처럼 이모지로 시작하는 평문도 같다.
  - 출력이 달라지는 입력은 구분자 옆 astral 글자 바로 뒤나 앞이 `_`인 text다. BMP 글자와 구분자 옆이 아닌 astral 글자의 text 출력은 바뀌지 않는다. 다만 아래처럼 astral 글자가 든 bold·italic 샌드위치는 이제 끌어올려져 구분자 배치가 달라진다.
  - 글자는 바뀌지 않는다. astral 글자는 판정에서만 BMP 글자로 취급하고 출력에는 원래 글자가 나간다.
  - 한계: text에 U+E000(사설 영역 글자)이 있으면 이 보정을 건너뛴다. 그 text에서는 구분자 옆 astral 글자 옆 `_`가 이스케이프되지 않는 결함이 남는다.
  - bold·italic 샌드위치 끌어올림이 astral 글자가 든 입력을 건너뛰던 제한이 사라진다. 같은 릴리스의 #415·#416 항목을 보라.
  - 원인은 `mdast-util-to-markdown` 2.2.0의 `util/safe.js`다. intraword `_` 예외 판정이 UTF-16 코드 유닛 인덱스를 써서 2유닛인 astral 글자를 비껴간다. 라이브러리 패치는 없다. `text` 핸들러가 astral 글자를 `state.safe` 안에서만 U+E000으로 바꿔 넘긴다.

- 18a0663: markdown 내보내기가 빈 글자 런과 이모지 옆 여러 겹 mark 런에서 깨진 문자 참조를 출력하던 결함을 고친다.

  - 빈 글자 런 뒤의 bold·italic, bold·strike 등 여러 겹 mark 런이 `&#xNAN;`을 출력하던 결함이 고쳐진다.
  - 이모지 옆의 여러 겹 mark 런이 깨진 서로게이트를 출력하고 `importMarkdown`이 실패하던 결함이 고쳐진다.
  - 원인은 내부 markdown 직렬화 의존 `mdast-util-to-markdown@2.1.2`다. 2.2.0으로 올려서 고친다. 소스 변경은 없다.
  - 여러 겹 mark 표기가 `***a***`에서 `**_a_**`로 바뀐다. 재가져오기 결과는 같다.
  - 단어 안 밑줄과 링크 글자의 밑줄을 더 이상 `\_`로 이스케이프하지 않는다. 예: `snake\_case`가 `snake_case`로, `한글\_밑줄`이 `한글_밑줄`로 나간다. 재가져오기 결과는 이전과 같다. 단어 가장자리 밑줄(`\_x\_`)은 그대로 이스케이프한다.
  - 전이 의존 `micromark-util-character`, `micromark-util-html-tag-name`이 늘어난다. 둘 다 MIT 라이선스다.

- 0f6d789: markdown 내보내기가 구분자 앞에서 끝나는 `\`+글자를 재가져오기에서 글자 그대로 되돌리게 한다.

  - 글자 런이 `\`+글자로 끝나고 바로 뒤에 굵게·기울임·취소선 구분자가 오면 `\&#x61;**(**`처럼 나가 재가져오기에서 `a`가 글자 `&#x61;`로 남던 결함이 고쳐진다. `\`가 하나 더 붙어 `\\&#x61;**(**`로 나간다. 재가져오기 결과가 원본과 같다.
  - 출력이 달라지는 입력은 구분자 앞에서 끝나는 `\`+글자뿐이다. 예: `\a` + bold(`(`), bold(`\ `) + `x`.
  - 문자 참조가 필요 없는 자리에서도 구분자 앞 `\`+글자는 `\\`로 나간다. 예: `\a` + bold(`b`)가 `\a**b**`에서 `\\a**b**`로 나간다. 재가져오기 결과는 같다.
  - 구분자가 뒤따르지 않는 `x\a`나 끝 글자가 구두점인 `\.`은 보정 대상이 아니다. 구분자 앞 `\.`은 이미 `\\.`로 나가던 출력 그대로다.
  - 앞 changeset(strike 앞뒤 공백)의 "백슬래시로 끝나는 런은 예외다" 문구는 이 수정으로 해소된다.
  - 원인은 `mdast-util-to-markdown` 2.2.0이 구분자 옆 글자만 문자 참조로 바꾸고 그 앞 `\`를 그대로 두는 것이다. `\&`는 이스케이프된 `&`로 읽힌다. `remark-stringify`의 `handlers.text`에 보정 핸들러를 넘긴다. 의존 변경은 없다.

- 980fe8c: markdown 내보내기가 bold·italic 런이 이어질 때 구분자를 연달아 붙이지 않게 한다.

  - bold·italic 런이 `italic · bold·italic · italic`으로 이어지면 `*.****a****a****a****a*`처럼 구분자 `*`가 연달아 붙어 나가던 결함이 고쳐진다. 재가져오기에서 닫는 구분자가 글자로 새 글자와 mark가 달라졌다. `*.**a**a**a**a*`로 나간다. 재가져오기 결과가 원본과 같다.
  - 앞 런이 bold·italic이면 `***.*&#x61;***a****a****a*`처럼 나가던 입력도 같은 결함이었다. `***.*&#x61;***&#x61;__&#x61;__&#x61;*`로 나간다. 재가져오기 결과가 원본과 같다.
  - 출력이 달라질 수 있는 입력은 `emphasis · strong[emphasis] · emphasis` 모양을 가진 입력이다. 앞 런의 종류와 경계 글자는 보지 않는다. 이미 끌어올리던 입력은 같다. 영숫자 경계 입력은 `**a***a*__*a*__*1*`에서 `**a***a**a**1*`로 나간다. 재가져오기 결과는 같다.
  - 모양 밖 입력의 출력은 바뀌지 않는다.
  - astral 글자(U+10000 이상)가 든 입력도 끌어올린다. astral 글자 옆 `_` 이스케이프 누락(#414)이 고쳐져 끌어올려도 왕복이 같다. 앞쪽 샌드위치를 끌어올리면서 astral이 든 뒤쪽 샌드위치의 구분자 배치가 바뀌어 깨지던 7런 이상의 입력도 같다.

- d92e81a: markdown 내보내기가 구두점으로 끝나는 bold 뒤 italic · bold·italic · italic 런을 재가져오기가 맞는 구분자로 내보내게 한다.

  - `.`(bold) `a`(italic) `a`(bold·italic) `1`(italic) 런이 `**.***a****a****1*`로 나가던 결함이 고쳐진다. 구분자 `*`이 연달아 붙어 재가져오기에서 닫는 구분자가 글자로 새고 글자와 mark가 달라졌다. `**.***&#x61;__&#x61;__&#x31;*`로 나간다. 재가져오기 결과가 원본과 같다.
  - 첫 런이 `!`, `(`, `_`, `~`, `*`이고, 앞뒤에 런이 더 붙은 입력(`X B I X I`, `N B I X I`, `B I X I N`)과 표 셀 안도 같은 결함이었다. 모두 고친다.
  - 출력이 달라지는 입력의 조건은 같은 릴리스의 후속 수정(#416)이 넓혔다. 앞 런의 종류와 경계 글자를 보지 않고 `italic · bold·italic · italic` 모양이면 끌어올린다.
  - strike, 코드, 표 셀 개행으로 끝나는 앞 bold 런은 글자가 영숫자여도 같은 결함이었다.
    - `a`(bold·strike)가 `**~~a~~***a****a****1*`로 나가던 것이 `**~~a~~***&#x61;__&#x61;__&#x31;*`로 나간다.
    - `.`(bold·code)가 ``**`.`***a****a****1*``로 나가던 것이 ``**`.`***&#x61;__&#x61;__&#x31;*``로 나간다.
    - 표 셀의 `.` + 개행(bold)이 `**.<br>***a****a****1*`로 나가던 결함도 고친다.
  - 끌어올린 뒤 같은 모양이 다시 이어지면 변화가 없을 때까지 끌어올린다. 한 번만 끌어올리면 `****` 연쇄가 남는 입력이 생긴다. `.`(bold) `a.`(italic) `a`(bold·italic) `a`(italic) `.`(bold·italic) `a`(italic)은 `**.**_a.**a**&#x61;**.**&#x61;_`로 나간다. 재가져오기 결과가 원본과 같다.
  - 앞 bold 런이 영숫자로 끝나도 바로 뒤 italic 런이 구두점으로 시작하면 같은 결함이었다. `a`(bold) `.a`(italic) `a`(bold·italic) `a`(italic)이 `**a***.a****a****a*`로 나가던 것이 `**a**_.a**a**a_`로 나간다. 샌드위치가 둘 이어지는 입력에서 앞 샌드위치를 끌어올려도 뒤 샌드위치가 깨지지 않는다.
  - 샌드위치나 이웃 런에 astral 글자(이모지, 수학 기호 등)가 있어도 끌어올린다. astral 글자 옆 `_` 이스케이프 누락(#414)이 고쳐져 끌어올려도 왕복이 같다.
  - 모양 밖 입력(`B I X`, `B X I`, strong 자식이 둘인 모양)의 출력은 바뀌지 않는다.
  - 달라지는 출력은 italic 안에 bold를 품은 모양이 된다. 글자가 문자 참조(`&#x61;`)로 나갈 수 있다. 입력에 따라 다르다. 예를 들어 `X(.) I X I`는 `__*.*__*a**a**1*`로 나간다. 모두 유효한 markdown이고 재가져오기 결과는 같다.
  - 원인은 `mdast-util-to-markdown` 2.2.0의 탐욕 탐색이다. `***` 연쇄를 풀지 못한다. 왕복이 맞는 구분자 조합은 있다. `inlineNodes`가 `emphasis · strong[emphasis] · emphasis`를 `emphasis[…, strong[…], …]`로 끌어올려 라이브러리가 푸는 모양으로 바꾼다. 의존 변경은 없다.

- ebedf14: markdown strict 내보내기가 빈 bulletListItem의 마커 줄이 thematic break로 읽히는 두 모양을 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절하고, lossy 내보내기가 같은 경고를 낸다.

  - 첫 자식이 divider인 빈 bulletListItem: 마커가 `-`이면 `- ---`가 재가져오기 때 thematic break 한 줄이 된다. 앞 형제가 checkListItem·toggleListItem일 때 `-`가 나온다.
  - 첫 자식 사슬로 3단 이상 이어지고 끝이 자식 없는 빈 bulletListItem: `* * *`가 thematic break 한 줄이 된다. 마커와 무관하다.
  - 경고 kind는 기존 `NESTED_CHILDREN`을 재사용한다. 메시지만 모양별로 다르다. `MarkdownLoss` 타입은 바뀌지 않는다.
  - 사슬은 3단 이상이 시작되는 블록마다 1건이다. 4단은 2건이다.
  - divider 항목은 모양만 본다. 마커가 `*`라 안전한 `* ---`도 거절한다.
  - `numberedListItem`·`quote`의 divider 자식과 2단 사슬은 대상이 아니다.
  - lossy 출력은 바뀌지 않는다. 경고만 더해진다.
  - toggleListItem·checkListItem이 낀 사슬은 기존 `TOGGLE_STATE_LOST`·`CHECKED_STATE_LOST`가 먼저 잡는다. 이 경고는 더하지 않는다.

- 90dfa38: Markdown 내보내기가 보존하지 못하는 hardBreak(`\n`)를 손실로 보고한다.

  - 블록 끝, `bold`·`italic`·`strike` 런 끝, 제목 3–6 안쪽의 `\n`이 대상이다.
  - `strict`는 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절한다. `lossy`는 새 손실 kind `HARD_BREAK_LOST`를 블록당 1건 보고한다.
  - 이전에는 경고 없이 글자가 바뀌었다. `a\n`은 `a\`로 나가 개행이 사라졌다. `**a\n**`은 `**a\&#xA;**`로 나가 글자가 `a&#xA;`가 됐다.
  - 표 셀, 중간·시작 개행, `link`만 달린 런, `code` 런, 제목 1·2 안쪽은 대상이 아니다. 출력도 그대로다.
  - 제목 1·2도 글자가 전부 개행뿐이면 대상이다. ATX 제목으로 나가 개행이 공백이 된다. 출력은 그대로다.
  - 정리하면 빈 content가 되는 컨테이너(`\n`뿐인 목록 항목·quote)는 빈 content와 같은 구조 경고를 낸다. `NESTED_CHILDREN`·`CHECKED_STATE_LOST`다. 이전에는 구조가 깨진 출력이 나갔다.
  - `lossy` 출력이 바뀌는 입력:
    - 블록 끝 `\n`은 전부 지워진다. 예: `a\n` -> `a`, `a\n\n` -> `a`.
    - `bold`·`italic`·`strike` 런 끝 `\n`은 mark 밖 평문 개행이 된다. 예: `**a\n**`+`b` -> `**a**`, 개행, `b`. 개행의 mark는 사라진다.
    - `link`와 `bold`·`italic`·`strike`가 함께 달린 런도 같다.
    - 제목 3–6 안쪽 `\n`은 이전처럼 공백 한 칸이다. 출력은 같고 경고만 더해진다.
  - 끝 개행이 남은 문서(Shift+Enter 뒤)의 `strict` 내보내기가 거절될 수 있다.

- f117644: Markdown 가져오기가 선두 BOM(U+FEFF)의 유무와 개수에 상관없이 같은 결과를 낸다.

  - 이전에는 BOM이 붙은 소스에서 참조 이미지 후처리가 offset을 한 글자 어긋나게 읽었다. BOM이 둘 이상이면 BOM 글자가 문단에 남았다.
  - 끊어진 참조 이미지: `IMAGE_DOWNGRADED` 경고와 평문화가 사라지고 `![그림][missing]`이 그대로 남았다.
  - list 중첩 가드: 한 줄 안 중첩(`- - - x`)이 BOM에 가려져 `MARKDOWN_LIST_NESTING_TOO_DEEP` 거절을 통과했다.
  - 지금은 선두 BOM을 입력 단계에서 모두 떼고 가드·파서·후처리가 같은 문자열을 본다. BOM 없는 소스와 결과가 같다.
  - 선두가 아닌 위치의 BOM은 글자로 남긴다.

- 59c55bc: Markdown 가져오기가 CR·CRLF 줄바꿈을 LF로 읽는다.

  - 이전에는 CR이 있는 소스가 거절되거나 글자가 조용히 틀어졌다.
  - 거절: 문단, 목록, 인용, inlineCode, 인라인·블록 html, 맨몸 URL 뒤 줄바꿈. `MARKDOWN_DOCUMENT_INVALID`를 반환했다.
  - 조용한 손상: 이미지 alt 줄바꿈의 `\r`이 `name`에 남았다. 예: `![a\r\nb](url)` -> `name`이 `a\r\nb`.
  - 지금은 소스의 `\r\n`과 `\r`을 `\n`으로 바꿔 파싱한다. LF 소스와 결과가 같다.
  - `\r` 외 C0 제어문자는 이전처럼 거절한다.

- eb3ff20: Markdown 가져오기가 이스케이프 URL·NBSP·`\@`, 정의 없는 참조 대괄호 안 맨몸 literal(`[www.x.com][d]`)과 같은 text에 있는 끊어진 참조 이미지도 평문으로 내리고 경고를 붙인다.

  - 이전에는 `https\://a.com ![a][x]`의 `![a][x]`가 원문으로 남고 경고가 없었다.
  - 원인: remark-gfm의 autolink literal 변환이 text를 쪼개 위치(`position`)를 지웠다. 위치 없는 text는 소스와 맞출 수 없었다.
  - 지금은 파서에서 그 변환만 끈다. 위 입력은 `https://a.com a [x]`와 `IMAGE_DOWNGRADED` 경고 1건을 낸다.
  - literal은 이전처럼 link 없는 평문으로 가져온다. 명시 링크와 정의 있는 참조 이미지의 결과는 같다.

- 72c121b: Markdown 가져오기가 컨테이너 안 끊어진 참조 이미지를 평문으로 내린다.

  - 이전에는 여러 줄 인용, 들여쓴 목록 항목, 이스케이프·문자 참조가 낀 text에서 `![a][x]`가 원문 그대로 남았다. `IMAGE_DOWNGRADED` 경고도 없었다.
  - 원인: text 값과 소스 조각을 통째로 비교했다. 줄마다 끼는 `> `·들여쓰기, 줄머리·줄끝 공백, `\X`, `&amp;`가 둘을 다르게 했다.
  - 지금은 값과 소스를 글자 단위로 맞춘다. 소스에 글자 그대로 있는 `!`, `[`, `]`만 참조 이미지로 읽는다.
  - 예: `> 앞 ![a][x]\n> 뒤` -> 인용 `앞 a [x]\n뒤`와 경고.
  - 예: `![a\_b][x]` -> `a_b [x]`와 경고.
  - `\![a][x]`, `&excl;[a][x]`는 이전처럼 평문이고 경고가 없다.
  - 정의 있는 참조 이미지의 결과는 그대로다.

- 178f8cc: markdown 내보내기가 strike 옆 평문의 `_`를 이스케이프하게 한다.

  - strike 바로 뒤 평문이 `a_b.`처럼 둘째 글자가 `_`이고 첫 글자가 `&#x61;`로 바뀌면 `~~)~~&#x61;_b.**_(_**`처럼 나가던 결함이 고쳐진다. `;_b`의 `_`가 여는 구분자로 읽혀 재가져오기에서 글자와 mark가 달라졌다. `~~)~~&#x61;\_b.**_(_**`로 나간다. 재가져오기 결과가 원본과 같다.
  - 거울 방향도 고친다. strike가 italic 안쪽에 있고 앞 평문이 `xa_b`처럼 끝에서 둘째 글자가 `_`이면 `**_xa_&#x62;~~\~~~_**`처럼 나가 `_`가 닫는 구분자로 읽혔다. `**_xa\_&#x62;~~\~~~_**`로 나간다. 재가져오기 결과가 원본과 같다.
  - 출력이 달라지는 입력은 strike 뒤 text의 둘째 글자가 `_`이거나, strike 앞 text의 끝에서 둘째 글자가 `_`인 경우뿐이다.
  - 첫 글자가 문자 참조로 바뀌지 않는 `~~a~~b_c`도 `b\_c`로 나간다. 재가져오기 결과는 같다.
  - 뒤 마크가 italic만인 `~~)~~&#x61;_b.*(*`도 `~~)~~&#x61;\_b.*(*`로 나간다. 재가져오기 결과는 같다.
  - `_`가 첫·끝에서 둘째 자리가 아닌 입력과 strike 안쪽 끝은 출력이 바뀌지 않는다.
  - 원인은 `mdast-util-to-markdown` 2.2.0 `util/safe.js`의 intraword `_` 예외 정규식 `/[*_]/`에 `~`가 빠진 것이다. 첫 글자가 문자 참조로 바뀐 뒤 `_`가 예외를 타지 못했다. `handlers.text`가 `before`·`after`가 `~`이면 `*`로 바꿔 `state.safe`에 넘긴다. 의존 변경은 없다.
  - 첫 글자가 astral(`𝐚_b`)이면 `_`가 이스케이프되지 않던 결함은 이 수정 범위 밖이었다. bold·italic 앞에서도 같았다. #414에서 고쳤다.

- 5be0434: markdown 내보내기가 공백·구두점 경계의 strike 런에서 재가져오기와 어긋나던 결함을 고친다.

  - 앞이나 뒤에 공백이 있는 strike 런이 `a~~ b~~`처럼 나가 재가져오기에서 `~~`가 글자로 새던 결함이 고쳐진다. 공백이 문자 참조로 나가 재가져오기 결과가 원본과 같다. 백슬래시로 끝나는 런은 예외다(strong도 같다). 예: strike(`a `) + `b`가 `~~a&#x20;~~&#x62;`로 나간다.
  - 구두점 경계의 strike 런도 같은 원인이라 함께 고쳐진다. 예: `x` + strike(`,a`) + `y`가 `x~~,a~~y`로 새던 출력이 문자 참조로 나간다.
  - 구두점이나 공백 경계에서만 이웃 글자가 문자 참조로 나간다. 예: `가` + strike(`(a)`)가 `가~~(a)~~`에서 `&#xAC00;~~(a)~~`로 나간다. 예: `가` + strike(`나다,`) + `라`가 `가~~나다,~~라`에서 `가~~나다,~~&#xB77C;`로 나간다. 재가져오기 결과는 원본과 같다.
  - 경계에 구두점이나 공백이 없으면 출력은 그대로다. 예: `가` + strike(`나다`) + `라`는 `가~~나다~~라`다. `a~~b~~c`도 같다.
  - 원인은 `mdast-util-gfm-strikethrough@2.0.0`의 `delete` 핸들러에 `attention`이 없는 것이다. 같은 본문의 핸들러에 `attention`을 선언해 `remark-stringify`의 `handlers.delete`로 넘긴다. 의존 변경은 없다.
  - 이 효과는 `mdast-util-to-markdown` 2.2.0 이상에서 난다. 2.1.2가 설치된 환경에서는 `attention`이 무시돼 출력이 이전과 같다. 결함도 그대로 남는다.
  - `mdast-util-to-markdown` 2.2.0 override는 이 저장소 workspace에만 있다. 소비자 환경의 설치 버전은 소비자의 의존 해석이 정한다.

- 59e4e60: Markdown 내보내기가 표 셀 `code` 런의 `\|`를 손실로 보고한다.

  - 대상은 표 셀 `code` 런에서 `|` 바로 앞 연속 백슬래시가 홀수 개인 경우다. 예: `x\|y`, `\|`, `\\\|`.
  - 표 파서가 `\\`를 짝으로 읽어 `|`를 열 구분자로 본다. 이전에는 경고 없이 표 열이 갈라졌다.
  - `strict`는 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절한다. `lossy`는 새 손실 kind `INLINE_CODE_TABLE_PIPE`를 셀당 1건 보고한다.
  - 인접한 `code` 런은 내보낼 때 하나로 합쳐지므로 합친 값으로 판정한다. underline·색으로 갈라진 런도 같다. 합쳐진 런은 모두 `code`를 잃는다.
  - 짝수 개(0 포함) 백슬래시, `|`가 뒤따르지 않는 백슬래시, 평문 `\|`, 표 밖 `code` 런은 대상이 아니다. 출력도 그대로다.
  - `lossy` 출력이 바뀌는 입력:
    - 대상 `code` 런은 `code` 마크를 잃고 평문이 된다. 글자는 그대로다. 예: `` `x\|y` `` -> `x\|y`.
    - `bold`·`italic`이 함께 달린 런은 `code`만 잃는다. `bold`·`italic`은 남는다.
    - 이웃 평문 런과 합쳐져 평문 런 하나로 재가져와진다.
  - `\|`가 든 `code` 표 셀의 `strict` 내보내기가 거절될 수 있다.

- @cp949/geul-model@0.2.3

## 0.2.2

### Patch Changes

- b3481e8: markdown strict 내보내기가 두 모양을 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절하고, lossy 내보내기가 같은 경고를 낸다.

  - 내용이 비고 자식이 없는 체크 항목: `CHECKED_STATE_LOST`. 체크박스를 붙일 문단이 없어 `*`만 나가고 checked가 사라진다.
  - 내용이 빈 목록 항목·인용의 첫 자식이 이미지(callout 포함): `NESTED_CHILDREN`. 이미지가 mdast 문단으로 나가 재가져오기 때 own content로 뭉치고 자식이 사라진다.
  - mark 없는 빈 글자 런만 가진 content(`[{ text: "" }]`)도 빈 content와 같게 판정한다. 이 입력의 lossy 출력은 빈 단락을 만들지 않아 깨진 markdown이 나오지 않는다. 이 입력은 lossy 출력이 바뀌는 유일한 경우다.
  - 내용이 빈 `checkListItem`의 첫 자식이 이미지·callout·미디어이면 경고 kind가 `CHECKED_STATE_LOST`에서 `NESTED_CHILDREN`으로 바뀐다. 체크박스는 첫 자식 문단이 받으므로 유지된다.
  - `NESTED_CHILDREN`·`CHECKED_STATE_LOST`의 `message` 문구가 컨테이너 모양에 맞게 바뀐다.
  - 그 밖의 lossy 출력은 바뀌지 않는다. 경고만 더해진다.
  - 신규 export는 없다.
  - 알려진 제한([Issue #392](https://github.com/cp949/geul/issues/392)): 내용이 빈 `bulletListItem`의 첫 자식이 `divider`이고 앞 형제가 다른 종류의 목록이면 `- ---`이 나가 thematic break로 재가져온다. 내용이 빈 `bulletListItem`을 3단으로 중첩해도 `* * *`이 나가 같다. 두 경우 모두 strict가 거절하지 않고 `analyzeMarkdownLoss`가 비어 있다.

- e6bb98d: markdown strict 내보내기가 mark 달린 빈 글자 런을 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절하고, lossy 내보내기가 같은 경고를 낸다.

  - 대상: `bold`, `italic`, `strike`, `code` 중 하나가 붙은 빈 글자 런(`{ text: "", marks }`). 마커만(`****` 등) 나가 재가져오기 때 divider·codeBlock·글자로 구조가 바뀔 수 있다.
  - 런이 content 중간에 끼어도(`a` + 빈 bold 런 + `b`) 보고한다. 블록 content와 표 셀 content 모두 본다.
  - 신규 경고 kind `EMPTY_MARKED_RUN`을 `MarkdownLoss`에 추가한다. 블록당 1건, 표는 셀당 1건이다.
  - 판정은 런 단위라 같은 mark 런이 빈 런을 양쪽에서 감싸 왕복이 일치하는 입력(`******a******`)도 거절한다.
  - `link` 단독 빈 런과 mark 없는 빈 런은 대상이 아니다.
  - `underline`·`textColor`·`backgroundColor` 빈 런은 기존 kind(`UNDERLINE`, `INLINE_COLOR`)만 낸다.
  - lossy 출력은 바뀌지 않는다. 경고만 더해진다.
  - 알려진 제한([Issue #394](https://github.com/cp949/geul/issues/394)): 빈 글자 런 바로 뒤에 `bold`+`italic` 또는 `bold`+`code` 런이 오면 출력에 `&#xNAN;`이 섞여 재가져오기 글자가 달라진다. strict가 거절하지 않는다.
  - 알려진 제한([Issue #395](https://github.com/cp949/geul/issues/395)): 같은 mark를 가진 인접 글자 런(`**a****b**`)은 재가져오기 때 구분자 글자가 본문에 섞인다. strict가 거절하지 않는다.
  - 위 제한 3건은 에디터 조작으로 만들어지는 입력인지 확인하지 않았다. 모델 검증이 허용하는 입력이다.

- Updated dependencies [0ab355a]
- Updated dependencies [79de709]
  - @cp949/geul-model@0.2.2

## 0.2.1

### Patch Changes

- 9ffbd67: 외부 HTML의 `style` 속성 선언 읽기가 Chromium과 같아진다.

  - 속성 이름 앞에 이름 글자가 붙은 선언은 읽지 않는다. `x color:red`, `x1color:red`, `x font-weight:bold`, `_white-space:pre`가 대상이다. 이전에는 쓰레기 글자를 무시하고 `color`·`font-weight`·`white-space`를 읽었다. Chromium은 선언을 버린다.
  - 공백은 CSS 공백(SP·TAB·LF·CR·FF)만 걷는다. NBSP는 이름·값 글자다. `color:`(NBSP)`red`는 이전에 글자 빨강이었고 이제 글자색이 없다.
  - 값에 bad url이 있으면 그 선언을 통째로 버린다. `color:red;background-color:blue;background:url(it's.png)`는 이전에 배경이 지워졌고 이제 배경 파랑이다. `background:url(a b.png) red`는 이전에 배경 빨강이었고 이제 배경이 없다.
  - 이름 안 이스케이프를 읽는다. `color:red;background:\75rl(it's.png);color:blue`는 이전에 글자 빨강이었고 이제 글자 파랑이다.
  - `text-align`의 `!important`를 읽는다. 표 셀 붙여넣기에서 `text-align:center !important`가 정렬 center가 된다. 이전에는 정렬이 없었다.
  - `text-decoration`·`text-decoration-line`·`font-style` 값을 CSS 토큰 단위로 읽는다. `)` 뒤에 붙은 유효 토큰(`underline calc(1px)red`)은 이전에 선언이 무효라 앞의 값을 지켰고 이제 밑줄이다. `underline --é(1px)`처럼 비ASCII·이스케이프 이름의 사용자 정의 함수 호출은 이전에 무효였고 이제 장식을 끈다. 따옴표 안의 `--f(`·`var(`(`underline "a --f(1px)"`)는 이전에 장식을 껐고 이제 무효라 앞의 값을 지킨다. 최상위 `{}` 블록은 무효다.
  - `font` 줄임·`font-weight`·`white-space` 값을 CSS 토큰 단위로 읽는다. 주석은 낱말을 가르고(`white-space:preserve/**/nowrap`은 보존), 키워드는 이스케이프를 푼 이름으로 읽는다(`font-weight:b\6fld`는 굵게, `white-space:pre\-wrap`은 보존). 입력 끝 `\`는 글꼴 이름 글자다(`font:bold 12px a\`는 이전에 무효였고 이제 굵게). 크기 뒤 따옴표 문자열은 공백 없이 붙어도 낱말이다(`font:bold 12px"a"`는 이전에 무효였고 이제 굵게). NBSP·U+3000은 `white-space` 낱말을 가르지 않는다(`white-space:preserve`(NBSP)`nowrap`은 이전에 보존이었고 이제 무효라 앞의 값을 지킨다). DEL은 글꼴 이름 글자가 아니다(`font:bold 12px a`(DEL)는 이전에 굵게였고 이제 무효). 이스케이프로 쓴 예약어 글꼴 이름(`font:bold 12px \69nherit`)은 이전에 유효였고 이제 무효다.
  - `color`·`background-color`·`background` 값을 CSS 토큰 단위로 읽는다. 닫히지 않은 함수와 url은 입력 끝에서 닫힌다. `color:rgb(255,0,0`는 이전에 무효라 앞의 값을 지켰고 이제 글자 빨강이다. `background:url(x.png`는 이전에 앞의 배경색을 지켰고 이제 배경색을 지운다. 이름·hash·단위 이스케이프를 읽는다(`color:\72 ed`, `color:#\66 00`은 이전에 무효였고 이제 빨강). 키워드는 ASCII 대소문자만 같게 본다. 켈빈 기호가 든 `blac`+U+212A는 이전에 검정이었고 이제 무효다.

- a606898: `importHtml`이 깊이 상한(64단)의 wrapper·details에 공백뿐인 children 컨테이너가 있을 때 거짓 `NESTED_CHILDREN_FLATTENED` 경고를 내지 않는다.

  - 64단 children wrapper나 토글 details의 children 컨테이너가 공백, NBSP, zero-width 문자뿐이면 이전에 `NESTED_CHILDREN_FLATTENED`가 났고 이제 경고가 없다. 문서 내용은 이전과 같다.
  - 요소나 실질 텍스트가 있으면 이전처럼 경고한다.
  - 한계: 빈 `<span>`·`<div>`처럼 블록이 나오지 않는 요소만 든 컨테이너는 계속 경고한다.

- dd703fd: `importHtml`이 `data-geul-media-type="iframe"`을 단 `<a>`에 거짓 `SAFE_BLOCK_DOWNGRADED` 경고를 내지 않는다.

  - iframe 블록으로 읽히는 `<a data-geul-media-type="iframe" …>`는 이전에 `SAFE_BLOCK_DOWNGRADED`(element `a`) 경고가 났고 이제 경고가 없다. 문서 내용은 이전과 같다.
  - 경고 수집기가 마커 값 표와 블록 태그 이름 표를 변환기와 같은 표에서 읽는다. 다른 경고는 바뀌지 않는다.

- @cp949/geul-model@0.2.1

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
