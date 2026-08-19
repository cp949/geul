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
- `formatting-toolbar.tsx`는 `contenteditable` 셀렉터도 초점 복구 경로도 없어 그 테스트 파일은 fake만 고치고 초점 단언은 추가하지 않았다.
- `slash-menu.tsx`의 Escape 핸들러는 초점을 복구하지 않는다(`focusEditor`는 `selectItem` 말미에서만 호출) — 그래서 slash-menu의 초점 단언은 Escape가 아니라 항목 선택 경로를 검증한다.

## 관련 문서

- [PIT-0013 오버레이 바깥 클릭·Escape 닫기는 공용 훅으로 구현한다](./PIT-0013-share-outside-click-escape-dismiss-via-hook.md)
