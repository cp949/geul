# G-EDT-002 클릭 직후 실행될 수 있는 키보드 핸들러는 DOM 기준으로 selection을 재계산한다

- 상태: `ACTIVE`
- 적용 조건: contenteditable 클릭 직후 곧바로 실행될 수 있는 core 키보드 단축키 핸들러(`addKeyboardShortcuts` 등)가 `editor.state.selection`을 판정에 쓰는 경우

## 배경

Chromium은 클릭 뒤 native `selectionchange` DOM 이벤트를 비동기로 처리한다. 클릭 직후 곧바로 keydown이 이어지면(예: Tab), PM의 내부 `state.selection`이 아직 그 비동기 처리를 못 받아 클릭 이전 값을 들고 있을 수 있다 — 반면 네이티브 `document.getSelection()`은 이미 정확하다. `view.domObserver.forceFlush()`로 강제 flush해도 고쳐지지 않는다(내부 캐시된 `currentSelection`이 이미 "처리됨"으로 표시돼 있어 아무 것도 하지 않는다). 최초 발견: Issue #118(`table-keyboard-extension.ts`의 Tab/Shift-Tab).

## 구현 규칙

- 이런 핸들러는 `editor.state`를 직접 읽지 말고, 진입부에서 DOM selection 기준으로 다시 계산한 `EditorState`를 만들어 판정·이동에 쓴다.
- 재계산은 `EditorState.apply()`로 **dispatch하지 않는 파생 state**만 만든다 — 별도 `view.dispatch`를 호출하지 않는다([`G-EDT-001`](./G-EDT-001-keep-editor-commands-atomic.md) "한 사용자 조작 = 하나의 transaction" 위반 방지). 실제 `view.dispatch`는 그 파생 state 위에서 만든 명령의 기존 호출 하나로 충분하다 — 파생 state와 실제 view state가 같은 `doc` 참조를 공유하는 한(선택만 바꾸고 문서는 안 바꾸는 한) 안전하다. **문서를 바꾸는 경로에서는 이 전제가 깨지므로 이 패턴을 쓰지 않는다.**
- **전제 위반 시 실패 양상**: 조용한 오동작이 아니라 ProseMirror `EditorState.applyInner`가 동기적으로 `RangeError("Applying a mismatched transaction")`을 던진다(`tr.before.eq(this.doc)` 검사 실패).
- `CellSelection`(다중 셀 범위 선택, `@tiptap/pm/tables`) 같이 네이티브 Selection API로 대표되지 않는 selection 타입은 재계산 대상에서 제외하고 `view.state`를 그대로 쓴다.
- DOM 위치 조회는 `view.posAtDOM`(공개 API)만 쓴다. **`posAtDOM`은 뷰 밖 노드에서 항상 예외를 던지지 않는다 — 음수 sentinel(`-1`)을 돌려줄 수 있다(실측).** `doc.resolve(pos)`까지 같은 `try`로 묶어, 예외와 잘못된 위치 둘 다 조용히 원래 `view.state`로 폴백한다.
- DOM selection 조회는 전역 `document` 대신 `view.dom.ownerDocument`를 쓴다(`packages/react`의 `slash-menu.tsx`/`link-toolbar.tsx`/`formatting-toolbar.tsx`가 이미 이 관용구를 쓴다).
- 재계산한 selection이 기존 `state.selection`과 같으면(`Selection.eq`) 파생하지 않고 `view.state`를 그대로 반환한다 — no-op 경로에서 여분의 객체를 만들지 않는다.
- false 반환이 파괴적 기본 동작으로 이어지는 소비형 핸들러(예: 표 안 Enter — 폴스루하면 코어 keymap이 live selection 기준으로 셀·행을 분할한다)는 재계산 state가 대상 밖이어도 live `view.state`가 대상 안이면 소비한다. 역방향 stale(대상 안 캐럿 상태에서 대상 밖 클릭 직후 키 입력)에서는 재계산이 대상 밖을 가리키지만, 폴스루한 기본 동작은 live stale selection에 적용되기 때문이다. 최초 발견: Issue #134 리뷰.

## 완료 기준

- 이 패턴을 쓰는 각 핸들러가 정상 경로(재계산 불필요)에서 dispatch 0~1회, stale 경로에서도 dispatch 0~1회(기존 명령 하나 그대로)임을 unit test로 고정한다.
- `CellSelection` 활성 중에는 재계산이 no-op임을 회귀로 고정한다.
- jsdom은 `document.createRange()`/`Selection.addRange()`를 지원하지만 **`document.body`에 연결된 노드만 `focusNode`로 추적한다** — detached 컨테이너에 mount하는 기존 fixture(`createTableFixtureEditor` 등)를 쓰는 unit은 대상 엘리먼트를 `document.body`에 붙였다가 `try/finally`로 제거해야 한다([`G-TST-003`](./G-TST-003-clean-up-test-resources.md)). 붙이지 않으면 `focusNode`가 항상 `null`이라 재계산 로직이 검증 없이 항상 no-op 경로만 타는 공허한 테스트가 된다.
- 소비형 핸들러는 역방향 stale(재계산 대상 밖 · live 대상 안)에서 소비를 회귀로 고정한다.

## 참고 구현

`packages/core/src/table-keyboard-extension.ts`의 `resolveSelectionAwareState`(Issue #118)와 live state 폴백 소비를 포함한 `goToTableCellBelow`/`consumeKeyInsideTable`(Issue #134).
