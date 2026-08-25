# 20260825-12 table-handles.tsx 오버레이 geometry 재측정으로 마지막 열 클릭 가로채기 수정(#15)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #15(종료), #118(신규 등록, 미종료 — 관련 발견)
- 작업 브랜치: `fix/15-table-handle-overlay-click-intercept`(`dev` ff-only 이전 후 삭제)

## 목표

표 마지막 열 근처 클릭이 `table-handles.tsx`의 fixed 오버레이(열 추가 버튼 등)에 가로채이는 결함을 고친다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `542135f` | fix(react): table-handles.tsx 오버레이 geometry를 commit 직후 재측정해 마지막 열 클릭 가로채기를 고친다 |

작업 브랜치 커밋은 1개(단계-2 구현)뿐이었다 — 단계-3 결함 탐지에서 BLOCKER/MAJOR가 없어 후속 수정 커밋이 생기지 않았다. 재조립이 필요 없어 생략하고 `dev`로 직접 fast-forward 이전했다(`8aebc34..542135f`).

## 바꾼 계약과 파일

공개 계약 변경 없음(내부 오버레이 위치 계산 타이밍만 변경).

- `packages/react/src/table-handles.tsx`(+48/-1) — `useLayoutEffect`로 commit 직후 표의 outer rect를 재측정해 render-body geometry와 다르면 한 번 더 렌더하는 자기교정 트리거를 추가했다. 드래그 중(`reorderState`/`resizeState`)은 건너뛴다.
- `e2e/table-handle.spec.ts`(+39) — 파일 개요 주석과 함께, 셀 편집으로 레이아웃이 밀린 뒤 마지막 열 셀을 `page.mouse.click`으로 직접 클릭하는 회귀(`--repeat-each=15 --workers=1`로 확인)를 추가했다.

파일 2개(`+86/-1`).

## 실행한 검증과 결과

단계-3 진입, 단계-4 병합 직전 `pnpm verify` 전량 2회 모두 통과(verify:packages 5+10 turbo tasks·vitest 1013 passed(69 files)·e2e chromium+firefox+webkit 116 passed 39.5~39.8s).

```
pnpm --filter @cp949/geul-react typecheck                                              통과
pnpm --filter @cp949/geul-react test                                                   191 passed (16 files)
pnpm exec playwright test e2e/table-handle.spec.ts -g "레이아웃이 밀린" \
  --project=chromium --repeat-each=15 --workers=1                                      15 passed
```

단계-3 결함 탐지 리뷰(읽기 전용 subagent) — G-UI-001·G-TBL-001, AGENTS.md 아키텍처 불변식 대조. `git worktree`에서 fix를 뺀 채로 신규 회귀를 재실행해 5/5 실패(진짜 RED)를, `page.mouse.click`을 `Locator.click()`으로 바꾸면 fix 없이도 8/8 통과(거짓 통과 위험)를 각각 실측 확인했다. BLOCKER/MAJOR 0건, MINOR 1건(드래그 중 재정렬 가이드 라인의 1-렌더 랙 — 이번 diff의 회귀 아님, 조치 불필요로 판정).

## 남은 제한

- 클릭 직후 `editor.state.selection`이 DOM selection과 어긋나 Tab/Shift+Tab이 표를 이탈하는 결함을 조사 중 발견했다(`packages/core/src/table-keyboard-extension.ts`의 `isInTable` 오판) — 기존 `@core` 게이트 테스트를 chromium에서 이미 불안정하게 깨뜨리고 있었다(이번 변경과 무관, baseline에서 독립 확인). `packages/core` 소관이라 이번 DELTA에 포함하지 않고 [Issue #118](https://github.com/cp949/geul/issues/118)로 분리했다.
- `table-selection-toolbar.tsx`, `slash-menu.tsx` 등 다른 fixed overlay 컴포넌트의 동일 클래스 결함 여부는 미조사(범위 밖).

## 등록한 이슈와 pitfall

- 신규 이슈 [#118](https://github.com/cp949/geul/issues/118) 등록(위 "남은 제한" 참고). [Issue #11](https://github.com/cp949/geul/issues/11)(빈 병합 셀 재클릭 캐럿 미진입)과 증상 패턴이 겹쳐 교차 링크했고, #11에도 관련 발견 댓글을 남겼다([issuecomment-5405384955](https://github.com/cp949/geul/issues/11#issuecomment-5405384955)).
- 완료 댓글 1건 등록([issuecomment-5405386146](https://github.com/cp949/geul/issues/15#issuecomment-5405386146)) 후 #15 종료.
- 가이드·pitfall 등록 없음(G-UI-001·G-TBL-001로 이미 충분히 커버, 새 가이드 공백 없음. 적용 함정 없음).

## 절차상 기록

계획서(01-계획.md) "결정 2"는 `ResizeObserver` 기반 재계산 트리거를 1차 수정으로 권고했으나, 실제 재현 결과 root cause가 표 자신의 **크기 변화**가 아니라 앞선 형제 요소의 줄바꿈에 따른 **위치 이동**이었다 — `ResizeObserver`는 관찰 대상의 박스 크기 변화에만 반응해 이 repro를 잡지 못한다. 대신 `useLayoutEffect` 기반 "commit 직후 재측정 → 다르면 한 번 더 렌더" 방식으로 구현했다(G-UI-001의 "useLayoutEffect에서 렌더된 크기를 재고" 문구와 일치, `use-clamped-menu-position.ts`가 쓰는 자매 패턴). 단계-3 결함 탐지가 이 이탈을 별개로 재검토해 무한 루프·부동소수점 비교·race 위험이 없음을 확인했다.
