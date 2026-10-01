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
- 색상 메뉴 내부의 화살표 탐색.
- 새 런타임 의존성. 메뉴 라이브러리를 추가하지 않는다.
- firefox·webkit 전용 검증. chromium 게이트만 쓴다.

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
- Enter·Space·클릭이 변환을 확정한다. 확정은 포커스를 편집기로 돌린다.
- Escape는 메뉴를 닫고 포커스를 편집기로 돌린다.
- Tab은 메뉴를 닫고 포커스를 트리거로 돌린다.
- 바깥 클릭은 포커스를 옮기지 않는다(`G-UI-001`).
- 선례: `code-block-language-combobox.tsx`의 `listbox`/`option` 패턴.

### 근거

- 네이티브 `<select>`는 닫힌 상태에서 ArrowDown만으로 변환한다(결함 5).
- 포커스가 select에 남아 이어 입력이 유실된다.
- roving tabindex가 없으면 Tab 정지점이 컨트롤 수와 같다(결함 6).

## 6. 기존 계약과의 관계

- R4 spec §3.3(`DOC-009` `onSelectionChange`)은 바꾸지 않는다. `subscribe`는 추가다.
- R2 spec §4.3의 CodeBlock mark 금지는 §3의 캐럿 명령에도 적용된다.
- R4 spec §6의 `component`/`portalTarget` override 계약은 그대로다.
- `useSelectionRefresh`와 FormattingToolbar는 기존 DOM 이벤트 방식을 유지한다.

## 7. 검증

- 완료 조건은 roadmap 작업의 RD 문서가 소유한다. 이 문서에 복제하지 않는다.
- 게이트는 `pnpm verify`다.
