# G-EDT-004 네이티브 undo/redo는 focus가 아니라 selection 기준으로 라우팅한다

- 상태: `ACTIVE`
- 적용 조건: `Mod-z`/`Mod-y` 키맵이 아니라 브라우저 native undo/redo(`beforeinput` `historyUndo`/`historyRedo`)에 의존하는 동작을 구현·디버깅할 때, 또는 여러 브라우저 엔진에서 undo/redo 동작이 갈리는 회귀를 조사할 때, 또는 에디터 밖 비편집 요소(툴바 버튼 등)에 포커스가 있을 때 redo(`Mod-Shift-z`·`Mod-y`)가 동작하지 않는 증상을 조사할 때, 또는 같은 상황에서 undo·redo 뒤 포커스가 `BODY`로 유실되는 증상을 조사할 때

## 구현 규칙

- `Mod-z` keydown이 `view.dom` 안에서 발생하면 키맵이 keydown 단계에서 바로 command를 실행하고 `preventDefault()`한다 — native undo는 시도되지 않는다.
- 포커스가 `view.dom` 밖(툴바의 평범한 버튼 등)에 있으면 keydown의 target이 그 요소라 키맵이 이벤트를 못 본다. 이때 브라우저 native undo가 대신 실행된다.
- native undo는 `beforeinput`(`inputType: "historyUndo"`/`"historyRedo"`)을 먼저 쏘고, target은 `document.activeElement`가 아니라 현재 selection이 속한 editing host여야 한다(Input Events Level 2). `prosemirror-history`의 `history()` 플러그인은 이 사실에 의존해 `handleDOMEvents.beforeinput`으로 `view.dom`에서 이벤트를 가로챈다.
- 구형 엔진(Chrome83 확인)은 이 target 계산이 다르다 — "현재 focus된 요소"로 잘못 계산해 `view.dom`의 가로채기가 실행되지 않는다. native DOM mutation이 그대로 반영되고 MutationObserver가 이를 새 순방향 transaction으로 기록한다(pop이 아니라 push) — undo 스택은 깊어지고, 그 mutation이 건드리지 않는 attrs(예: block textColor)는 복원되지 않는다.
- "이 historyUndo가 내 editor 것인가"의 유일하게 신뢰 가능한 신호는 `event.target`이 아니라 `document.getSelection()`이 여전히 이 editor의 `view.dom` 안에 있는가다. `document.activeElement`가 옮겨져도 selection은 이전 editing host를 그대로 가리킬 수 있다(입력 컨트롤에 focus가 있으면 그 컨트롤은 별도 selection 개념을 쓰므로 DOM Selection이 그 컨트롤을 가리키지 않는다).
- 호환 shim이 필요하면 `document`(`view.dom`의 owner document) 레벨에서 같은 `beforeinput` 가로채기를 한 번 더 등록한다. `event.defaultPrevented`로 정상 엔진 경로와의 중복 실행을 막고, selection이 `view.dom.contains(...)`인지로 대상 editor를 판정한다. 참고 구현: `packages/core/src/history-native-undo-fallback-extension.ts`(Issue #183).

### redo는 keydown 단계에서 라우팅한다

- Chromium은 undo를 `preventDefault()`하면 이후 `historyRedo`를 보내지 않는다. 포커스가 에디터 밖이면 `beforeinput`으로 redo를 라우팅할 수 없다.
- 이때 keydown은 `document`에 도달한다. target은 포커스된 요소다. selection은 `view.dom` 안에 남는다.
- redo는 `document` keydown(bubble 단계)에서 `Mod-Shift-z`·`Mod-y`를 가로채 `redo` command를 직접 호출한다.
- 가로채기 조건은 모두 만족해야 한다.
  1. `event.defaultPrevented`가 아니다. 툴바 자체 핸들러에 양보한다.
  2. `view.editable`이다.
  3. `event.isComposing`이 아니다.
  4. 키가 정확히 `Mod-Shift-z` 또는 `Mod-y`다. 잉여 modifier는 거절한다.
  5. target이 `view.dom` 밖의 Node다. 안쪽은 keymap이 처리한다.
  6. target이 `input`·`textarea`·`select`·편집 영역이 아니다.
  7. `document.getSelection()`의 `focusNode ?? anchorNode`가 `view.dom` 안이다.
  8. 실행은 `preventDefault()` 뒤 `redo(view.state, view.dispatch)`다. redo할 것이 없어도 막는다.
- 키 판별은 순수 함수로 분리해 비Apple(Ctrl)·Apple(Meta) 분기를 단위 테스트로 고정한다. `event.key`가 비ASCII(한글 두벌식 등)이면 `event.code`로 폴백한다.
- undo는 `beforeinput` 경로를 유지한다. undo와 redo의 경로는 비대칭이다.
- 참고 구현: `packages/core/src/history-redo-keydown-fallback-extension.ts`(Issue #219).

### undo·redo 뒤 DOM selection을 재동기화하고 포커스 유실을 복구한다

- 에디터가 포커스를 갖지 않으면 ProseMirror가 history가 복원한 selection을 DOM에 반영하지 않는다(`editorOwnsSelection`).
- 문서 DOM이 바뀌면 텍스트 노드에 앵커된 DOM selection이 접힌다.
- Formatting·Link 툴바는 DOM selection이 접히면 닫힌다. Table `Split cell`↔`Merge cells`처럼 버튼만 교체되는 경우도 있다.
- 포커스된 버튼이 unmount되면 `document.activeElement`가 `BODY`가 된다. unmount는 `selectionchange`나 `keyup`에서 일어난다. 프레임·타이머 대기로 덮지 않는다.
- history transaction을 `isHistoryTransaction(tr)`로 센다. 핸들러 경로(`beforeinput`·redo keydown)와 무관하게 plugin view `update`에서 처리한다.
- 가드는 모두 만족해야 한다.
  1. `view.editable`이다.
  2. `view.hasFocus()`가 거짓이다.
  3. `document.getSelection()`의 `focusNode ?? anchorNode`가 `view.dom` 안이다.
  4. `document.activeElement`가 입력 컨트롤(`input`·`textarea`·`select`·편집 영역)이 아니다.
- 재동기화는 복원된 selection이 `TextSelection`일 때만 한다. `view.domAtPos`로 `setBaseAndExtent`를 호출한다. `NodeSelection`·`CellSelection`은 건드리지 않는다.
- Chromium은 편집 영역 안 selection을 바꾸면 포커스를 editing host로 옮긴다. 호출 동안 `view.dom`의 `contenteditable`을 끄고 `finally`에서 호출 전 값으로 되돌린다. 포커스·blur 이벤트가 생기지 않는다.
- 포커스 복구는 가드를 통과했을 때 포커스된 `view.dom` 밖 요소를 기억하고 `MutationObserver`로 제거를 감시한다. 기억한 요소가 제거되고 `activeElement`가 `BODY`·null이면 `view.focus()`를 호출한다.
- 감시는 복구, 다른 요소로의 `focusin`, 포인터 누름(`pointerdown`), 다음 history transaction의 재무장, view destroy에서 끝난다.
- 비포커스 영역 클릭은 포커스를 `BODY`로 옮기지만 `focusin`이 없다. `pointerdown`으로 감시를 끝내지 않으면 이어진 툴바 닫힘에서 에디터가 포커스를 되가져온다.
- 포커스 유실 때만 에디터로 돌려준다. caret 복원으로 툴바가 닫히면 에디터 포커스에서 undo·redo한 결과와 같아진다.
- 참고 구현: `packages/core/src/history-focus-sync-extension.ts`(Issue #221).

## 완료 기준

- native undo/redo에 의존하는 core 확장이 "focus가 아니라 selection이 라우팅 기준"이라는 전제를 지키는지 확인한다.
- 한 페이지에 편집기 인스턴스가 여러 개 있을 때 각 인스턴스가 자신의 `view.dom` 소유 selection만 가로채고 다른 인스턴스·무관한 `input`/`textarea`의 `historyUndo`를 훔치지 않는지 확인한다.
- redo 라우팅이 target 가드(조건 6)와 selection 가드(조건 7)를 모두 가지는지 확인한다. 둘 중 하나만 지워도 단위 테스트가 RED여야 한다. Chromium은 입력 컨트롤에 포커스가 가면 DOM selection이 컨트롤로 옮겨져 e2e는 selection 가드로도 통과한다 — 두 가드를 모두 지워야 e2e가 RED가 된다.
- undo·redo 뒤 포커스 복구는 jsdom 단위 테스트와 Chromium e2e를 함께 갖는지 확인한다. 단위 테스트는 가드·감시 해제·정리를 하나씩 깨뜨려 RED여야 한다. e2e는 `toolbar-focus-undo-redo.spec.ts`가 툴바별로 소유하고 `--repeat-each=10 --workers=5`로 타이밍 경합을 확인한다.
