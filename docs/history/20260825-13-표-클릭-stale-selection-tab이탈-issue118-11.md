# 20260825-13 표 셀 클릭 직후 stale selection으로 Tab/Shift-Tab이 표를 이탈하는 문제 수정(#118, #11)

- 레인: ff-workflow (트랙 0~8)
- 대상 이슈: #118(종료), #11(종료 — 조사 결과 다른 원인으로 판정)
- 작업 브랜치: `fix/118-cell-click-selection-desync`(`dev` ff-only 이전 후 삭제)

## 목표

표 삽입 직후 첫 셀 클릭 뒤 곧바로 Shift+Tab을 누르면 `editor.state.selection`이 stale해 `isInTable`이 표 밖이라고 오판하고 포커스가 표를 이탈하는 결함(chromium 전용, `@core` 게이트 불안정 원인)을 고친다. 같은 조사로 Issue #11(빈 병합 셀 재클릭)과 근본 원인이 같은지 판정한다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `62fb95b` | fix(core): 표 셀 클릭 직후 stale selection으로 Tab/Shift-Tab이 표를 이탈하는 문제를 고친다 |

작업 브랜치 커밋은 1개뿐이었다 — 트랙-5·6(누락·결함 탐지)에서 BLOCKER/MAJOR가 없어 후속 수정 커밋이 생기지 않았다(트랙-4 메인 세션 gate에서 구현 중 발견한 결함 2건은 같은 커밋에 `--amend`로 흡수). 재조립이 필요 없어 `dev`로 직접 fast-forward 이전했다(`ec5b970..62fb95b`).

## 근본 원인

Chromium은 클릭 뒤 native `selectionchange`를 비동기로 처리한다. 클릭 직후 곧바로 Tab/Shift-Tab이 눌리면 `addKeyboardShortcuts` 핸들러가 그 비동기 처리보다 먼저 실행돼 `editor.state.selection`이 클릭 이전 값을 그대로 들고 있었다 — 네이티브 DOM selection은 이미 정확했다. `view.domObserver.forceFlush()`로 강제해도 고쳐지지 않는다(내부 캐시된 `currentSelection`이 이미 "처리됨"으로 표시돼 있어 아무 것도 하지 않는다). firefox/webkit은 이 결함에 영향받지 않는다(8/8×2).

## 바꾼 계약과 파일

공개 계약 변경 없음(두 함수 모두 `packages/core/src/index.ts`에 재노출되지 않음, 시그니처 불변).

- `packages/core/src/table-keyboard-extension.ts`(+34/-2) — `resolveSelectionAwareState` 헬퍼 추가. `goToNextTableCellOrInsertRow`/`goToPreviousTableCell`이 `editor.state` 대신 DOM 기준으로 재계산한 파생 `EditorState`로 판정한다. 파생 state는 `EditorState.apply()`로 메모리에서만 만들고 별도 dispatch하지 않는다 — 기존 단일 `view.dispatch` 경로에 흡수시켜 한 사용자 조작에 transaction이 두 번 일어나지 않게 했다(G-EDT-001). `CellSelection`은 건드리지 않는다.
- `packages/core/test/table-keyboard-extension.test.ts`(+132) — bug-catching RED unit 2건 추가.

파일 2개(`+166/-5`).

## 실행한 검증과 결과

트랙-5 진입, 트랙-8 병합 직전 `pnpm verify` 전량 2회 모두 통과(1차는 커밋 `d0ed2d9`의 biome `noNonNullAssertion` 오류 4건으로 실패 — 원인이 이 작업 커밋임을 `tests/worktree-lint.test.ts`가 `HEAD` 체크아웃 방식으로 확인, `--amend`로 수정 후 재실행 통과. e2e 116/116, 39.5s).

```
pnpm exec playwright test e2e/table-keyboard-navigation.spec.ts \
  --project=chromium --repeat-each=15 --workers=1     14/15 실패(수정 전) → 15/15 통과(수정 후)
pnpm exec playwright test e2e/table-keyboard-navigation.spec.ts \
  --project=firefox --project=webkit                   2/2 passed(원래도 영향 없음, 유지 확인)
pnpm --filter @cp949/geul-core test                     400 passed(22 files)
```

트랙-6 결함 탐지(Light, 읽기 전용 subagent 1개) — `resolveSelectionAwareState`의 5개 경로(CellSelection/DOM selection null/`posAtDOM` 음수 sentinel 폴백/정상 일치 no-op/실제 불일치 재동기화)를 소스 추적 + unit 실행으로 검증, `insertTableRow` 경로가 `applyTableGridOperation`의 `selectCellId` 명시 재계산 덕에 stale selection에 영향받지 않음을 확인. BLOCKER/MAJOR/MINOR 0건.

Issue #11 재현 시도: headless chromium 10회 + 비-headless(실제 X 디스플레이) chromium 20회, 총 30회 전부 재현 안 됨 — 118과 증상 패턴("DOM selection 정확·PM selection만 stale")은 같지만 트리거·재현율이 달라 같은 근본 원인이라는 근거를 확인하지 못했다.

## 남은 제한

- `insertTableRow` 경로(마지막 셀 클릭 직후 Tab → 새 행 생성)를 직접 검증하는 e2e/unit이 이 저장소에 없다 — 코드 추적으로만 안전성을 확인했다. 기존 스위트의 공백이라 등록 기준(제품 동작·게이트 구멍·거짓 통과) 미충족으로 별도 이슈를 등록하지 않았다.
- 실제 사용자의 물리적 마우스 입력이 자동화 클릭과 다른 타이밍을 만들어 Issue #11을 재현시킬 가능성은 배제하지 못했다 — #11 완료 댓글에 재오픈 조건으로 명시했다.

## 등록한 이슈와 가이드

- 신규 이슈 등록 없음.
- 완료 댓글 2건 등록 — [#118](https://github.com/cp949/geul/issues/118#issuecomment-5407538596), [#11](https://github.com/cp949/geul/issues/11#issuecomment-5407541487). 둘 다 종료.
- 신규 가이드 [`G-EDT-002`](../guides/G-EDT-002-resync-selection-before-reading-stale-state.md) 등록(클릭 직후 stale selection 재동기화 패턴) — `docs/guides/INDEX.md` 동기화. 적용 함정 없음(pitfall 신규 등록 없음).

## 절차상 기록

트랙-2 계획서 리뷰 라운드 1에서 최초 DELTA 설계(DOM 재동기화를 별도 `view.dispatch`로 먼저 커밋 후 `isInTable` 판정)가 `G-EDT-001`("한 사용자 조작 = 하나의 transaction")과 어긋남을 발견해, `EditorState.apply()`로 만든 파생 state를 기존 단일 dispatch 경로에 흡수시키는 방식으로 재설계했다(라운드 2 clean review에서 ProseMirror 소스 추적으로 안전성 재검증). 트랙-4 메인 세션 gate에서 fast implementer(haiku) 산출물의 결함 2건을 직접 발견해 수정했다 — 신규 unit의 관용적 skip(jsdom detached 컨테이너라 `Selection.focusNode`가 항상 `null`이라 검증 없이 통과하던 것, `document.body` 부착으로 해결)과 `resolveSelectionAwareState`의 try/catch 범위 부족(`posAtDOM`이 뷰 밖 노드에서 예외 대신 `-1`을 반환해 `doc.resolve`가 미처리 `RangeError`를 던지던 것).
