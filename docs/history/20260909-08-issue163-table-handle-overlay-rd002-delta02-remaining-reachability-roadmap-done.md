# Issue #163 표 핸들 오버레이 뷰포트 도달성 RD-002 DELTA-02 — 나머지 5종 도달성 + 스크롤 드래그 회귀 + roadmap 완료

## 목표

roadmap-workflow RD-002의 마지막 실행 DELTA. DELTA-01이 Add row 1종만 실측한 "오버레이 6종 뷰포트 도달성"을 나머지 5종(행/열 재정렬 핸들, 열 리사이즈 스트립, Add column, indent/outdent)까지 확장하고, DELTA-01이 "남은 위험"으로 남긴 스크롤 상태 재정렬 드래그 히트테스트 정확성을 회귀 e2e로 고정하며, `docs/product/ui-ux-checklist.md`의 `QA-056` 판정을 실제 결론에 맞춰 갱신해 RD-002·roadmap 전체를 완료한다.

## 확정 커밋

- `473c69c` — test(table-format): 표 핸들 오버레이 나머지 5종 도달성 e2e + 스크롤 재정렬 드래그 회귀 추가
- `a3fd804` — docs(ui-ux-checklist): QA-056 판정을 Issue #163 결론에 맞춰 정정한다

## 변경한 계약과 파일

- `e2e/table-format.spec.ts`: 신규 e2e 5건 추가(기존 테스트·헬퍼는 수정 없음).
  - 표 하단 행 재정렬 핸들·리사이즈 스트립 도달성(클릭·hover).
  - 표 상단 열 재정렬 핸들·Add column 도달성(신설 헬퍼 `scrollPastOverlay` + `scrollIntoViewIfNeeded()`·클릭).
  - indent·outdent 도달성(`.focus()`·`scrollIntoViewIfNeeded()`).
  - Add row 스크롤 우회 없는 반복 클릭 재검증(Issue #163 본문의 재현 방법 자체를 회귀 방지로 전환).
  - 스크롤이 있는 페이지에서의 행 재정렬 드래그 목표 정확성.
- `docs/product/ui-ux-checklist.md`: `QA-056`에 정정 각주 추가(기존 텍스트 보존).

공개 계약(패키지 export shape) 변경 없음 — 이 DELTA는 테스트·문서만 바꿨다.

## 검증

- `pnpm exec playwright test e2e/table-format.spec.ts --project=chromium` — 25/25 통과.
- post-fix mutation(실측 후 원복):
  - `table-handle-overlays.tsx`의 `position: "absolute"` 6곳 + `_table-handles.scss` 2곳을 `fixed`로 되돌리면 신규 5건 중 4건이 RED(조건 5도 부수적 RED).
  - `table-handles.tsx`의 `handleReorderMove`가 넘기는 `event.pageX/pageY`를 `event.clientX/clientY`로 되돌리면 조건 5만 독립적으로 RED(나머지 4건은 GREEN 유지 — 변수 격리 확인).
- `--repeat-each=5`(5-worker) 반복 실행 — flaky 신호 없음.
- `pnpm exec tsc -p e2e/tsconfig.json --noEmit`, `pnpm lint`, `git diff --check` — clean.
- `pnpm verify`(lint·format:check·build·escompat·typecheck·전 패키지 unit test·`test:e2e` chromium+mobile 200건·check:boundaries·check:licenses) — 전량 통과.
- `pnpm exec playwright test --project=firefox --project=webkit`(`@core` 부분집합, RD-002.md "결정"에 따른 최종 3-엔진 확인) — 76/76 통과, 엔진 간 분기 없음.

## 계획 해석 — "우회 처리된 두 테스트" 복원 방식

Issue #163 본문과 RD-002.md 둘 다 "제외 범위"로 `e2e/table-format.spec.ts`의 `scrollIntoViewportBounds`/`growTableTo11Rows` 헬퍼와 그걸 쓰는 두 PIT-0011 테스트(216행·418행)를 "되돌리지 않는다"로 명시 보호한다. 이 DELTA는 그 두 테스트·헬퍼를 그대로 두고, 대신 Issue #163 본문이 재현 방법으로 직접 지목한 "우회(`scrollIntoViewportBounds`)를 걷어내고 원래의 단순 반복 클릭 루프로 되돌리면 재현한다"는 시나리오를 **새 테스트**로 추가해 우회 없는 네이티브 클릭 루프가 이제 성공함을 별도로 증명했다 — 보호 대상은 건드리지 않으면서 "네이티브 scrollIntoView 기반 재검증"의 취지를 채웠다(계획 상세는 `_works/roadmap/result/RD-002-DELTA-02.md` "배경" 참고).

## 발견과 처리(메인 세션 직접 검증, DELTA 규모상 subagent dispatch 없이 진행)

전체 diff 재검토 결과 BLOCKER·MAJOR·MINOR 0건. `docs/product/ui-ux-checklist.md`가 이미 `dev` 기준 prettier 미준수 상태였음을 편집 전 `git stash` 대조로 확인했다 — QA-056 한 줄만 반영하고 무관한 전체 재포맷(prettier가 표 전체 컬럼 폭을 재정렬하려 함)은 하지 않았다(범위 밖 변경 방지).

## RD-002.md 완료 조건 대조

- 조건 1(오버레이 6종 도달성): DELTA-01(Add row) + 이 DELTA(나머지 5종)로 전부 충족 — 체크.
- 조건 2(회귀 e2e): DELTA-01 1건 + 이 DELTA 5건, 총 6건으로 충족 — 체크.
- 조건 3(`QA-056` 갱신): 이 DELTA로 충족 — 체크.

`RD-002.md`의 "예상 DELTA" DELTA-02 체크박스와 완료 조건 3개를 전부 체크하고 상태를 `ACTIVE`→`DONE`으로 전환했다.

## roadmap(Issue #163) 완료

`RD-001 → RD-002` DAG의 두 RD가 모두 `DONE`이 돼 roadmap 전체가 완료됐다. `roadmap.md`의 "전체 완료 조건" 3개(Issue #163 완료 기준 4개, `QA-056` 갱신, `pnpm verify` 통과)를 재대조해 전부 체크했다. `_works/roadmap/progress.md`에 이번 실행을 append했다.

## 등록한 이슈

없음. `media-resize-handles.tsx`의 동일 결함(RD-002.md "결정"에서 이미 범위 제외 기록됨)은 이번 실행에서도 새로 이슈화하지 않았다 — 사용자 별도 지시가 있을 때만 등록하는 결정을 유지한다.

## 게시

`_works/roadmap/pending-issues/01.md`(상태: 미등록)를 RD-001·RD-002 전체 완료 보고로 갱신했다. 게시는 사용자 확인 후 수행한다 — roadmap-workflow DELTA 사이클은 qq-workflow 단계-4·ff-workflow 트랙-8과 달리 게시 무확인 예외 대상이 아니다(`docs/agents/issue-tracker.md`, DELTA-01 완료 시 세운 선례를 유지). roadmap이 전체 완료됐어도 이 규칙은 바뀌지 않는다.

## 남은 위험

없음 — DELTA-01이 남긴 유일한 후보(스크롤 상태 재정렬 드래그 정확성)를 이 DELTA로 해소했다. `media-resize-handles.tsx`의 동일 결함은 RD-002 범위 밖으로 남아 있다(위 "등록한 이슈" 참고).

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.
- `_works/roadmap/` archive(`_works/_completed/`로 이동)는 이 기록과 별도로 수행한다.

## rollback

`git revert a3fd804 473c69c`(순서대로). 위험: 낮음 — `e2e/table-format.spec.ts`에 테스트만 추가했고 `docs/product/ui-ux-checklist.md`는 각주 한 줄뿐이라, 되돌려도 제품 코드나 다른 문서에 영향 없다. 되돌리면 나머지 5종 도달성·스크롤 드래그 회귀의 실측 증거와 `QA-056` 정정이 사라진다(DELTA-01의 코드 수정 자체는 영향받지 않는다).
