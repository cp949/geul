# UI-017 — StaticToolbar 안정화 설계

## 1. 배경과 범위

`StaticToolbar`(Issue #184)는 README가 "아직 안정성이 부족하다"고 적었던 상태다(Issue #218 이전). Issue #218이 이를 실사용 가능한 수준으로 올린다.

### 확인된 결함 (2026-10-01, chromium)

| # | 결함 | 재현 조건 | 원인 |
|---|---|---|---|
| 1 | 빠른 클릭으로 블록을 옮기면 툴바 표시가 이전 블록 상태로 남는다 | mousedown~mouseup 간격이 짧을 때 | DOM 이벤트 순서 의존. ProseMirror가 view 갱신마다 `selectionchange` 리스너를 재등록해 툴바 리스너가 먼저 실행된다 |
| 1a | 표시가 남은 상태에서 select로 변환하면 이전 블록이 바뀐다 | select가 마우스 이벤트 없이 바뀔 때 | 1과 같다 |
| 2 | 접힌 캐럿에서 Bold/Italic 등 서식 버튼이 동작하지 않는다 | 항상 | core `runSelectionCommand`, `runInlineColorCommand`가 `selection.empty`면 `COMMAND_NOT_APPLICABLE`을 반환한다 |
| 3 | 여러 블록 선택 시 블록 타입을 바꿀 수 없다 | 항상 | `getSelectionBlockType()`이 `null`을 반환하는 의도된 계약이다. 기능 부재다 |
| 4 | 블록 컨트롤 10개가 렌더에서 빠져 툴바 폭이 바뀐다 | 대상 블록이 없을 때 | 조건부 렌더 |
| 5 | 네이티브 select가 ArrowDown만으로 변환한다. 포커스가 select에 남아 이어 입력이 유실된다 | Linux chromium | 네이티브 `<select>` 기본 동작 |
| 6 | Tab 정지점이 17개다 | 항상 | roving tabindex 없음 |
| 7 | Callout 블록 타입 버튼에 아이콘이 없다 | 항상 | 아이콘 맵에 `callout`이 없다 |

### 이 문서가 소유하는 계약

- §2: `EditorController.subscribe` (공개 API 추가).
- §3: 접힌 캐럿 서식 명령 3종 (공개 API 추가).
- §4: StaticToolbar 블록 컨트롤 표시 정책.
- §5: StaticToolbar 키보드 계약.

### 포함·제외

포함:

- `packages/core`의 공개 API 추가 2건.
- `packages/react`의 StaticToolbar 재작성, 그 테스트와 showcase 예제.
- 이 spec과 제품 문서.

제외:

- 여러 블록 타입 변환(`setBlockTypes`). 기능 추가다. 변환 불가 블록이 섞인 경우의 계약이 새로 필요하다.
- FormattingToolbar와 다른 컴포넌트의 구독 방식 이전. `use-selection-refresh.ts`는 바꾸지 않는다.
- 편집기에서 툴바로 포커스를 옮기는 단축키. 편집기 안 Shift+Tab은 outdent가 가로챈다.
- 편집기에 포커스가 없는 상태에서 툴바 명령을 실행한 뒤의 포커스 복귀. 명령은 적용되고 포커스는 `BODY`에 남는다. 이 상태의 이어 입력은 편집기에 닿지 않는다.
  - 대상: 페이지를 연 직후, 편집기 밖을 클릭한 뒤.
  - 마우스 경로는 툴바 버튼이 mousedown `preventDefault`로 포커스를 옮기지 않기 때문에 생긴다.
  - 현 계약으로 유지한다(2026-10-02 결정). 바꾸려면 제품 판단이 필요하다.
- 새 런타임 의존성. 메뉴 라이브러리를 추가하지 않는다.
- firefox·webkit 전용 검증. chromium 게이트만 쓴다. 예외는 `@core` e2e 3건이다.
  - Issue #222 2건: mark 버튼 키보드 활성화 뒤 포커스와 선택 범위 유지.
  - Issue #224 1건: 키보드로 연 색상 메뉴의 이동과 Enter 확정.

## 2. `EditorController.subscribe`

```ts
// EditorController
subscribe(listener: () => void): () => void;
```

### 발화

- 편집기 내부 상태가 바뀐 뒤 발화한다.
- 문서 변경, selection 변경, stored mark 변경을 모두 포함한다.
- `replaceDocument()` 성공 뒤에도 발화한다.

### 미발화

- `createEditor()` 내부 load-normalizing 구간.
- 거절된 변경. 단, 거절 뒤 selection이 바뀌었으면 상태가 바뀐 것이므로 발화한다.
  - 예: 구조 검증 실패로 문서를 되돌릴 때 selection은 문서 끝으로 이동한다.
  - 문서·selection·stored mark가 모두 변경 전과 같으면 발화하지 않는다.
- 구독 해제 뒤.
- `destroy()` 뒤.

### 보장

- 발화 시점에 `SelectionQuery` 조회가 새 상태를 반환한다.
- 대상은 `getSelectionMarks()`, `getSelectionBlockType()` 등이다.

### 비보장

- 발화 시점의 `getDocument()` 최신 여부.
- `onChange`와의 호출 순서.
- 문서 내용이 필요하면 `onChange`를 쓴다.

### 반환값과 listener

- 반환값은 해제 함수다. listener 안에서 호출해도 된다.
- 같은 함수의 중복 등록은 1개로 취급한다.
- listener는 무인자다.
- listener 예외는 감싸지 않는다. 기존 `onSelectionChange`와 같다.
- listener 안에서는 조회만 한다. 편집 명령을 호출하지 않는다.
  - 통지는 변경을 처리하는 도중에 일어난다.
  - 명령을 호출하면 바깥 명령의 결과와 `onChange` 내용이 어긋날 수 있다.
  - 기존 `onSelectionChange`에도 같은 제약이 있다.

### 근거

- `onSelectionChange`는 selection이 실제로 바뀔 때만 발화한다.
- stored mark 변경과 selection을 유지하는 문서 변경을 알리지 못한다.
- `EditorRevisionContext`는 EditorProvider가 컨트롤러를 직접 만든 경로에서만 동작한다.
- 기각한 대안: EditorProvider가 `onSelectionChange`를 context로 중계하는 방식. external ownership 경로에서 동작하지 않는다.

### 이름 제약

- core 공개 선언에 `Transaction`, `EditorState`, `ProseMirror`, `Tiptap` 문자열을 쓰지 않는다.
- 타입 이름과 JSDoc 모두 해당한다.
- `packages/core/test/public-types.test.ts`와 `pnpm check:boundaries`가 검사한다(ADR-0002).

## 3. 접힌 캐럿 서식 명령

```ts
// EditorController.commands
toggleCaretMark(type: "bold" | "italic" | "underline" | "strike" | "code"): Result<void, EditorError>;
toggleCaretTextColor(color: string | null): Result<void, EditorError>;
toggleCaretBackgroundColor(color: string | null): Result<void, EditorError>;
```

### 적용 조건

- selection이 접힌 캐럿일 때만 적용한다.
- 범위 선택이면 `COMMAND_NOT_APPLICABLE`을 반환한다.

### 동작

- stored mark만 바꾼다.
- 문서, revision, `onChange`, undo 스택을 건드리지 않는다.
- 이어 입력한 텍스트에 서식이 붙는다.
- 상태가 바뀌므로 §2의 `subscribe` listener가 호출된다.

### 거절

| 조건 | 코드 |
|---|---|
| 범위 선택 | `COMMAND_NOT_APPLICABLE` |
| 파괴된 세션 | `COMMAND_NOT_APPLICABLE` |
| `toggleCaretMark`의 `type`이 5종 밖(JS 호출) | `COMMAND_NOT_APPLICABLE` |
| codeBlock 안 캐럿 | `CODE_BLOCK_MARK_NOT_ALLOWED` |
| 색상 값이 canonical이 아님 | `INVALID_COLOR` |
| 색상 해제(`null`)인데 캐럿 위치에 그 색이 없음 | `COMMAND_NOT_APPLICABLE` |
| `code`가 걸린 캐럿에서 다른 mark나 색을 켬 | `COMMAND_NOT_APPLICABLE` |

- 판정 순서는 `type`(`toggleCaretMark`만), 파괴된 세션, 범위 선택, codeBlock, 색상 값 순이다. 변경 없음과 `code` 배제는 적용 단계에서 판정한다.
- 범위 선택이 codeBlock과 겹쳐도 `COMMAND_NOT_APPLICABLE`이 우선한다.
  - 툴바가 이 코드를 보고 기존 선택 영역 명령으로 넘어간다.
  - 기존 명령이 그 경우 `CODE_BLOCK_MARK_NOT_ALLOWED`를 반환한다.
- 변경이 없는 호출은 거절이다. 기존 명령의 규약과 같다.
- `code`는 다른 mark와 함께 걸 수 없다(편집기 mark 배제 규칙).
  - `code`를 켜면 앞서 설정한 stored mark를 대체한다.
  - 색상 mark도 같다.
- 거절 시 상태는 바뀌지 않는다.

### 기존 명령과의 관계

- 기존 `toggleBold()` 등 7개 명령의 계약은 그대로 둔다.
- 접힌 캐럿에서 `COMMAND_NOT_APPLICABLE`을 반환하는 동작도 유지한다.
- 근거: stored mark 설정은 문서 변경 명령과 계약이 다르다. 기존 명령을 바꾸면 기존 테스트와 host 동작이 바뀐다.
- 비용: 공개 명령 3개가 늘어난다. 나중에 기존 `toggle*`가 접힌 캐럿을 허용하도록 통합하면 이 3개는 중복 API가 된다.

## 4. StaticToolbar 블록 컨트롤 표시 정책

- 블록 타입 컨트롤과 Indent/Outdent를 항상 렌더한다.
- 대상 블록이 없으면 `aria-disabled`와 사유 `title`로 표시한다(`G-UI-004`).
- 여러 블록 선택도 같은 방식으로 disable한다.
- 코드 블록·미디어 블록·표 셀 범위에서는 mark 5개·색상 2개를 `aria-disabled`와 사유 `title`로 표시한다. 세 경우가 문구 하나(`markingDisabledReason`)를 공유한다.
- 현재 블록이 변환을 허용하지 않는 블록 타입 아이콘 버튼도 사유 `title`로 표시한다. 소스 블록별로 나누지 않고 문구 하나(`blockTypeDisabledReason`)를 공유한다.
- 블록 타입 아이콘 버튼의 사유 우선순위는 대상 블록 없음, 타입 불허, 활성 순이다. 활성이면 `title`을 생략하고 라벨로 폴백한다.
- 여러 블록 타입 변환은 하지 않는다(§1 제외).
- 근거: 컨트롤 수가 selection에 따라 바뀌면 툴바 폭이 흔들리고 키보드 탐색 순서가 불안정해진다.

## 5. StaticToolbar 키보드 계약

### 툴바 탐색

- Tab 정지점은 1개다(roving tabindex).
- ArrowLeft/ArrowRight로 순환 이동한다.
- Home/End로 처음·끝으로 이동한다.
- `aria-disabled` 컨트롤도 포커스를 받는다.
- 툴바 컨트롤에서 Escape를 누르면 편집기로 포커스가 돌아간다.
- Shift·Ctrl·Alt·Meta를 함께 누르면 이동하지 않는다.
- `component` override에는 적용하지 않는다. 교체한 컴포넌트가 소유한다.

### 블록 타입 컨트롤

- 트리거 버튼은 `aria-haspopup="listbox"`와 `aria-expanded`를 가진다.
- 트리거는 Enter·Space·ArrowDown·ArrowUp으로 연다.
- 키보드로 열면 현재 타입 옵션으로 포커스가 간다. 마우스로 열면 편집기 포커스를 유지한다.
- 메뉴는 `role="listbox"`다. 항목은 `role="option"`이다.
- ArrowUp/ArrowDown은 옵션 사이를 이동한다. 양 끝에서 멈춘다(순환하지 않는다).
- Home/End는 처음·끝 옵션으로 이동한다.
- 이동은 변환하지 않는다.
- 메뉴 안 Enter 자동 반복(`repeat`)은 무시한다. 트리거에서 Enter를 누른 채 있어도 현재 옵션을 확정하지 않는다.
- 확정으로 포커스가 편집기로 돌아간 뒤에도 같은 Enter의 반복은 편집기에 닿지 않는다. Enter keyup이나 새 keydown에서 풀린다.
- Enter·Space·클릭이 변환을 확정한다. 확정은 포커스를 편집기로 돌린다.
- Escape는 메뉴를 닫고 포커스를 편집기로 돌린다.
- Tab은 메뉴를 닫고 포커스를 트리거로 돌린다.
- 바깥 클릭은 메뉴를 닫는다. 포커스가 메뉴 밖이면 옮기지 않는다(`G-UI-001`).
- 바깥 클릭 때 포커스가 옵션에 있었으면 편집기로 돌린다(`G-UI-001` 바깥 클릭). 키보드로 연 메뉴에서 툴바 버튼을 마우스로 눌러 닫는 경우가 해당한다.
- 메뉴 keydown과 트리거 keydown은 Ctrl·Alt·Meta가 눌린 키에서 처리하지 않는다. `preventDefault`도 하지 않는다. 화살표·Home·End·Tab 전부 해당한다.
- 메뉴 안 Enter 반복 억제가 이 규칙보다 앞선다. `Ctrl+Enter` 반복도 막는다.
- 메뉴가 열린 트리거의 처음 Enter도 같은 억제를 건다. 그 Enter의 click이 메뉴를 닫고 포커스를 편집기로 돌리기 때문이다. 이 억제도 수식 키 규칙보다 앞선다.
- Shift는 수식 키로 보지 않는다. `Shift+Tab`은 Tab과 같이 메뉴를 닫는다.
- 선례: `code-block-language-combobox.tsx`의 `listbox`/`option` 패턴.

### 색상 컨트롤

Issue #224가 추가했다. 블록 타입 컨트롤과 같은 키보드 계약이다.

- 글자색·배경색 트리거는 `aria-haspopup="menu"`와 `aria-expanded`를 가진다.
- 트리거는 Enter·Space·ArrowDown·ArrowUp으로 연다. 같은 속성의 메뉴가 이미 열려 있으면 ArrowDown·ArrowUp은 아무것도 하지 않는다.
- 키보드로 열면 첫 스와치로 포커스가 간다. 마우스로 열면 편집기 포커스를 유지한다.
- 메뉴는 `role="menu"`다. 항목은 `role="menuitem"`이다. 항목은 선택 상태 없는 명령이라 `menuitem`을 쓴다.
- 스와치는 색 8개와 "색 없음" 1개다. 모두 `tabIndex=-1`이다. 메뉴는 Tab 정지점을 더하지 않는다.
- ArrowRight·ArrowDown은 다음, ArrowLeft·ArrowUp은 이전 스와치로 이동한다. DOM 순서 기준이다. 양 끝에서 멈춘다(순환하지 않는다).
- Home/End는 처음·끝 스와치로 이동한다.
- 이동은 색을 입히지 않는다.
- 메뉴 안 Enter 자동 반복(`repeat`)은 무시한다. 트리거에서 Enter를 누른 채 있어도 첫 스와치를 확정하지 않는다.
- 확정으로 포커스가 편집기로 돌아간 뒤에도 같은 Enter의 반복은 편집기에 닿지 않는다. Enter keyup이나 새 keydown에서 풀린다.
- Enter·Space·클릭이 색을 입힌다. 확정은 포커스를 편집기로 돌린다. 선택 범위는 유지된다.
- Escape는 메뉴를 닫고 포커스를 편집기로 돌린다.
- Tab·Shift+Tab은 메뉴를 닫고 포커스를 해당 속성의 트리거로 돌린다.
- 바깥 클릭은 메뉴를 닫는다. 포커스가 메뉴 밖이면 옮기지 않는다.
- 바깥 클릭 때 포커스가 스와치에 있었으면 편집기로 돌린다(`G-UI-001` 바깥 클릭).
- 메뉴가 열린 채 mark 적용이 불가능해지면(코드 블록·미디어 블록·표 셀 범위 선택) 메뉴를 닫는다. 포커스가 스와치에 있었으면 편집기로 돌린다.
- 선택이 다시 mark를 적용할 수 있는 상태로 돌아와도 닫힌 메뉴는 다시 열리지 않는다.
- 메뉴 keydown과 트리거 keydown은 Ctrl·Alt·Meta가 눌린 키에서 처리하지 않는다. `preventDefault`도 하지 않는다.
- 메뉴 안 Enter 반복 억제가 이 규칙보다 앞선다. `Ctrl+Enter` 반복도 막는다.
- 메뉴가 열린 트리거의 처음 Enter도 같은 억제를 건다. 그 Enter의 click이 메뉴를 닫고 포커스를 편집기로 돌리기 때문이다. 이 억제도 수식 키 규칙보다 앞선다.
- Shift는 수식 키로 보지 않는다. `Shift+Tab`은 Tab과 같이 메뉴를 닫는다.
- 한 속성의 메뉴가 열린 채 다른 속성 트리거를 키보드로 열면 메뉴가 바뀌고 첫 스와치가 포커스를 받는다.
- 스와치 확정은 DOM selection을 다시 쓰지 않는다. 명령은 편집기 상태의 selection을 읽는다.

### 활성화 뒤 포커스와 컨테이너 mousedown

Issue #222가 추가했다.

- 변환·서식을 바로 적용하는 컨트롤은 Enter·Space로 활성화해도 포커스가 그 컨트롤에 남는다. 블록 타입 아이콘 버튼, 들여쓰기·내어쓰기, mark 버튼이 해당한다.
- 메뉴를 여는 컨트롤과 메뉴 항목은 각 메뉴 계약을 따른다.
- mark 버튼을 키보드로 활성화해도 편집기의 선택 범위가 유지된다. 같은 버튼을 다시 누르면 서식이 꺼진다. Escape로 돌아와 입력하면 그 범위를 대체한다.
- 툴바 컨테이너 자신을 누른 mousedown은 편집기 포커스와 selection을 옮기지 않는다(`G-UI-001`). 빈 영역과 컨트롤 사이 틈이 해당한다.
- 컨테이너 mousedown 계약은 `component` override 컨테이너에도 적용한다. 포인터 계약이라 위 "`component` override에는 적용하지 않는다"와 충돌하지 않는다.
- 자식이 mousedown target이면 건드리지 않는다. `component` override 안의 입력 요소는 포커스를 받는다.

### 근거

- 네이티브 `<select>`는 닫힌 상태에서 ArrowDown만으로 변환한다(결함 5).
- 포커스가 select에 남아 이어 입력이 유실된다.
- roving tabindex가 없으면 Tab 정지점이 컨트롤 수와 같다(결함 6).
- 버튼 포커스에서 DOM selection을 다시 쓰면 브라우저가 포커스를 편집기로 옮긴다. 이어 누른 Enter가 선택 범위를 줄바꿈으로 대체한다(Issue #222 F1).
- 색상 메뉴는 스와치 9개가 각각 Tab 정지점이었다. 키보드 사용자는 Tab으로만 스와치에 닿았고 화살표는 툴바 컨트롤 사이를 움직였다(Issue #224).
- 색상 트리거에 `aria-haspopup`·`aria-expanded`가 없어 스크린리더 사용자가 메뉴 존재와 열림 여부를 알 수 없었다(Issue #224).
- 항목이 명령이라 색상 메뉴는 `menu`/`menuitem` role을 유지한다. 블록 타입 메뉴의 `listbox`/`option`은 선택 상태가 있는 항목용이다.
- 팔레트가 줄바꿈되는 칸 수는 메뉴 폭에 따라 달라 2차원 이동을 하지 않는다. 블록 타입 메뉴처럼 양 끝에서 멈추는 선형 이동이다.
- 스와치로 포커스가 가기 전에 DOM selection이 편집기 안에 그대로 있다. 확정 때 `addRange`로 되돌릴 대상이 없고, 되돌리면 포커스가 편집기로 먼저 옮겨져 이동 중 포커스 계약과 어긋난다(Issue #224 실측).
- 컨테이너 mousedown을 막지 않으면 포커스가 `BODY`로 가고 DOM selection이 편집기 밖으로 나간다(Issue #222 F3).
- 툴바 버튼 mousedown은 `preventDefault`라 포커스가 옵션에 남은 채 블록 타입 메뉴가 언마운트됐다. 브라우저가 포커스를 `BODY`로 떨어뜨렸다(Issue #225).
- 메뉴 keydown과 트리거 keydown이 수식 키를 구분하지 않아 `Alt+ArrowLeft`(뒤로 가기)·`Ctrl+Tab` 같은 브라우저 단축키를 막거나 메뉴를 닫았다(Issue #225).
- 선택이 코드 블록으로 옮겨 가면 트리거는 `aria-disabled`가 되지만 열린 색상 메뉴는 남았다(Issue #225).
- 수식 키 규칙이 툴바 탐색과 메뉴에서 다르다. 툴바 roving은 Shift·Ctrl·Alt·Meta 모두에서 물러난다. 메뉴는 Ctrl·Alt·Meta에서만 물러난다.
- 메뉴에서 `Shift+Tab`이 닫기 키다. Shift를 가드에 넣으면 Shift+Tab 닫기가 동작하지 않는다.

## 6. 기존 계약과의 관계

- R4 spec §3.3(`DOC-009` `onSelectionChange`)은 바꾸지 않는다. `subscribe`는 추가다.
- R2 spec §4.3의 CodeBlock mark 금지는 §3의 캐럿 명령에도 적용된다.
- R4 spec §6의 `component`/`portalTarget` override 계약은 그대로다.
- `useSelectionRefresh`와 FormattingToolbar는 기존 DOM 이벤트 방식을 유지한다.

## 7. 검증

- 완료 조건은 roadmap 작업의 RD 문서가 소유한다. 이 문서에 복제하지 않는다.
- 게이트는 `pnpm verify`다.

## 사후 변경 (2026-10-04)

§1·§4가 제외한 여러 블록 타입 변환을 추가했다. 위 본문은 당시 결정이라 고치지 않는다.

- core `SelectionQuery.getSelectionBlocks()`: 선택 범위에 닿은 블록을 문서 순서로 돌려준다. 바꿀 수 없는 블록(divider·table·미디어)은 담지 않는다. 표 셀 범위·`NodeSelection`이면 빈 배열이다.
- core `commands.setBlockTypes(blockIds, blockType)`: 한 transaction이고 undo 1회다.
- 대상이 `codeBlock`이면 `COMMAND_NOT_APPLICABLE`이다. 여러 블록을 한 코드 블록으로 합치지 않는다.
- `codeBlock`인 블록과 이미 같은 타입인 블록은 건너뛴다. 바뀐 블록이 없으면 `COMMAND_NOT_APPLICABLE`이다.
- 없는 `blockId`가 있으면 `BLOCK_NOT_FOUND`이고 아무것도 바꾸지 않는다.
- `numberedListItem`의 `startNumber`는 바뀐 첫 블록에만 적용한다.
- react `computeFormattingToolbarState`에 `multiBlockSelection`을 더했다. 닿은 블록이 둘 이상이고 단일 블록·미디어·표 셀 범위가 아닐 때만 채운다.
- StaticToolbar: 블록 타입 트리거·아이콘 버튼이 켜진다. Indent/Outdent는 계속 꺼진다. Code는 꺼진다.
- FormattingToolbar: 블록 타입 select가 뜬다. 타입이 섞여 있으면 값 없는 `blockTypeNeutralLabel` 항목을 보인다.
- [Issue #241](https://github.com/cp949/geul/issues/241): §4의 "코드 블록 선택" 판정을 core mark 가드와 맞췄다. 단일 블록 선택만 보던 판정이 여러 블록에 걸친 선택을 놓쳤다.
- core `SelectionQuery.selectionIntersectsCodeBlock()`: 선택이 `codeBlock`의 문자 구간과 겹치면 true다. 끝점만 닿거나 빈 `codeBlock`만 덮으면 false다. 캐럿이 `codeBlock` 안이면 true다.
- react `computeFormattingToolbarState`에 `selectionIntersectsCodeBlock`을 더했다.
- StaticToolbar: `codeBlock`을 걸친 여러 블록 선택(`Ctrl+A` 포함)에서도 mark 5개·색상 2개가 `markingDisabledReason`으로 꺼진다.
- FormattingToolbar: 같은 선택에서 mark·색상 버튼을 숨긴다. 블록 타입 select는 남긴다.
- LinkToolbar: 같은 선택에서 닫힌다.
- 끝점만 `codeBlock`에 닿는 선택은 core가 mark를 적용하므로 버튼이 켜져 있다.
- 구분선 `NodeSelection`에서 mark 버튼이 켜진 채 무반응인 현상은 이 변경의 범위 밖이다.
- [Issue #242](https://github.com/cp949/geul/issues/242): 위 "범위 밖" 현상을 고쳤다. 구분선·`customBlock`은 `getSelectionMediaBlock()`이 `null`이라 미디어 종류별 허용 목록에서 빠져 있었다.
- core `SelectionQuery.isAtomBlockSelected()`: `NodeSelection`이고 `node.isBlock && node.isAtom`이면 true다. 구분선·미디어·`customBlock`이 걸린다. 표(`isAtom: false`)·인라인 atom·`CellSelection`·텍스트 선택은 false다.
- react `computeFormattingToolbarState`: `isMediaBlockSelected`를 `isAtomBlockSelected`로 바꿨다. `multiBlockSelection` 가드도 같은 값을 쓴다.
- StaticToolbar: 구분선·`customBlock`·미디어 선택에서 mark 5개·색상 2개가 꺼진다.
- FormattingToolbar·LinkToolbar: 같은 선택에서 열리지 않는다. 구분선은 전담 툴바가 없어 닫아도 잃는 정보가 없다.
- `markingDisabledReason`을 선택 종류를 열거하지 않는 일반 문구로 바꿨다. ko "이 선택에서는 서식을 적용할 수 없습니다", en "Formatting isn't available for this selection". 본문 §4의 "세 경우가 문구 하나를 공유한다" 서술은 당시 결정이다.
- [Issue #245](https://github.com/cp949/geul/issues/245): 블록 타입 변환 버튼이 core 거절 조건을 반영하지 않아 활성인데 무반응이던 세 경우를 고쳤다. 자식 있는 블록 → Code, 탭 등 `isValidInlineText`를 통과하지 못하는 문자가 든 `codeBlock` → 일반 블록, `codeBlock`만 여러 개 선택이다.
- core `SelectionQuery.getBlockTypeBlocker(blockId, blockType, { clearContent })`와 `getBlockTypesBlocker(blockIds, blockType)`: `setBlockType`·`setBlockTypes`의 구조적 거절 사유를 돌려준다. 거절하지 않으면 `null`이다. 명령과 같은 판정 함수를 쓴다.
- `BlockTypeBlocker`: `HAS_CHILDREN`, `INVALID_TEXT`, `LIST_CODE_MISMATCH`, `ALL_CODE_BLOCK`, `NOT_FOUND`, `NOT_APPLICABLE`. 같은 타입 변환(no-op)과 `language`·`startNumber` 입력 검증은 사유가 아니다.
- react `computeFormattingToolbarState`: 옵션 id별 사유를 `blockTypeBlockers`에 싣는다. `isSameStaticToolbarState`가 비교하므로 탭 입력처럼 블록 타입이 그대로인 변경도 버튼에 반영된다.
- StaticToolbar: 아이콘 버튼과 블록 타입 메뉴 옵션이 비활성이면 `aria-disabled`와 사유 `title`을 가진다. 비활성 옵션을 눌러도 명령을 호출하지 않고 메뉴를 닫지 않는다.
- 사유 문구: `HAS_CHILDREN`은 `blockTypeDisabledByChildrenReason`, `INVALID_TEXT`는 `blockTypeDisabledByInvalidTextReason`이다. 나머지는 `blockTypeDisabledReason`을 공유한다.
- FormattingToolbar select, 블록 사이드 메뉴 Turn into, 슬래시 메뉴: 막힌 옵션을 목록에서 뺀다. 현재 타입 말고 고를 옵션이 없으면 select와 Turn into 섹션을 그리지 않는다.
- 슬래시 메뉴는 `clearContent: true`로 질의한다. `codeBlock` source에서는 열리지 않아 탭 경로는 해당하지 않는다.
- 범위 밖: 탭을 포함한 `codeBlock`을 일반 블록으로 바꾸게 하는 core 계약 변경.
