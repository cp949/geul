# @cp949/geul-core

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

### Patch Changes

- 04f7f99: Enter로 블록을 분할하거나 빈 목록 항목을 문단으로 바꾸면 결과 캐럿이 화면 안으로 스크롤된다. codeBlock 시작 범위 Enter, codeBlock double Enter 탈출과 Shift-Enter 분할도 같다.
- 790aee0: `setBlockType`·`setBlockTypes`와 블록 타입 단축키가 일반 블록 종류를 바꾸면 결과 selection이 화면 안으로 스크롤된다. 변환 뒤 selection이 대상 블록 밖에 있으면(사이드 메뉴 Turn into 등) 스크롤하지 않는다.
- 1a94e1b: `setBlockType`이 일반 블록을 코드 블록으로, 코드 블록을 일반 블록으로 바꾸면 결과 selection이 화면 안으로 스크롤된다. 코드 블록 언어만 바꿀 때는 selection을 옮기지 않으므로 스크롤하지 않는다.
- 21a7847: Shift-Enter로 줄바꿈(hardBreak)을 삽입하면 결과 캐럿이 화면 안으로 스크롤된다.
- Updated dependencies [6fb3b6b]
- Updated dependencies [6fb3b6b]
- Updated dependencies [6fb3b6b]
- Updated dependencies [6fb3b6b]
  - @cp949/geul-model@0.3.0
  - @cp949/geul-io@0.3.0

## 0.2.3

### Patch Changes

- fe6397f: Backspace가 문서를 바꾸지 않는데 undo 단위를 남기던 경우를 고친다. 이제 문서와 undo 이력은 그대로고 캐럿만 앞 블록 끝으로 옮겨 간다.

  - 마지막 블록이 heading, 목록 항목, divider, 표, 자식 딸린 문단일 때 자동 trailing 문단 선두의 Backspace가 그 문단을 지웠다가 새 blockId로 되붙이던 것이 사라진다.
  - 캐럿은 병합 접점으로 이동한다. 접힌 toggle 뒤에서는 숨은 자손이 아니라 toggle 라벨 끝으로 간다.
  - Mod-Backspace와 Shift-Backspace도 같다.
  - 앞 블록이 자식 없는 문단이면 빈 마지막 문단은 이전처럼 Backspace로 지워진다.
  - 마지막 빈 문단에 색이나 정렬이 있으면 Backspace가 이전처럼 병합해 그 속성을 지운다. 속성이 사라지므로 실제 변화다.
  - 마지막 코드 블록 뒤 trailing 문단의 Backspace는 이전처럼 코드 블록을 문단으로 흡수한다.

- f178f2d: 접힌 toggle 라벨 끝의 Delete가 숨은 자손과 병합하던 것을 고친다. 이제 보이는 다음 블록과 병합한다.

  - 숨은 첫 자식이 문단이면 그 글자가 라벨로 빨려 들고 숨은 그룹에서 사라지던 것이 사라진다.
  - 숨은 첫 자식이 divider이면 divider를 건너뛰고 더 안쪽 숨은 글자를 가져가던 것이 사라진다.
  - 숨은 첫 자식이 `codeBlock`이면 그 내용을 라벨에 흡수하던 것이 사라진다.
  - 숨은 자손은 id, 타입, 글자, 접힘 상태가 그대로 남는다.
  - 보이는 다음 블록이 `codeBlock`이면 이전처럼 내용을 라벨 뒤에 붙인다.
  - 보이는 다음 블록이 없으면(`paragraph`를 막은 설정의 문서 끝) 키만 소비하고 문서와 undo 이력을 바꾸지 않는다.
  - 자식 없는 접힌 toggle과 펼친 toggle의 Delete는 이전과 같다.

- 4a7ffee: Delete가 문서를 바꾸지 않는데 undo 단위를 남기던 경우를 고친다. 이제 키만 소비하고 문서와 undo 이력은 그대로다.

  - 빈 마지막 문단에서 Delete를 누르면 같은 문단이 되채워지며 undo 단위가 남던 것이 사라진다. 문단이 하나뿐인 문서도 같다.
  - 마지막 블록이 heading, 목록 항목, divider, 자식 딸린 문단일 때 끝의 Delete가 자동 trailing 문단을 지웠다가 새 blockId로 되붙이던 것이 사라진다.
  - 마지막 코드 블록 끝의 Delete도 같은 증상이 사라진다.
  - 앞 블록이 자식 없는 문단이면 빈 마지막 문단은 이전처럼 Delete로 지워진다. 비어 있지 않은 trailing 문단은 이전처럼 병합된다.
  - 마지막 빈 문단에 색이나 정렬이 있으면 Delete가 이전처럼 병합해 그 속성을 지운다. 속성이 사라지므로 실제 변화다.

- b4a17b2: heading 안 `#` 재발동 입력 규칙이 블록 경계를 걸친 범위 선택 위에서 `TypeError`를 던지던 문제를 고친다.

  - 범위 선택 위 입력은 규칙을 건너뛰고 브라우저 기본 입력(선택 대체 평문)에 맡긴다.
  - 이전에는 heading의 `##` 뒤에서 다음 블록 중간까지 선택하고 공백을 입력하거나, heading 시작부터 선택하고 `# `를 한 번에 입력하면 `Cannot read properties of undefined (reading 'nodeSize')`가 났다.
  - 캐럿(빈 선택) 입력의 재발동 동작은 같다. heading 안에 머무는 범위 선택도 이전처럼 규칙을 건너뛴다.

- 3aace49: `enabledBlockTypes`가 `paragraph`를 막은 설정에서 문서 끝 블록의 Delete가 Tiptap 기본 체인으로 새던 것을 고친다. 문서 끝에는 병합 대상이 없어 키만 소비한다.

  - 문서 끝 빈 목록 항목·heading·quote·callout의 Delete는 키만 소비한다. 문서와 undo 단위는 바뀌지 않는다. 이전에는 빈 블록이 level 1 heading으로 바뀌었다. 빈 level 1 heading은 겉모양 변화 없이 undo 단위만 남았다.
  - toggle·quote 아래 중첩 마지막 자식과 캐럿이 끝인 글자 있는 끝 블록도 같다.
  - 빈 코드 블록이 최상위 유일한 블록이면 지우지 않고 키만 소비한다. 앞 블록이 있으면 이전처럼 코드 블록을 지운다.
  - `paragraph`를 막지 않은 설정은 바뀌지 않는다.

- 8b3d803: `enabledBlockTypes`가 `paragraph`를 막은 설정에서 빈 목록 항목의 Backspace·Enter가 Tiptap 기본 체인으로 새던 것을 고친다. 종료 규칙(항목을 `paragraph`로 바꾼다)은 대상이 없으면 건너뛰고 일반 규칙을 따른다.

  - 빈 항목의 Enter는 키를 소비하고 같은 타입의 새 빈 항목을 연다. 대상은 bullet·numbered·check·toggle 항목이다.
  - 앞 블록이 있는 빈 항목의 Backspace는 항목을 지우고 캐럿을 앞 블록 끝에 둔다. 항목을 앞 블록의 자식으로 들여쓰지 않는다.
  - 문서 최선두 항목과 자식 있는 toggle 헤더의 Backspace는 키만 소비한다. 문서와 undo 단위는 바뀌지 않는다. 이전에는 항목이 heading으로 바뀌거나 들여쓰기됐고 결과가 엔진마다 달랐다.
  - 코드 블록 바로 뒤 목록 항목의 Backspace는 코드 블록을 한 번에 흡수한다. 항목 타입은 유지된다.
  - `paragraph`를 막지 않은 설정은 이전처럼 항목을 `paragraph`로 바꿔 목록을 종료한다.

- 6a873e6: `enabledBlockTypes`가 `paragraph`를 막은 설정에서 heading·quote·callout 끝 Enter가 `TypeError`를 던지던 것을 고친다. 이제 예외 없이 같은 타입의 새 블록을 연다.

  - 새 블록은 원본의 타입과 attrs(heading `level`, callout `icon`)를 복사하고 내용은 비어 있다.
  - 키는 소비하고 undo 단위는 1회다.
  - heading 끝에 여러 줄 평문을 붙여넣을 때 같은 `TypeError`가 나던 것도 사라진다. 줄 사이가 같은 타입으로 분할된다.
  - `paragraph`를 막지 않은 설정의 끝 Enter는 이전처럼 빈 `paragraph`를 연다.

- 76a1532: `enabledBlockTypes`가 `paragraph`를 막은 설정에서 문서 첫 위치 빈 블록의 Backspace가 Tiptap 기본 체인으로 새던 것을 고친다. 바꿀 대상이 없어 키만 소비한다.

  - 문서 첫 텍스트 위치의 빈 heading·quote·callout의 Backspace는 키만 소비한다. 문서와 undo 단위는 바뀌지 않는다. 이전에는 빈 블록이 level 1 heading으로 바뀌었다. 빈 level 1 heading은 겉모양 변화 없이 undo 단위만 남았다.
  - 뒤에 다른 블록이 있거나 자식이 딸린 경우, 인라인 원소만 든 블록도 같다.
  - 앞이 divider·표뿐인 빈 블록과 앞 블록이 있는 빈 블록은 이전처럼 지워지거나 병합된다.
  - `paragraph`를 막지 않은 설정은 바뀌지 않는다.

- 95c6c80: `removeBlocks`가 조상과 자손을 함께 받으면 인자 순서와 무관하게 거절한다.

  - 조상과 자손(자식·손자 포함)을 함께 주면 `COMMAND_NOT_APPLICABLE`로 거절한다. 문서·selection·undo 단위는 바뀌지 않는다.
  - 이전에는 자손을 먼저 적으면 성공했다. 이 조합은 이제 거절로 바뀐다. 호출 쪽에서 조상만 넘기거나 겹치지 않는 대상만 넘긴다.
  - 같은 id를 두 번 주는 경우도 명시적으로 `COMMAND_NOT_APPLICABLE`로 거절한다.
  - 존재하지 않는 id가 섞이면 이전처럼 `BLOCK_NOT_FOUND`가 먼저다.
  - `replaceBlocks`의 동작은 같다. 같은 판정을 공유한다.

- Updated dependencies [fc82881]
- Updated dependencies [4a20c43]
- Updated dependencies [1b9d938]
- Updated dependencies [53bf9ed]
- Updated dependencies [18a0663]
- Updated dependencies [0f6d789]
- Updated dependencies [980fe8c]
- Updated dependencies [d92e81a]
- Updated dependencies [ebedf14]
- Updated dependencies [90dfa38]
- Updated dependencies [f117644]
- Updated dependencies [59c55bc]
- Updated dependencies [eb3ff20]
- Updated dependencies [72c121b]
- Updated dependencies [178f8cc]
- Updated dependencies [5be0434]
- Updated dependencies [59e4e60]
  - @cp949/geul-io@0.2.3
  - @cp949/geul-model@0.2.3

## 0.2.2

### Patch Changes

- 0ab355a: 순차 id 팩토리를 쓰는 편집기가 iframe으로 끝나는 문서에서 `Duplicate id`로 던지던 결함을 고친다.

  - core: 점유 id 수집이 `file`·`image`·`video`·`audio`만 보고 `iframe`을 빠뜨렸다. 이제 `iframe`도 점유 id로 등록한다.
  - model: 블록 종류 분류 표를 추가한다. 신규 export는 `MediaBlockType`, `LeafBlockType`, `isMediaBlockType`, `isLeafBlockType`, `isMediaBlock`, `isLeafBlock`이다.
  - model: 알려진 블록 타입 집합이 이 표에서 파생된다. `isKnownBlockType`의 판정은 같다.
  - core: `MediaBlockKind`는 `MediaBlockType`의 별칭으로 유지된다. 공개 타입 이름은 바뀌지 않는다.

- 988b9aa: `getCaretBlockContext().text`가 hardBreak와 인라인 원소를 지우던 결함을 고친다. 슬래시·이모지·mention popup이 줄바꿈 뒤 글자나 인라인 원소 뒤 글자를 질의로 이어 붙였다.

  - core: `text`는 hardBreak를 `\n`으로 읽는다. 문단 `/`, 줄바꿈, `a`는 `"/\na"`다. 이전에는 `"/a"`라 슬래시 메뉴가 `{ query: "a" }`로 열렸다.
  - core: hardBreak 밖의 인라인 원소(custom 인라인 원소)는 U+FFFC로 읽는다. 이전에는 빈 문자열이었다. 원소만 든 문단의 `text`는 `""`가 아니라 U+FFFC 하나다.
  - core: mention 뒤에 `@a`를 치면 `text`가 U+FFFC에 `@a`가 이어 붙은 값이라 `@` 트리거가 열리지 않는다. 이전에는 picker가 열리고 후보를 확정하면 기존 mention이 지워졌다.
  - core: 일반 텍스트, 마크가 붙은 텍스트, codeBlock(리터럴 `\n`)의 `text`는 그대로다. 반환 타입은 바뀌지 않는다.
  - 알려진 한계: `/`·`:`·`@` 바로 뒤에 인라인 원소가 오면 질의 U+FFFC로 열리고 후보가 0건이다. 데이터를 잃지 않는다.
  - 줄 첫머리 판정은 문단 전체 매치 그대로다.

- d7c5327: `getBlockTypeBlocker`·`getBlockTypesBlocker`가 `enabledBlockTypes`로 막은 타입 대상에 `NOT_APPLICABLE`을 답한다.

  - 막은 타입 대상은 이전에 `null`이거나 다른 구조적 사유(`LIST_CODE_MISMATCH`·`HAS_CHILDREN`·`INVALID_TEXT`·`ALL_CODE_BLOCK`)였고 이제 `NOT_APPLICABLE`이다. `setBlockType`·`setBlockTypes`는 이전에도 `COMMAND_NOT_APPLICABLE`로 거절했다.
  - 질의와 명령의 판정이 같아진다. 거절 코드와 메시지는 바뀌지 않는다.

- f56222d: `duplicateBlock` 복제본이 원본의 로컬 프리뷰 blob URL을 공유하던 결함을 고친다.

  - core: 복제본이 원본과 같은 URL을 가졌다.
  - core: 한쪽이 정리되면 다른 쪽 프리뷰가 깨졌다.
  - core: 이제 복제본(하위 블록 포함)이 같은 파일로 새 URL을 받는다.

- 63ccf4a: 호스트의 `onBeforeChange` 거절 등으로 transaction이 문서에 못 들어갈 때, 발급한 로컬 프리뷰 blob URL이 해제 통지 없이 남던 결함을 고친다.

  - core: `duplicateBlock`과 붙여넣기·드롭 삽입이 URL을 발급한 뒤 dispatch 거절·되돌림·중간 예외로 끝나면, 문서에 못 들어간 URL마다 `onLocalPreviewCleanup`으로 통지한다.
  - core: 판정은 호스트 콜백이 돌기 전에 URL이 문서에 한 번이라도 들어갔는지다. 콜백이 블록을 동기로 지워도 undo 가능한 블록의 URL을 통지하지 않는다.
  - core: 콜백이 `replaceDocument`를 불러도 같은 URL을 두 번 통지하지 않는다.
  - core: 붙여넣기·드롭은 `createId()`가 던지면 URL을 발급하지 않는다.

- f7cf0a0: 로컬 프리뷰가 있는 미디어 블록에서 거절 Result인데 PM 상태가 바뀌고, `updateBlock`이 프리뷰를 조용히 지우던 결함을 고친다.

  - core: `setMediaBlockUrl`과 업로드 적용이 모델이 같고 로컬 프리뷰 attrs만 달라지는 경우 dispatch 전에 `COMMAND_NOT_APPLICABLE`로 거절한다. PM 상태와 change event가 바뀌지 않는다. `updateBlock`도 url과 프리뷰가 함께 심긴 노드를 같은 내용으로 호출하면 같은 방식으로 거절한다.
  - core: `updateBlock`이 모델에서 노드를 다시 만들 때 로컬 프리뷰를 blockId로 이어받는다. 자식 미디어의 프리뷰도 유지한다. 캡션 같은 필드만 바꿔도 프리뷰가 사라지지 않는다.
  - core: `updateBlock`으로 url이 생기면 프리뷰를 정리한다. `onLocalPreviewCleanup` 통지는 그 URL이 undo·redo로 못 돌아올 때 1회 낸다(Issue #382). `setMediaBlockUrl`과 같은 판정이다.

- aa09ddf: 로컬 프리뷰 url 확정을 undo하면 이미 해제 통지한 blob URL이 문서에 돌아오던 결함과, 프리뷰 적용 직후 `undo()`가 거절 Result를 돌려주면서 PM 프리뷰를 지우던 결함을 고친다.

  - core: `setMediaBlockUrl`, `updateBlock`, `replaceBlocks`, 업로드 완료로 url을 확정해도 `onLocalPreviewCleanup`을 즉시 부르지 않는다. 프리뷰 attrs는 그대로 정리한다.
  - core: 통지는 그 URL이 undo·redo로 못 돌아올 때 1회 나간다. undo하면 프리뷰가 돌아온다. 키보드 undo도 같다.
  - core: `undo()`·`redo()`는 PM이 바뀌었으면 모델 변경이 없어도 `ok`를 돌려준다. `onChange`와 revision은 그대로다. 빈 history는 `COMMAND_NOT_APPLICABLE`을 유지한다.
  - core: 로컬 프리뷰 도달 판정은 pending URL이 새로 생겼거나 도달 가능성이 줄 수 있는 변경(eviction, redo 스택 소거, undo·redo)에서만 돈다. 이벤트를 쌓기만 하는 편집마다 history 시뮬레이션이 돌던 입력 지연을 없앤다.

- 947e6e3: 블록이 문서에 남은 채 로컬 프리뷰 blob URL만 빠지는 경로에서 URL이 통지 없이 새던 결함을 고친다.

  - core: 로컬 프리뷰 정리 통지의 추적 단위를 `blockId`에서 URL로 바꾼다. `replaceBlocks` 재삽입, 삭제 뒤 같은 id 재삽입, 프리뷰 재업로드, 프리뷰 적용 undo 뒤 redo 소거에서 문서와 history 어디에도 없는 URL을 `onLocalPreviewCleanup`으로 통지한다. 같은 id가 미디어가 아닌 타입으로 바뀐 경우도 포함한다.
  - core: `replaceBlocks`가 같은 id로 다시 넣은 미디어의 로컬 프리뷰를 `updateBlock`과 같은 규칙으로 이어받는다. 교체 블록에 `url`이 있으면 프리뷰를 정리한다. 통지는 도달 불가 때 낸다(Issue #382).
  - core: 통지는 URL당 한 번이다. 도달 판정, 거절 정리, `destroy()` 스윕의 통지가 한 URL에서 겹쳐도 같은 URL을 두 번 알리지 않는다.

- 79de709: 미디어 블록 종류별 필드 소유 표를 추가하고, `getSelectionMediaBlock()`이 iframe의 `showPreview`를 `null`로 보고하게 한다.

  - model: 신규 export는 `MEDIA_BLOCK_FIELDS`, `MediaOwnField`, `MediaBlockTypeWithField`, `mediaBlockTypeHasField`, `mediaBlockHasField`이다. `showPreview`·`previewWidth`·`textAlignment`·`aspectRatio`를 어느 종류가 갖는지 표 하나가 답한다.
  - core: `getSelectionMediaBlock()`이 iframe에서 `showPreview: true`를 보고하던 것을 `null`로 바꾼다. iframe은 `showPreview` 필드가 없다. 같은 이유로 `file`은 원래 `null`이었다. react의 미리보기 토글은 iframe에서 이미 숨겨져 화면 변화는 없다.

- 7a7fa9b: 미디어·iframe 블록의 URL 적용 한 번이 undo 두 번으로 되돌아가던 결함을 고친다.

  - core: `setMediaBlockUrl`과 `setIframeSrc`가 선택 인자 `name?: string`을 받는다. 지정하면 url과 name을 같은 transaction, 같은 undo 단위로 적용한다.
  - core: `name`을 생략하면 name을 바꾸지 않는다. 거절된 호출은 `name`을 지정해도 문서와 history를 바꾸지 않는다.
  - react: MediaToolbar의 Replace Embed 탭과 File Panel의 URL 저장이 추출한 파일명을 URL 명령 인자로 넘긴다. `setMediaBlockName`을 따로 부르지 않는다.

- 0ceec29: 복제·삽입한 로컬 프리뷰 미디어를 undo한 뒤 redo하면 이미 해제된 blob URL을 가진 블록이 되살아나던 결함을 고친다.

  - core: undo만 보고 복구 불가로 판정해 정리를 바로 통지했다.
  - core: redo로 되살아난 블록의 프리뷰가 깨졌다.
  - core: 이제 undo로도 redo로도 되돌릴 수 없을 때만 정리를 통지한다.

- b571210: `replaceBlocks`가 제거 대상과 같은 id의 블록으로 교체하지 못하던 결함을 고친다.

  - core: 제거 대상과 같은 id의 블록을 삽입하면 `COMMAND_NOT_APPLICABLE`로 거절됐다.
  - core: 삽입 블록의 자식이 제거 대상 id를 재사용하면 그 자식이 조용히 사라졌다.
  - core: 이제 제거를 id가 아니라 원래 있던 노드 기준으로 해 같은 id 교체가 성공한다.

- 1ec502a: 같은 값을 다시 적용한 속성 명령이 빈 undo 단위를 남겨 다음 undo를 삼키던 결함을 고친다.

  - core: 현재와 같은 값을 받은 속성 명령이 dispatch 전에 `COMMAND_NOT_APPLICABLE`을 반환한다. 반환값은 이전과 같고 undo 한 번이 직전의 실제 변경을 되돌린다.
  - core: 대상은 `setMediaBlockUrl`, `setMediaBlockName`, `setMediaBlockCaption`, `setMediaBlockBackgroundColor`, `setIframeSrc`, `setMediaPreviewWidth`, `setMediaShowPreview`, `setMediaTextAlignment`, `setBlockTextColor`, `setBlockBackgroundColor`, `setBlockTextAlignment`, `setCodeBlockWrap`, `setCodeBlockCaption`, `setCalloutIcon`이다.
  - core: 값 검증이 no-op 판정보다 먼저다. 막힌 iframe URL을 같은 값으로 재적용하면 기존처럼 `IFRAME_URL_NOT_ALLOWED`가 나간다.
  - core: 업로드 콜백이 현재와 같은 `url`(및 `name`)을 돌려주면 `uploadMediaFile`·`replaceMediaBlockFile`이 문서를 바꾸지 않는다. 결과는 이전과 같이 `ok`다.

- ba75052: `setText`의 같은 값 판정이 hardBreak와 인라인 원소를 보지 못해 빈 undo 단위를 남기거나 실제 변경을 거절하던 결함을 고친다.

  - core: 줄바꿈이 든 같은 텍스트를 다시 적용하면 dispatch 전에 `COMMAND_NOT_APPLICABLE`을 반환한다. history·문서·change event가 바뀌지 않고 undo 한 번이 직전의 실제 변경을 되돌린다.
  - core: 줄바꿈만 지우거나 인라인 custom 원소만 지우는 `setText`는 이전에 거절됐고 이제 적용된다.
  - core: 판정은 hardBreak를 `\n`으로 읽은 텍스트 비교다. 텍스트·hardBreak 밖의 인라인 원소가 있으면 항상 다름이다. 마크는 보지 않는다.
  - 값 검증이 no-op 판정보다 먼저다. `BLOCK_NOT_FOUND` 등 기존 에러 우선순위는 그대로다.

- eb5d004: 같은 내용을 다시 적용한 `updateBlock`이 빈 undo 단위를 남겨 다음 undo를 삼키던 결함을 고친다.

  - core: 현재 블록과 내용이 완전히 같은 `updateBlock` 호출이 dispatch 전에 `COMMAND_NOT_APPLICABLE`을 반환한다. 반환값은 이전과 같고 undo 한 번이 직전의 실제 변경을 되돌린다.
  - core: 비교는 attrs·marks·자식을 포함한 노드 전체다. `children: []`로 자식을 비우는 호출처럼 내용이 달라지면 이전처럼 적용된다.
  - core: 값 검증이 no-op 판정보다 먼저다. `BLOCK_NOT_FOUND`·`DOCUMENT_INVALID` 등 기존 에러 우선순위는 그대로다.

- db56017: 업로드 진행 중 같은 id의 다른 블록으로 교체돼도 옛 업로드 결과가 새 블록을 덮어쓰던 결함을 고친다.

  - core: `uploadMediaFile`·`replaceMediaBlockFile`의 경합 가드가 블록 존재 여부만 확인해, `replaceBlocks`·`updateBlock`으로 교체한 블록의 url을 옛 결과가 덮어썼다.
  - core: 이제 업로드 시작 시점의 블록 type·url과 다르면 교체된 것으로 보고 success·error·cancelled 결과를 모두 무시한다.
  - core: caption·name 등 url 외 속성만 바뀐 경우는 같은 블록으로 보고 결과를 적용한다.

- Updated dependencies [0ab355a]
- Updated dependencies [b3481e8]
- Updated dependencies [e6bb98d]
- Updated dependencies [79de709]
  - @cp949/geul-model@0.2.2
  - @cp949/geul-io@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [9ffbd67]
- Updated dependencies [a606898]
- Updated dependencies [dd703fd]
  - @cp949/geul-io@0.2.1
  - @cp949/geul-model@0.2.1

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
