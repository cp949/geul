# @cp949/geul-model

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
