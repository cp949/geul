# @cp949/geul-react

## 0.2.3

### Patch Changes

- 49036cf: `EmojiPicker`가 강조한 이모지를 보조 기술에 알린다.

  - 방향키로 강조한 옵션의 `id`를 편집기 contenteditable의 `aria-activedescendant`로 설정한다.
  - 옵션 `id`는 `useId()` 기반 접두사와 이모지 `id`를 이은 값이다. 옵션마다 다르다.
  - 팝업이 닫히면(Escape, 선택) 속성을 제거한다.
  - 후보가 0건이면 속성을 달지 않는다.
  - `CalloutIconPicker`의 이모지 선택기는 바뀌지 않는다. 옵션에 `id`가 없고 편집기에 속성도 없다.

- 1ad72c1: `MediaToolbar`의 이름·캡션 편집을 끝내도 미디어 선택과 툴바가 남는다.

  - Rename·Edit caption 입력을 클릭한 뒤 Enter, Escape, Cancel 버튼, Save 버튼으로 끝내면 초점이 편집기 contenteditable로 돌아온다.
  - 입력을 클릭해 DOM selection이 툴바 입력에 있어도 미디어 선택과 툴바가 남는다. 이전에는 캐럿이 다음 문단으로 옮겨 툴바가 닫혔다.

- dd45fb0: `MediaToolbar`의 Replace 모드를 빠져나오면 초점이 편집기로 돌아온다.

  - Embed 탭에서 URL을 저장하면(Enter, 저장 버튼) 초점이 편집기 contenteditable로 돌아온다. 현재 URL과 같은 URL을 다시 저장해도 같고, 미디어 선택과 툴바가 남는다.
  - Cancel 버튼으로 취소해도 초점이 편집기로 돌아온다. Embed 입력을 클릭한 뒤 취소해도 미디어 선택과 툴바가 남는다.
  - 업로드가 성공하면 초점이 툴바 안이거나 `body`일 때만 편집기로 돌아온다. 툴바·편집기 밖 입력에 있으면 그대로 둔다. 툴바 입력을 거쳐 DOM selection이 편집기 밖에 있어도 미디어 선택과 툴바가 남는다.
  - 바깥 클릭으로 닫힌 뒤 끝난 업로드와, 미디어 블록이 사라져 툴바가 닫히는 경우는 초점을 옮기지 않는다.
  - Escape로 교체를 취소하는 동작은 같다. Embed 입력을 클릭한 뒤 눌러도 초점이 편집기로 돌아오고 미디어 선택과 툴바가 남는다.

- Updated dependencies [fe6397f]
- Updated dependencies [f178f2d]
- Updated dependencies [4a7ffee]
- Updated dependencies [b4a17b2]
- Updated dependencies [3aace49]
- Updated dependencies [8b3d803]
- Updated dependencies [6a873e6]
- Updated dependencies [76a1532]
- Updated dependencies [95c6c80]
  - @cp949/geul-core@0.2.3

## 0.2.2

### Patch Changes

- 6864588: 캐럿 트리거 popup(`/`, `:`, `@`)의 상태 기계를 `useCaretTriggerPopup` 훅 한 곳으로 모으고 공개한다. 동작은 바뀌지 않는다.

  - react: 신규 export는 `useCaretTriggerPopup`, `UseCaretTriggerPopupOptions`, `CaretTriggerPopupState`, `readCaretBounds`다.
  - react: `SlashMenu`와 `EmojiPicker`는 이 훅으로 옮겼다. 열림·닫기·키보드 동작은 같다.
  - react: `SlashMenu`의 `items`가 바뀌어 후보 수가 줄면 강조 항목이 마지막 후보로 줄어드는 동작은 그대로다.

- 778d0da: `uploadFile`을 등록하지 않은 편집기에서 iframe URL을 바꿀 수 없던 결함을 고친다.

  - MediaToolbar: iframe 블록의 more 메뉴가 업로드 설정과 무관하게 Replace 항목을 보여 준다. 누르면 Upload 탭 없이 Iframe URL 입력이 열린다.
  - MediaToolbar: image·video·audio·file 블록은 그대로다. `uploadFile`이 없으면 Replace 항목을 보여 주지 않는다.

- 3214eb6: 미디어 Replace와 File Panel의 Embed에서 지금과 같은 URL을 저장하면 사용자가 정한 name이 URL 끝 segment로 덮어써지던 결함을 고친다.

  - MediaToolbar: Replace의 Embed 탭에서 블록의 현재 url과 같은 URL을 저장하면 name을 바꾸지 않는다. image·video·audio·file·iframe 모두 같다.
  - FilePanel: Embed에서 같은 URL을 다시 저장해도 name이 유지되고 패널의 `Name:` 표시도 현재 name을 보인다.
  - 문서와 revision은 바뀌지 않는다. 사용자가 비운 name(`""`)도 그대로 남는다.
  - URL이 바뀔 때는 기존대로 새 URL 끝 segment가 name 초깃값이 된다.
  - 비교는 정확 일치다. 정책이 막는 iframe URL은 같은 URL이어도 거절 문구를 띄운다.

- da9d83b: 미디어 Replace와 File Panel의 Embed에서 지금과 같은 URL을 저장하면 "Unsupported media URL" 경고가 뜨던 결함을 고친다.

  - MediaToolbar: Replace의 Embed 탭에서 블록과 url이 같은 저장은 경고 없이 view로 돌아간다. 문서와 revision은 바뀌지 않는다.
  - FilePanel: Embed에서 같은 저장을 다시 해도 경고가 없다.
  - iframe 블록도 같다.
  - 지원하지 않는 URL, iframe 정책 위반, 호스트 `onBeforeChange`가 거절한 저장은 거절 문구를 그대로 띄운다.

- 7a7fa9b: 미디어·iframe 블록의 URL 적용 한 번이 undo 두 번으로 되돌아가던 결함을 고친다.

  - core: `setMediaBlockUrl`과 `setIframeSrc`가 선택 인자 `name?: string`을 받는다. 지정하면 url과 name을 같은 transaction, 같은 undo 단위로 적용한다.
  - core: `name`을 생략하면 name을 바꾸지 않는다. 거절된 호출은 `name`을 지정해도 문서와 history를 바꾸지 않는다.
  - react: MediaToolbar의 Replace Embed 탭과 File Panel의 URL 저장이 추출한 파일명을 URL 명령 인자로 넘긴다. `setMediaBlockName`을 따로 부르지 않는다.

- 668d924: 표 그립 메뉴가 그립 버튼 바로 아래에 열리도록 앵커를 고쳤다.

  - react: 이전에는 표 모서리 대각선 기준의 낡은 좌표라 메뉴가 버튼보다 위에 걸치고 Plus와 겹쳤다.
  - react: 메뉴 앵커는 버튼 자리와 같은 공식을 쓴다. 버튼 아래쪽에서 4px 띄운다.

- Updated dependencies [0ab355a]
- Updated dependencies [988b9aa]
- Updated dependencies [d7c5327]
- Updated dependencies [f56222d]
- Updated dependencies [63ccf4a]
- Updated dependencies [f7cf0a0]
- Updated dependencies [aa09ddf]
- Updated dependencies [947e6e3]
- Updated dependencies [79de709]
- Updated dependencies [7a7fa9b]
- Updated dependencies [0ceec29]
- Updated dependencies [b571210]
- Updated dependencies [1ec502a]
- Updated dependencies [ba75052]
- Updated dependencies [eb5d004]
- Updated dependencies [db56017]
  - @cp949/geul-core@0.2.2

## 0.2.1

### Patch Changes

- @cp949/geul-core@0.2.1

## 0.2.0

### Patch Changes

- 6658514: 해제형 오버레이(메뉴, 툴바, 팝업)의 닫힘 규칙을 한곳에 모은 `useDismissibleOverlay`를 공개한다. 옵션 타입 `UseDismissibleOverlayOptions`와 닫힘 이유 타입 `DismissReason`도 함께 공개한다.

  - 바깥 pointerdown과 Escape를 `onClose(reason)` 하나로 받는다. reason은 `outside`, `escape`, `invalidated`, `trigger`다.
  - reason별 초점 복귀를 훅이 처리한다.
  - Escape는 문서별 LIFO다. 겹쳐 열린 오버레이 중 가장 나중에 열린 하나만 닫는다.
  - 이미 `preventDefault`된 Escape와 IME 조합 중 Escape는 건너뛴다.
  - `focusOnOpen`과 `focusKey`로 키보드로 열린 메뉴의 첫 활성 항목에 초점을 준다.

  옛 훅 `useDismissOnOutsideOrEscape`와 `UseDismissOnOutsideOrEscapeOptions`를 삭제한다. 두 이름은 npm 배포본(0.1.0, 0.1.1)에 없었다.

- b95a0e5: 접힌 toggle이 가린 블록을 오버레이 앵커와 드롭 후보로 쓰던 결함을 고친다.

  - 접힘은 `display: none`이라 숨은 블록의 rect가 0×0이다. 이 rect가 앵커로 쓰여 오버레이가 화면 왼쪽 위 구석에 남았다.
  - hover 중인 블록이 접히면 블록 gutter·미디어 그립·코드블록 툴바·callout 아이콘 트리거·표 핸들 층(행·열 핸들, 그립, 추가 rail, 리사이즈 strip)이 내려간다.
  - 열린 블록 메뉴·미디어 메뉴·표 행·열·그립 메뉴는 대상이 가려지면 닫힌다. 보이지 않는 블록에 Delete·Turn into가 나가지 않는다.
  - 접힌 toggle이 낀 범위를 블록 선택하면 선택 툴바와 하이라이트가 보이는 블록만 기준으로 놓인다. 보이는 블록이 없으면 툴바를 그리지 않는다.
  - 블록을 뷰포트 위 밖으로 끌어 놓아도 접힌 toggle의 숨은 자식이 되지 않는다. 드롭 가이드는 보이는 블록 사이에 놓인다.
  - 접힌 toggle 안이 아닌 블록의 동작은 그대로다.

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

- 215ebbd: DOM selection이 편집기 밖이면 링크 툴바를 열어 두지 않는다.

  - 링크 안 캐럿에서 편집기 밖(제목·입력창)을 누르면 링크 툴바가 닫혔다가 화면 왼쪽 위(96, 48)에 다시 떴다. 이 툴바로 화면 밖 링크를 편집·삭제할 수 있었다.
  - 편집기 밖 selection이면 활성 링크가 남아 있어도 링크 툴바를 열지 않고, 열려 있으면 닫는다.
  - 초점이 링크 툴바 안 요소이면 닫지 않는다. 커스텀 `component`의 입력에 초점을 줘도 툴바가 유지된다.
  - 편집기 밖 selection에는 고정 대체 좌표(96, 48)를 쓰지 않는다. 앵커는 열 때 보관한 선택 Range다. 창 스크롤로 링크가 뷰포트 밖에 나가면 툴바가 숨는다.

- 4505160: 영역보다 긴 표에서 열 추가 rail이 항상 숨던 결함을 고친다.

  - 안쪽 스크롤 컨테이너보다 표가 길면 "Add column" rail이 `visibility: hidden`이 되어 보이지도 눌리지도 않았다.
  - rail의 세로 구간을 보이는 영역과 교집합해 그린다. 열 리사이즈 strip과 같은 방식이다.
  - 표가 영역 밖으로 완전히 나가면 이전처럼 숨는다.
  - 열·행 드래그 중에는 자르지 않는다. 표가 영역 안에 들어오면 이전과 같다.

- 1cbece2: `handleMenuKeyDown`의 Enter 처리 두 가지를 고친다.

  - IME가 처리한 Enter(`keyCode` 229)는 `isComposing`이 `false`여도 막고 `activate`를 부르지 않는다. Safari가 조합 확정 Enter를 `compositionend` 뒤에 보내 메뉴 항목이 확정되던 결함이다.
  - 확정 Enter가 건 반복 억제가 Shift·Control·Alt·AltGraph·Meta keydown에서 풀리지 않는다. Enter를 누른 채 Shift를 누르면 반복 Enter가 편집기에 닿던 결함이다.
  - `MenuKeyboardEvent`에 선택 필드 `keyCode`를 더한다.

- 557a45c: 트리거 popup의 keydown 처리 순서를 한곳에 모은 `handleMenuKeyDown`을 공개한다. 타입 `MenuKeyboardEvent`와 `MenuKeyboardHandlers`도 함께 공개한다.

  - IME 조합 중(`isComposing`) 키는 처리하지 않는다.
  - Escape는 `escape` 인자가 있으면 처리한다. Ctrl·Alt·Meta가 눌려도 처리한다.
  - Enter 자동 반복은 막고 확정하지 않는다. 처음 Enter를 처리하면 Enter keyup까지 문서 capture 단계에서 반복 Enter를 삼킨다.
  - Enter·Tab·이동 키는 Ctrl·Alt·Meta가 눌렸으면 처리 없이 물러나고 `preventDefault`하지 않는다.
  - Tab·Enter·이동 키는 `tab`·`activate`·`navigate` 인자로 받는다.

  `@query`처럼 텍스트 트리거로 popup을 여는 소비자 UI가 `SlashMenu`·`EmojiPicker`와 같은 키보드 가드를 쓸 수 있다.

- cfeabc0: 영역보다 가로로 넓은 표에서 행 추가 rail이 영역 밖 클릭을 받던 결함을 고친다.

  - 안쪽 스크롤 컨테이너보다 표가 넓으면 "Add row" rail이 영역 오른쪽 밖까지 덮어 그 자리의 클릭이 행을 늘렸다.
  - rail의 가로 구간을 보이는 영역과 교집합해 그린다. 열 추가 rail의 세로 자르기와 같은 방식이다.
  - 표가 영역 밖으로 완전히 나가면 이전처럼 숨는다.
  - 열·행 드래그 중에는 자르지 않는다. 표가 영역 폭에 들어오면 이전과 같다.

- 807da16: `SlashMenu`와 `EmojiPicker`가 키보드로 트리거 블록을 떠난 직후의 Enter를 확정하지 않는다.

  - `Control+Home`·`PageUp` 같은 이동 키 직후(대기 0ms) Enter가 이전 `/query`·`:query` 블록을 변환하거나 이모지로 바꾸던 결함을 고친다.
  - 범위 선택(`Control+Shift+Home`) 직후 Enter도 확정하지 않는다.
  - 확정 전에 DOM selection이 popup을 연 블록 안의 접힌 캐럿인지 확인한다. 아니면 popup만 닫고 문서는 바꾸지 않는다.
  - 같은 블록에서의 Enter 확정, 사이드 메뉴 "+"로 연 slash의 Enter 확정, 마우스 클릭 선택은 그대로다.

- c866f9b: 표 핸들 메뉴를 연 채 핸들이 스크롤 영역 밖으로 나가면 메뉴만 남던 결함을 고친다.

  - 에디터를 안쪽 스크롤 컨테이너에 두면, 표 행·열 핸들 메뉴나 표 그립 메뉴를 연 핸들이 영역 밖에서 숨었다.
  - 메뉴는 뷰포트 가장자리에 남아 어느 핸들의 메뉴인지 알 수 없었다.
  - 메뉴를 연 핸들 하나만 숨기지 않는다. 행·열은 메뉴를 연 핸들, 표 그립은 그립 버튼이다.
  - 나머지 핸들과 Plus 버튼은 이전처럼 영역 밖이면 숨는다.
  - 메뉴를 닫으면 다시 판정한다. 드래그 중에 숨기지 않는 동작은 그대로다.

- 6252ac3: 창 스크롤로 앵커가 뷰포트 밖에 나간 `position: fixed` 오버레이를 숨긴다.

  - 서식·링크·표 선택·블록 선택·미디어 툴바, 블록 gutter, 코드블록 툴바가 뷰포트 가장자리에 남아 클릭을 받던 결함을 고친다.
  - 안쪽 스크롤 컨테이너가 없는 페이지에서도 숨긴다. 앵커 점이 레이아웃 뷰포트 안일 때만 보인다. 박스는 뷰포트로 판정하지 않는다.
  - 오버레이 안에 포커스가 있거나 자식 메뉴가 열려 있으면 숨기지 않는다. 이전과 같다.
  - absolute 오버레이(표 핸들, 미디어 그립·리사이즈 핸들, 캡션, callout 트리거)는 바뀌지 않는다.

- Updated dependencies [b7bdc56]
- Updated dependencies [896db42]
- Updated dependencies [991dc90]
- Updated dependencies [b1d39c7]
- Updated dependencies [6fc7747]
- Updated dependencies [2feb3df]
- Updated dependencies [85680e9]
- Updated dependencies [298cfc0]
- Updated dependencies [94e11c5]
- Updated dependencies [91d66d2]
- Updated dependencies [d760ad0]
- Updated dependencies [26982d1]
- Updated dependencies [cb1a318]
- Updated dependencies [b67b00f]
- Updated dependencies [a7eb2d3]
- Updated dependencies [c473b7a]
- Updated dependencies [f47708f]
- Updated dependencies [5b51236]
- Updated dependencies [3790344]
- Updated dependencies [b6fc175]
- Updated dependencies [b02e19d]
- Updated dependencies [de74d5f]
- Updated dependencies [af486d0]
- Updated dependencies [0351d6e]
- Updated dependencies [e743185]
- Updated dependencies [5689e4e]
- Updated dependencies [3ba5f52]
- Updated dependencies [0e9a15c]
- Updated dependencies [6ff09fc]
- Updated dependencies [ac59533]
- Updated dependencies [59d4e80]
- Updated dependencies [32a80f8]
- Updated dependencies [c5138cf]
- Updated dependencies [8ef0b7b]
- Updated dependencies [2929983]
- Updated dependencies [e69cf05]
- Updated dependencies [e3f70c2]
- Updated dependencies [e4c9f09]
- Updated dependencies [60ea49d]
- Updated dependencies [4e2c732]
- Updated dependencies [c4d7c34]
- Updated dependencies [7d1791e]
- Updated dependencies [8c67733]
- Updated dependencies [b072173]
- Updated dependencies [1bafdbc]
- Updated dependencies [280dd09]
- Updated dependencies [00c911d]
- Updated dependencies [1551d99]
- Updated dependencies [d292d3c]
- Updated dependencies [5158410]
- Updated dependencies [973153d]
  - @cp949/geul-core@0.2.0

## 0.1.2

### Patch Changes

- npm 패키지 메타데이터(description, repository, homepage, bugs)를 추가한다. 0.1.1까지는 4개 패키지 모두 이 필드가 없어 npm 패키지 페이지에 홈페이지·이슈 링크·설명이 표시되지 않았다.
- Updated dependencies
  - @cp949/geul-core@0.1.2

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
  - @cp949/geul-core@0.1.1
