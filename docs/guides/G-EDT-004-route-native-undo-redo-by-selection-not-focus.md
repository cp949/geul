# G-EDT-004 네이티브 undo/redo는 focus가 아니라 selection 기준으로 라우팅한다

- 상태: `ACTIVE`
- 적용 조건: `Mod-z`/`Mod-y` 키맵이 아니라 브라우저 native undo/redo(`beforeinput` `historyUndo`/`historyRedo`)에 의존하는 동작을 구현·디버깅할 때, 또는 여러 브라우저 엔진에서 undo/redo 동작이 갈리는 회귀를 조사할 때

## 구현 규칙

- `Mod-z` keydown이 `view.dom` 안에서 발생하면 키맵이 keydown 단계에서 바로 command를 실행하고 `preventDefault()`한다 — native undo는 시도되지 않는다.
- 포커스가 `view.dom` 밖(툴바의 평범한 버튼 등)에 있으면 keydown의 target이 그 요소라 키맵이 이벤트를 못 본다. 이때 브라우저 native undo가 대신 실행된다.
- native undo는 `beforeinput`(`inputType: "historyUndo"`/`"historyRedo"`)을 먼저 쏘고, target은 `document.activeElement`가 아니라 현재 selection이 속한 editing host여야 한다(Input Events Level 2). `prosemirror-history`의 `history()` 플러그인은 이 사실에 의존해 `handleDOMEvents.beforeinput`으로 `view.dom`에서 이벤트를 가로챈다.
- 구형 엔진(Chrome83 확인)은 이 target 계산이 다르다 — "현재 focus된 요소"로 잘못 계산해 `view.dom`의 가로채기가 실행되지 않는다. native DOM mutation이 그대로 반영되고 MutationObserver가 이를 새 순방향 transaction으로 기록한다(pop이 아니라 push) — undo 스택은 깊어지고, 그 mutation이 건드리지 않는 attrs(예: block textColor)는 복원되지 않는다.
- "이 historyUndo가 내 editor 것인가"의 유일하게 신뢰 가능한 신호는 `event.target`이 아니라 `document.getSelection()`이 여전히 이 editor의 `view.dom` 안에 있는가다. `document.activeElement`가 옮겨져도 selection은 이전 editing host를 그대로 가리킬 수 있다(입력 컨트롤에 focus가 있으면 그 컨트롤은 별도 selection 개념을 쓰므로 DOM Selection이 그 컨트롤을 가리키지 않는다).
- 호환 shim이 필요하면 `document`(`view.dom`의 owner document) 레벨에서 같은 `beforeinput` 가로채기를 한 번 더 등록한다. `event.defaultPrevented`로 정상 엔진 경로와의 중복 실행을 막고, selection이 `view.dom.contains(...)`인지로 대상 editor를 판정한다. 참고 구현: `packages/core/src/history-native-undo-fallback-extension.ts`(Issue #183).

## 완료 기준

- native undo/redo에 의존하는 core 확장이 "focus가 아니라 selection이 라우팅 기준"이라는 전제를 지키는지 확인한다.
- 한 페이지에 편집기 인스턴스가 여러 개 있을 때 각 인스턴스가 자신의 `view.dom` 소유 selection만 가로채고 다른 인스턴스·무관한 `input`/`textarea`의 `historyUndo`를 훔치지 않는지 확인한다.
