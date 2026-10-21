# @cp949/geul-model

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

- 6fb3b6b: 텍스트 블록 정렬이 `justify`를 받고, 외부 HTML의 inline `text-align`을 읽고, 편집 화면에 보인다.

  - model: `TextBlockProps.textAlignment`가 `left`·`center`·`right`·`justify`를 받는다. 신규 export는 `TEXT_BLOCK_ALIGNMENTS`, `TextBlockAlignment`, `isCanonicalTextBlockAlign`이다. 표 셀 `align`과 미디어 `textAlignment`는 `isCanonicalCellAlign`(`left`·`center`·`right`)을 그대로 쓰고 `justify`를 계속 거절한다.
  - io: `data-geul-text-alignment`가 없는 `p`·`h1`–`h6`·`blockquote`·`li`·callout·블록 자식 없는 `div`의 `style` `text-align`을 `textAlignment`로 읽는다. `data-geul-text-alignment`가 있으면 style은 보지 않고, 무효 값은 필드 없이 경고하며 style로 복구하지 않는다. 블록 자식 없는 `div`는 `data-geul-*`를 읽지 않고 style만 읽는다.
  - io 선택 규칙: `!important`가 먼저이고 같은 중요도는 뒤 선언이 이긴다. 키워드는 ASCII 대소문자를 구분하지 않는다. 문법상 무효한 값(`foo` 등)의 선언은 브라우저처럼 없는 것으로 본다. 문법상 유효하지만 허용 4값이 아닌 값(`start`·`end`·`inherit`·`var()` 등)이 이기면 값 없음이고 앞 선언으로 되돌아가지 않는다. `li`·`blockquote`·callout이 승격한 `p`는 바깥 요소보다 안쪽 우선이다. 브라우저 복사의 계산 스타일 덤프 안 `text-align: start`는 정렬로 읽지 않는다.
  - io: GFM strict export는 `justify`를 기존 정렬과 같은 `BLOCK_ALIGN` 손실로 거절한다.
  - core: `setBlockTextAlignment`가 `justify`를 받는다. 공개 타입의 `align`이 `TextBlockAlignment | null`로 넓어졌다. 편집 화면은 정렬을 blockContent 노드에 `text-align`으로 보여 준다. 이전에는 저장만 되고 화면에 보이지 않았다. 자식 블록은 부모 정렬을 상속하지 않는다. `justify` 버튼은 없다. 블록 메뉴는 현재 정렬을 바꾸지 않는 한 `justify` 블록을 덮어쓰지 않는다.
  - 0.2.3 호환(0.2.3 패키지로 실측): `textAlignment: "justify"`가 있는 문서를 0.2.3 model `parseDocument`와 core `createEditor`가 `DOCUMENT_INVALID`(`textAlignment must be one of left, center, right`)로 거절한다. `replaceDocument`는 `{ ok: false }`를 돌려준다. 0.2.3 `importHtml`은 `data-geul-text-alignment="justify"`를 필드 없이 제거하고 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 낸다. 0.2.3은 `style`의 `text-align`을 읽지 않고 `style` 제거 경고를 낸다.

  - 빈 `data-geul-text-alignment`도 무효 속성으로 경고하고 style로 복구하지 않는다. CSS 정렬 키워드는 이스케이프를 푼 토큰으로 읽으며, 잘못된 `var(foo)`·`var()` 선언은 앞 유효 정렬을 지우지 않는다.

## 0.2.3

No changes in this release.

## 0.2.2

### Patch Changes

- 0ab355a: 순차 id 팩토리를 쓰는 편집기가 iframe으로 끝나는 문서에서 `Duplicate id`로 던지던 결함을 고친다.

  - core: 점유 id 수집이 `file`·`image`·`video`·`audio`만 보고 `iframe`을 빠뜨렸다. 이제 `iframe`도 점유 id로 등록한다.
  - model: 블록 종류 분류 표를 추가한다. 신규 export는 `MediaBlockType`, `LeafBlockType`, `isMediaBlockType`, `isLeafBlockType`, `isMediaBlock`, `isLeafBlock`이다.
  - model: 알려진 블록 타입 집합이 이 표에서 파생된다. `isKnownBlockType`의 판정은 같다.
  - core: `MediaBlockKind`는 `MediaBlockType`의 별칭으로 유지된다. 공개 타입 이름은 바뀌지 않는다.

- 79de709: 미디어 블록 종류별 필드 소유 표를 추가하고, `getSelectionMediaBlock()`이 iframe의 `showPreview`를 `null`로 보고하게 한다.

  - model: 신규 export는 `MEDIA_BLOCK_FIELDS`, `MediaOwnField`, `MediaBlockTypeWithField`, `mediaBlockTypeHasField`, `mediaBlockHasField`이다. `showPreview`·`previewWidth`·`textAlignment`·`aspectRatio`를 어느 종류가 갖는지 표 하나가 답한다.
  - core: `getSelectionMediaBlock()`이 iframe에서 `showPreview: true`를 보고하던 것을 `null`로 바꾼다. iframe은 `showPreview` 필드가 없다. 같은 이유로 `file`은 원래 `null`이었다. react의 미리보기 토글은 iframe에서 이미 숨겨져 화면 변화는 없다.

## 0.2.1

No changes in this release.

## 0.2.0

### Patch Changes

- b7bdc56: 색이 다른 인접 `span`의 `textColor`·`backgroundColor`가 첫 색으로 합쳐지던 결함을 고친다.

  - `importHtml`이 `<span style="color:#ff0000">a</span><span style="color:#0000ff">b</span>`를 `a`(#FF0000), `b`(#0000FF) 두 조각으로 읽는다. 이전에는 `ab` 한 조각에 첫 색이었다. VS Code 복사처럼 구문 강조 색이 `span`마다 다른 HTML이 색을 유지한다.
  - 같은 판정을 쓰던 model `appendOrMergeInlineItem`·`sameMarks`가 색 값까지 비교한다. 같은 색 인접 `span`은 계속 한 조각이다.
  - core `modelToTiptap`이 색이 다른 인접 조각을 가진 문서를 `contains adjacent inline runs with identical marks`로 거절하던 동작을 없앴다. `tiptapToModel`과 표 셀 코덱의 병합도 색이 다른 조각을 합치지 않는다.
  - `canonicalizeTextMarks`의 중복 제거는 그대로다. 한 조각에 같은 종류 색이 둘이면 앞의 것만 남는다.

- 6ff09fc: `importHtml`이 `pre` 안 무효 문자를 만나도 문서를 거절하지 않고 지운다.

  - `<pre>a&#13;b</pre>`, `<pre>a&#1;b</pre>`, NUL 원문은 `HTML_DOCUMENT_INVALID`로 문서 전체를 거절했다. 이제 `ab`인 `codeBlock`과 `UNSAFE_CODE_POINT_REMOVED` 경고를 반환한다.
  - 최상위 `pre`, `pre > code`, `figure` 안 `pre`, 목록 항목 안 `pre`가 같다. 경고 `element`는 무효 문자가 든 글자의 부모 태그다(`pre`, `pre > code`면 `code`).
  - CR은 줄바꿈으로 바꾸지 않고 지운다. `codeBlock`이 되는 `pre`의 Tab·LF는 코드 내용이라 남기고 경고도 없다. 인라인 글자로 평탄화되는 `pre`의 Tab 삭제는 경고한다(#354).
  - `data-language`의 무효 문자는 이 변경에서 거절을 유지했다. 이후 #353이 거절을 없앴다.
  - model: `sanitizeCodeBlockSource`를 공개한다. `isValidCodeBlockSource`가 거부하는 문자만 지우고 출력은 항상 검증을 통과한다.
  - io: 클립보드 `pre` 정제가 이 함수를 쓴다. 결과는 바뀌지 않는다.
  - core: 붙여넣기 `normalizeKeepingTabs`가 이 함수를 쓴다. 결과는 바뀌지 않는다.
  - core: `text/html`이 `pre` 안 무효 문자를 담은 붙여넣기는 이전에 import 실패로 `text/plain` 폴백이 됐다. 이제 무효 문자를 지운 `codeBlock`이 붙고 `text/plain`은 쓰지 않는다. 지운 뒤 글자가 비면 빈 `codeBlock`이 붙는다(빈 `<pre></pre>`와 같다).

## 0.1.2

### Patch Changes

- npm 패키지 메타데이터(description, repository, homepage, bugs)를 추가한다. 0.1.1까지는 4개 패키지 모두 이 필드가 없어 npm 패키지 페이지에 홈페이지·이슈 링크·설명이 표시되지 않았다.

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
