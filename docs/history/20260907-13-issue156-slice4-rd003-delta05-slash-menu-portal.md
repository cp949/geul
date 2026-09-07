# Issue #156 슬라이스4 RD-003 DELTA-05 — `SlashMenu` `portalTarget` (RD-003 완료)

## 목표

RD-003(`portalTarget` 5개 컴포넌트 공통 적용, `UI-013`)의 마지막 DELTA. `SlashMenu`의 슬래시 명령 팝업에 DELTA-01~04와 동일 계약을 적용한다.

착수 전 범위 판단(`_works/roadmap/result/RD-003-DELTA-05.md` "계획"): `SlashMenu`는 자기 팝업 외에 `BlockSideMenu`/`CodeBlockLanguageCombobox`/`TableHandles`/`TableSelectionToolbar`/`BlockSelectionToolbar`를 "중복 마운트 방지"로 내부 자동 마운트한다(spec §6.1). 이 5개는 각자 독립된 오버레이라 `portalTarget`은 슬래시 팝업 자신에만 적용한다 — 전체를 감싸면 roadmap.md "결정"(`BlockSideMenu`/`TableHandles`는 이 slice 범위 밖)과 어긋나는 부작용이 생긴다.

## 확정 커밋

- `0ed8507` — feat(react): SlashMenu portalTarget 지원(EXT-006/UI-013)

## 변경한 계약과 파일

- `packages/react/src/slash-menu.tsx` — 반환 JSX 중 슬래시 팝업 div만 `menuContent`로 추출해 조건부 `createPortal`로 감쌌다. `BlockSideMenu`/`CodeBlockLanguageCombobox`/`TableHandles`/`TableSelectionToolbar`/`BlockSelectionToolbar`는 그대로 fragment 안에 남겨 `portalTarget`과 무관하게 제자리 렌더를 유지한다.
- `packages/react/src/index.ts` — `SlashMenuProps` 공개 export.
- `packages/react/test/slash-menu/popup.test.tsx` — 신규 top-level `describe` 3건(지정 시 팝업만 이동, 지정해도 `BlockSideMenu` 드래그 핸들은 제자리 유지, 미지정 시 형제 위치 유지).

## 검증

- RED: "지정하면 슬래시 팝업만 그 요소 하위에 렌더한다" 1건 구현 전 실패 확인. 나머지 2건은 계획한 범위 판단이 옳다는 characterization이라 구현 전에도 통과.
- GREEN: 3개 파일 47개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react test`(RD-003 마지막 DELTA, 패키지 전체) — 38 files / 517 tests passed.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- `pnpm exec playwright test --project=chromium`(5개 spec: formatting-toolbar/link-toolbar/media-toolbar/media-file-panel/slash-menu) — 3회 반복 실행 시 매번 `media-toolbar.spec.ts`의 서로 다른 테스트 1~5개가 `insertFilledImage`(`e2e/support/demo.ts:91`) 헬퍼의 "Media toolbar visible" 대기에서 간헐 실패했다. 실패 테스트 집합이 매 실행 무작위로 겹치지 않고(첫 테스트·Enter·Escape·Download·Preview·정렬 등 서로 무관), 각 실패 테스트를 단독 실행하면 항상 통과했다 — `slash-menu.tsx`/`media-toolbar.tsx`의 diff는 렌더 위치 분기만 추가했을 뿐 업로드·selection 흐름을 바꾸지 않았으므로 이 DELTA·RD-003이 만든 회귀가 아니다. CI와 동일 설정(`playwright.config.ts:32`, `retries: process.env.CI ? 2 : 0`)으로 `--retries=2` 재실행하면 55개 전부 PASS(4건 "flaky"로 1회 재시도 후 통과). `formatting-toolbar`/`link-toolbar`/`file-panel`/`slash-menu` 4개 spec은 세 번의 실행 모두 100% 안정적으로 통과했다.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-003 완료 조건 재대조 (마지막 DELTA)

- 5개 컴포넌트 모두 `portalTarget` 지정 시 지정 DOM 노드 하위 렌더 — PASS. 증거: DELTA-01~05 각 result 파일의 RED/GREEN.
- 미지정 시 기존 e2e 5개 스펙 회귀 없음 — PASS. 증거: 위 검증(`--retries=2`로 55개 전부 PASS, 이 RD와 무관한 기존 플레이크 별도 확인).
- `pnpm --filter @cp949/geul-react test`, `pnpm test:e2e --project=chromium` 통과 — PASS.

3개 전부 충족 — RD-003 `DONE` 전환(`_works/roadmap/RD-003.md`).

## roadmap 진행 상태

RD-003 DONE. RD-004(emoji picker)가 이제 readiness probe 대상 — RD-001/RD-002는 아직 미착수(둘 다 CANDIDATE, RD-003과 무관하게 병행 가능). roadmap 전체는 미완료(RD-001/RD-002/RD-004 남음).

## 등록한 이슈

없음. `media-toolbar.spec.ts`의 `insertFilledImage` 관련 간헐 플레이크는 이 RD가 만든 것이 아니고 CI `retries:2`가 이미 흡수하도록 설정된 이 저장소의 기존 특성이라 새로 등록하지 않았다(issue-tracker.md "등록 기준" — 제품 동작 변경·게이트 구멍·거짓 통과가 아니다).

## 게시

없음 — roadmap 전체(슬라이스4)가 아직 미완료라 Issue #156 완료 댓글은 슬라이스4 전체(RD-001~004) 완료 시점까지 보류한다(슬라이스1~3 전례와 동일 패턴).

## 남은 위험

- `BlockSideMenu`/`TableHandles` override(`EXT-007`의 "side/table" 부분)는 여전히 이 slice 범위 밖이다(roadmap.md "결정").
- `media-toolbar.spec.ts`의 `insertFilledImage` 간헐 플레이크는 이 RD 완료 후에도 남아 있다(CI retries로 흡수, 별도 근본 수정 없음) — 후속 세션이 다시 만나면 이 이력과 `result/RD-003-DELTA-05.md`를 먼저 참고한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 0ed8507`. 위험: 낮음 — 신규 optional prop, 기본값 동작 불변 확인. RD-003 전체를 되돌리려면 DELTA-05부터 DELTA-01까지 역순으로 5개 커밋을 revert한다.
