# PIT-0013 오버레이 바깥 클릭·Escape 닫기는 공용 훅으로 구현한다

- 상태: `ACTIVE`
- 적용 영역: react, e2e
- 최초 근거: R1 슬라이스 10 리뷰 (Issue #20)

## 상황과 징후

메뉴·툴바 같은 오버레이를 "바깥 pointerdown 또는 Escape로 닫는다" 요구가 새 오버레이마다 반복된다. `table-handles.tsx`, `table-selection-toolbar.tsx`, `block-side-menu.tsx` 세 곳이 독립적으로 같은 20~30줄짜리 effect(allow-list 셀렉터로 `closest()` 확인 → pointerdown이면 닫기, Escape면 `preventDefault` 후 닫기+초점 복구)를 손으로 복제했다. `table-selection-toolbar.tsx`의 원래 주석은 "table-handles.tsx의 closeMenu와 같은 패턴"이라고 스스로 밝혔을 정도로 복제가 의도적이었다.

## 근본 원인

복제 시점에는 "지금 당장 동작하게 만든다"가 우선이라 기존 구현을 그대로 옮겨 쓰는 편이 새 훅을 설계하는 것보다 빠르다. 문제는 그 다음이다 — 한쪽만 고치면(예: capture 단계로 바꾸거나 allow-list를 갱신) 오버레이 사이 닫힘 동작이 갈라진다. 오버레이가 늘어날수록(SlashMenu, LinkToolbar, FormattingToolbar도 유사 UI를 열 수 있다) 복제 지점이 함께 늘어난다.

## 예방 규칙

- 바깥 pointerdown 또는 Escape로 오버레이를 닫아야 하면 새로 effect를 쓰지 않고 `packages/react/src/use-dismiss-on-outside-or-escape.ts`의 `useDismissOnOutsideOrEscape`를 쓴다.
- `allowSelectors`는 호출부 모듈 스코프 상수로 선언한다(매 렌더 새 배열을 넘기면 리스너가 매 렌더 재등록된다).
- 바깥 클릭(`onOutsideDismiss`)과 Escape(`onEscapeDismiss`)는 보통 다른 초점 처리가 필요하다 — 바깥 클릭은 클릭 대상이 자연히 초점을 받으므로 강제로 옮기지 않고, Escape는 돌아갈 대상이 없으므로 보통 편집기로 초점을 되돌린다. 이 훅은 두 콜백을 분리해두었으니 합치지 않는다.
- 이 훅으로 만든 Escape 닫기 e2e는 PIT-0009 규칙대로 `--workers` 병렬 반복 실행으로 검증한다.

## 검증 방법

```bash
npx playwright test e2e/table-format.spec.ts e2e/block-handle.spec.ts -g "Escape|바깥" --repeat-each=20 --workers=5
```

## 실제 근거

- Issue #20 — `table-handles.tsx`/`table-selection-toolbar.tsx` 2곳 중복을 최초 보고. 구현 계획 수립 중 `block-side-menu.tsx`에서 3번째 동일 패턴을 추가 발견했다 — Issue #19 → #43 분리 선례를 따라 별도 이슈(#45)로 분리했다.
- Issue #45 — 세 번째 중복 지점이던 `block-side-menu.tsx`도 공용 훅으로 통합했다. 마이그레이션 전 특성화 단위 테스트(`packages/react/test/block-side-menu.test.tsx`)로 기존 동작을 먼저 고정한 뒤 치환했다. 이제 `table-handles.tsx`, `table-selection-toolbar.tsx`, `block-side-menu.tsx` 세 곳 모두 `useDismissOnOutsideOrEscape` 하나를 공유한다.
- Issue #47 — 같은 파일의 메뉴 액션 핸들러 3개(`handleTurnInto`/`handleDuplicate`/`handleDeleteBlock`)도 `closeBlockMenu()`를 재사용하게 해 `block-side-menu.tsx` 안의 닫기 경로를 하나로 모았다(커밋 `b8e6e97`). 훅 배선이 아니라 닫기 *호출*의 중복이라 규모는 작지만, 닫기 절차가 바뀔 때 네 곳 중 일부만 고쳐지는 실패 양상은 같다.
- `packages/react/src/use-dismiss-on-outside-or-escape.ts`가 공용 구현을 소유한다.
- Issue #48 — `onOutsideDismiss`/`onEscapeDismiss` 분리가 이제 `table-handles.tsx`, `table-selection-toolbar.tsx`, `block-side-menu.tsx` 세 곳 모두 단위 테스트(`document.activeElement` 단언)로 고정됐다. `table-handles`/`table-selection-toolbar`는 두 콜백을 서로 바꿔치기하는 변이 검증 4건(전부 실패 확인 후 되돌림, 커밋 `a211c5b`+`3c32099`)을 거쳤고, `block-side-menu`는 같은 배선 교환이 기존 단언을 무력화한다는 사실(커밋 `954d755`)을 근거로 초점 단언을 추가했다.

## 관련 문서

- [PIT-0009 UI를 닫는 키보드 핸들러는 병렬 e2e로 검증](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md)
