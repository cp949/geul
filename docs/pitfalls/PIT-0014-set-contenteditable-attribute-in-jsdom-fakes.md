# PIT-0014 jsdom 테스트 fake는 contentEditable IDL 대신 속성으로 세운다

- 상태: `ACTIVE`
- 적용 영역: react, test
- 최초 근거: Issue #48

## 상황과 징후

jsdom에서 `el.contentEditable = "true"`처럼 IDL 프로퍼티에 대입해도 `el.getAttribute("contenteditable")`은 `null`이고 `el.matches('[contenteditable="true"]')`는 `false`다(브라우저와 다른 동작 — node로 직접 확인함). `link-toolbar.tsx:145`, `slash-menu.tsx:100`, `table-selection-toolbar.tsx:101`, `table-handles.tsx:340`, `block-side-menu.tsx:80`은 모두 초점 복구 대상을 `element?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()`로 찾는다. 테스트 fake가 편집 영역을 `editable.contentEditable = "true"`로 만들면 이 셀렉터가 매치되지 않아 `focusEditor`/`closeAndRestoreFocus`가 단위 테스트 환경에서 조용히 no-op가 된다. 그 위에 `expect(document.activeElement).toBe(editable)` 같은 초점 단언을 얹어도 프로덕션 동작과 무관하게 항상 같은 결과(`document.activeElement`가 `body`에 머무름)를 내므로, 단언이 실제로 아무것도 검증하지 못한 채 공허하게 통과할 수 있다.

## 근본 원인

jsdom은 `contentEditable` IDL 프로퍼티의 setter를 대응하는 `contenteditable` 속성에 반영하지 않는다. 반면 프로덕션 코드는 CSS attribute selector(`'[contenteditable="true"]'`)로 초점 대상을 찾는다. fake가 IDL 프로퍼티 대입만 쓰는 한 두 사실이 겹쳐 프로덕션 셀렉터는 테스트 환경에서 영구히 매치되지 않고, 초점 복구를 다루는 코드 경로는 실제 동작이 맞든 틀리든 테스트에서 항상 실행되지 않는다.

## 예방 규칙

- 테스트 fake에서 편집 가능 영역을 표시할 때 `el.contentEditable = "true"`(IDL 대입) 대신 `el.setAttribute("contenteditable", "true")`(속성 대입)를 쓴다.
- 초점 복구를 단언하는 테스트를 추가하면, 배선을 뒤집는 변이(예: `onEscapeDismiss`/`onOutsideDismiss` 콜백 교환, 초점 복구 호출 줄 제거·주석 처리)를 적용해 단언이 실제로 실패하는지 확인한 뒤 되돌린다. 실패를 확인하지 않은 초점 단언은 공허할 수 있다.
- 새 오버레이 컴포넌트가 `'[contenteditable="true"]'` 셀렉터로 초점 대상을 찾는 경로를 추가하면, 그 컴포넌트의 테스트 fake도 이 규칙을 따르는지 함께 확인한다.
- 트리거 재클릭으로 닫는 경로를 단언할 때 `fireEvent.click`만 쏘지 않는다. 실제 브라우저는 `pointerdown`이 먼저 오고 `useDismissOnOutsideOrEscape`의 allow-list가 그 `pointerdown`을 걸러내는 것이 동작의 전제다 — `pointerDown` + `click` 순서를 재현해야 allow-list 항목 제거 변이가 잡힌다. `click`만 쏘면 allow-list를 지워도 테스트가 통과한다(Issue #51 리뷰에서 확인).
- "툴바/메뉴를 닫는다"를 주장하는 테스트는 하위 요소(입력, 스와치)의 부재가 아니라 컨테이너 자체(`role="toolbar"`, `role="menu"`)의 부재를 단언한다. 하위 요소만 보는 단언은 컨테이너가 `mode:"closed"` 대신 `mode:"view"`로 되돌아가는 회귀를 통과시킨다(Issue #51 리뷰에서 확인).

## 검증 방법

```bash
pnpm --filter @cp949/geul-react exec vitest run packages/react/test/link-toolbar.test.tsx packages/react/test/slash-menu.test.tsx packages/react/test/table-selection-toolbar.test.tsx packages/react/test/table-handles.test.tsx packages/react/test/block-side-menu.test.tsx
```

변이 절차: 대상 컴포넌트의 초점 복구 줄(예: `link-toolbar.tsx:145`의 `focus()` 호출, `slash-menu.tsx:207`의 `focusEditor()` 호출)을 주석 처리하거나, `onEscapeDismiss`/`onOutsideDismiss` 콜백을 서로 바꿔치기한 뒤 위 명령을 재실행해 대상 테스트가 실패하는지 확인한다. 확인 후 즉시 되돌리고 `git diff -- packages/react/src/`가 무출력인지 재확인한다.

## 실제 근거

- 커밋 `954d755` — `block-side-menu.test.tsx`에 fake 수정(`setAttribute("contenteditable", "true")`)과 초점 단언(`document.activeElement`)을 최초로 적용한 선행 사례.
- 커밋 `417a792`(Issue #48) — 나머지 5개 파일(`link-toolbar`, `slash-menu`, `formatting-toolbar`, `table-selection-toolbar`, `table-handles`)의 fake controller 6개 지점을 같은 방식으로 바꿨다(`table-handles.test.tsx`는 `fakeController`와 `fakeControllerWithMergedFirstRow` 두 지점).
- 커밋 `a211c5b`+`3c32099` — `table-selection-toolbar.test.tsx`, `table-handles.test.tsx`의 기존 Escape 테스트에 `document.activeElement` 단언을 추가하고, `onEscapeDismiss`/`onOutsideDismiss` 배선을 바꾸는 변이 4건(전부 실패 확인 후 되돌림)으로 공허하지 않음을 확인했다.
- 커밋 `dae2750` — `link-toolbar.test.tsx`에 URL 입력 Escape 초점 복구 테스트를 신설하고 `slash-menu.test.tsx`의 기존 항목 선택 테스트에 초점 단언을 추가했다. `link-toolbar.tsx:145` 초점 줄 제거, `slash-menu.tsx:207`의 `focusEditor()` 제거 변이 2건(둘 다 실패 확인 후 되돌림)으로 확인했다.
- 커밋 `cbd3776`+`50360ee`+`0e1d91a`+`5c53030`(Issue #51) — 남은 초점 복구 호출 지점 10곳에 단언을 추가했다. `link-toolbar` 4곳(Cancel 버튼, `applyLink`의 href 무변경·`setLink` 성공 두 경로, `removeLink`), `block-side-menu` 3곳(turn into·duplicate·delete — 커버 테스트는 `SlashMenu`가 `BlockSideMenu`를 합성 마운트하므로 `slash-menu.test.tsx`의 `describe("SlashMenu 블록 메뉴", ...)`에 있다), `table-selection-toolbar` 2곳(트리거 재클릭 토글 닫기, 색상 스와치 `onClose`), `table-handles` 1곳(메뉴 항목 `onClose`). 호출 지점별 변이 10건 전부 대상 테스트 1건만 실패시켰고 지문은 `AssertionError: expected <body>…</body> to be <div contenteditable="true">`였다(전부 되돌림).
- 커밋 `db4686c`(Issue #51 리뷰) — 위 10건 중 2건이 단언은 공허하지 않으나 시나리오가 부족해 회귀를 놓쳤다. 트리거 재클릭 테스트는 `pointerdown` 없이 `click`만 쏴 `CELL_FORMAT_MENU_DISMISS_ALLOW_SELECTORS`의 `"[data-be-cell-format-trigger]"` 제거 변이가 살아남았고(단위 13/13 통과, 이 경로는 e2e에도 없다), Cancel 버튼 테스트는 URL 입력 부재만 봐 `closeAndRestoreFocus`가 `mode:"view"`로 되돌아가는 변이가 살아남았다(같은 결함이 기존 Escape 테스트에도 있었다). 두 변이 모두 수정 후 잡힌다(각각 1건·3건 실패). 위 예방 규칙 2건이 여기서 나왔다.
- 커밋 `60058c3` — 위 단언들의 편집 영역 조회를 파일별 헬퍼(`getEditable`, `openBlockMenu`, `renderTable`)로 모으고 초점 단언을 주 동작 단언 뒤로 옮겼다. 변이 10건 재실행으로 커버리지가 유지됨을 확인했다.
- `formatting-toolbar.tsx`는 `contenteditable` 셀렉터도 초점 복구 경로도 없어 그 테스트 파일은 fake만 고치고 초점 단언은 추가하지 않았다.
- `slash-menu.tsx`의 Escape 핸들러는 초점을 복구하지 않는다(`focusEditor`는 `selectItem` 말미에서만 호출) — 그래서 slash-menu의 초점 단언은 Escape가 아니라 항목 선택 경로를 검증한다.
- Issue #53 — 위 `block-side-menu` 3곳(turn into·duplicate·delete) 커버 테스트가 있던 `describe("SlashMenu 블록 메뉴", ...)`를 `slash-menu.test.tsx`에서 `block-side-menu.test.tsx`로 순수 이동했다. 즉 위 커밋 `cbd3776` 항목의 "커버 테스트는 `slash-menu.test.tsx`에 있다"는 서술은 그 시점 기준이고, 현재는 `block-side-menu.test.tsx`가 이 3곳을 커버한다.
- Issue #59 — 위 3곳 커버 테스트가 여전히 `<SlashMenu />`를 합성 마운트하던 것을(Feature Envy·Divergent Change smell로 지적됨) `block-side-menu.test.tsx` 최상위 `fakeController`/`openBlockMenu`로 `<BlockSideMenu />`를 직접 마운트하도록 바꿨다 — `SlashMenu` import가 완전히 사라졌고, 커버 테스트는 이제 `describe("블록 메뉴 열기/토글과 항목 액션(종류 변경/복제/삭제)", ...)`에 있다. 3개 focusEditor 회귀 mutation을 이 마운트 경로로 다시 확인했다(전부 재현 후 원복).

## 관련 문서

- [PIT-0013 오버레이 바깥 클릭·Escape 닫기는 공용 훅으로 구현한다](./PIT-0013-share-outside-click-escape-dismiss-via-hook.md)
