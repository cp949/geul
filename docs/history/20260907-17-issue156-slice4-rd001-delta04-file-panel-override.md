# Issue #156 슬라이스4 RD-001 DELTA-04 — `FilePanel` `component` override (RD-001 완료)

## 목표

RD-001(최상위 오버레이 4종 `component` override prop, `EXT-006`/`EXT-007`)의 마지막 DELTA. DELTA-01~03과 동일 계약을 `FilePanel`에 적용한다.

## 확정 커밋

- `3ec3a16` — feat(react): FilePanel component override 지원(EXT-006/EXT-007)

## 변경한 계약과 파일

- `packages/react/src/file-panel.tsx` — `FilePanelProps`에 `component` 필드 추가, `mode === "closed"` 게이트 직후 조기 return 분기.
- `packages/react/test/file-panel.test.tsx` — 신규 top-level `describe("FilePanel component override(슬라이스4 RD-001 DELTA-04)", ...)` 2건.

## 검증

- RED: "지정하면 소비자 컴포넌트가 렌더되고 editor를 받는다" 1건 구현 전 실패 확인.
- GREEN: 26개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react test`(RD-001 마지막 DELTA, 패키지 전체) — 38 files / 525 tests passed.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- `pnpm exec playwright test --project=chromium`(formatting-toolbar/link-toolbar/media-toolbar/media-file-panel, `--retries=1`) — "Preview 버튼의 aria-pressed가 클릭마다 반전된다" 1건이 원 시도+재시도 모두 실패했으나 단독 5회 반복은 5/5 통과 — RD-003 DELTA-05에서 이미 확인한 `insertFilledImage`(`e2e/support/demo.ts:91`) 관련 기존 플레이크와 동일 패턴. `component` override diff는 렌더 분기만 추가했을 뿐 업로드·selection 흐름을 바꾸지 않아 이 DELTA·RD-001이 만든 회귀가 아니다.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 완료 조건 재대조 (마지막 DELTA)

- 4개 컴포넌트 전부 `component` override 시 소비자 컴포넌트가 렌더되고 동일 command를 실행 — PASS. 증거: DELTA-01~04 각 result 파일(`toggleBold`/`unsetLink`/`deleteBlock`/`setMediaBlockUrl` 호출 검증).
- 기존 단위 테스트 회귀 없음 — PASS. 증거: 위 검증(525 tests passed).
- `pnpm --filter @cp949/geul-react test` 통과 — PASS.

3개 전부 충족 — RD-001 `DONE` 전환(`_works/roadmap/RD-001.md`).

## roadmap 진행 상태

RD-001·RD-003 DONE. RD-002(SlashMenu 커스텀 아이템)·RD-004(emoji picker, RD-003 의존 충족)가 남았다. roadmap 전체는 미완료.

## 등록한 이슈

없음. e2e 플레이크는 RD-003 DELTA-05에서 이미 등록하지 않기로 판단한 것과 같은 사안이라 재등록하지 않는다.

## 게시

없음 — roadmap 전체(슬라이스4) 미완료.

## 남은 위험

- `component` payload("editor만")는 RD-001 4개 컴포넌트 전부에 동일 계약으로 적용됐다 — 추가 필드가 필요해지면 additive로 확장 가능.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 3ec3a16`. 위험: 낮음 — 신규 optional prop, 기본값 동작 불변 확인. RD-001 전체를 되돌리려면 DELTA-04부터 DELTA-01까지 역순으로 4개 커밋을 revert한다.
