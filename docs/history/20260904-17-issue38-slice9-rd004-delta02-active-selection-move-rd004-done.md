# Issue #38 슬라이스 9 RD-004 DELTA-02 — 활성 블록 선택 범위 이동, RD-004 DONE·roadmap 완료

## 목표

roadmap-workflow RD-004의 마지막 DELTA. `Shift-Mod-ArrowUp`/`Shift-Mod-ArrowDown`을 누를 때 활성 블록 선택 범위(`session.getBlockSelection()`)가 있으면 캐럿 단일 블록이 아니라 그 범위 전체(같은 형제 배열 안)를 한 칸 위/아래로 옮긴다. 이 DELTA로 RD-004 완료 조건 4개가 모두 충족돼 RD-004가 `DONE`으로 전환되고, RD-004가 이 roadmap의 마지막 RD였으므로 Issue #38 슬라이스 9(키보드 단축키와 입력 규칙) roadmap 전체가 완료된다.

## 확정 커밋

- `1a258b7` — 활성 블록 선택 범위 이동 지원 추가 (Issue #38 슬라이스 9, RD-004 DELTA-02)
- `3755af3` — 제품 문서 동기화: 슬라이스 9 완료 반영(`blocknote-free-feature-inventory.md`의 `UI-011` `VERIFIED`, `current-status.md` 슬라이스 9 서사 추가)

## 변경한 계약과 파일

- `packages/core/src/production-editor-session.ts` — `createTiptapEditor`가 `getBlockSelection: () => this.getBlockSelection()`을 `createProductionEditor`에 새로 넘긴다. `session.getBlockSelection()`은 PM Selection과 독립된 `ProductionEditorSession` private 필드라 키보드 shortcut 확장(`this.editor`만 가짐)에서 직접 읽을 수 없었는데, `createId`가 이미 쓰는 배선 경로(session → assembly → extension `configure`)를 그대로 재사용해 콜백을 새로 연결했다.
- `packages/core/src/production-editor-assembly.ts` — 옵션 타입에 `getBlockSelection` 구조적으로만 추가(session의 순환 의존 회피 관례를 따라 import 없음), `BlockMoveKeyboardExtension.configure({getBlockSelection})`.
- `packages/core/src/block-move-keyboard-extension.ts` — `addOptions()`로 안전한 기본값(`() => null`, `RevisionGuardExtension`과 같은 패턴), `moveBlockShortcut`이 활성 선택을 먼저 확인해 있으면 `moveBlockRangeAdjacent`로, 없으면 기존 캐럿 경로로 라우팅.
- `packages/core/src/block-move-commands.ts` — `moveBlockRangeAdjacent(editor, fromBlockId, toBlockId, direction)` 신규. 기존 `moveSelectedBlocksBefore`(session bound, model tree 기반)도 재사용하지 않고 그 계약(같은 형제 배열만, `min`/`max` 인덱스)을 PM `ResolvedPos.index()`로 재현.
- `packages/core/test/block-move-commands.test.ts` — describe "활성 블록 선택 범위 이동" 신규 6건.
- `docs/product/blocknote-free-feature-inventory.md` — `UI-011`을 `VERIFIED`로 갱신.
- `docs/product/current-status.md` — "다음 진행 단계" 요약과 서사 문단에 슬라이스 9 완료 반영, Issue #38 슬라이스 10·11이 남아 있음을 명시(R2 전체 완료를 뜻하지 않음).

문서 동기화 커밋(`3755af3`)은 최초 커밋(`7e3e02b`) 이후 셀프 리뷰에서 두 결함을 발견해 `--amend`로 정정했다(push 전, 로컬 전용) — (1) prettier가 특정 문단을 재직렬화할 때 단독 `~`(한국어 관용 범위 표기)를 GFM 취소선 델리미터로 오인해 `~~`로 되쓰는 실측 결함을 발견, 그 문단들의 범위 표기를 en dash(`–`)나 명시적 나열로 교체해 회피. (2) "Issue #38에 명시된 R2 슬라이스는 전부 완료했다"는 과장 서술을 발견 — Issue #38 본문에 슬라이스 10(일반 clipboard)·슬라이스 11(3-엔진 게이트, R2 완료 판정)이 명시돼 있어 정정.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/block-move-commands.test.ts` → 13 passed(DELTA-01 7건 포함).
- `pnpm --filter @cp949/geul-core test`(전체) → 92 files/1229 passed(회귀 없음).
- `pnpm --filter @cp949/geul-core typecheck`·`pnpm --filter @cp949/geul-react typecheck` — 둘 다 통과(공개 `BlockSelection` 타입 불변, `createProductionEditor`는 core 내부 전용이라 react 영향 없음을 재확인).
- `pnpm test:e2e --project=chromium`(전체) → 141 passed(회귀 없음).
- RD-004 완료 조건 4개 실측 재대조 후 `pnpm verify` 전량(마지막 RD 완료 시 1회) — lint·format·build·escompat·typecheck·unit 213 files/2592 tests·boundaries·licenses·e2e chromium 141 전부 `PASS`(exit 0). 문서 동기화 정정 뒤 재실행에서도 통과 재확인.

## 등록한 이슈

- 완료 댓글: 사용자 확인(AskUserQuestion) — (1) Issue #38에 슬라이스 9 완료 댓글 게시(권장안), (2) `dev` push는 보류(권장안). 슬라이스 9 완료 댓글 게시: https://github.com/cp949/geul/issues/38#issuecomment-5534683559 — Issue #38 본문의 슬라이스 9 체크박스도 `[x]`로 갱신(기존 완료 슬라이스와 동일 관례). 닫지 않음(슬라이스 10·11 남음, 종료 판단 기준 미충족).
- 범위 밖 신규 이슈 등록 없음 — 가이드·pitfall 갭 없음.

## 남은 제한

- Issue #38 슬라이스 9(RD-001~RD-004)가 전부 완료됐다 — Issue #38의 다음 남은 슬라이스는 10(일반 clipboard, `IO-007` 부분)과 11(Chromium/Firefox/WebKit 3-엔진 게이트, R2 완료 판정)이다. Issue #38 자체는 후속 슬라이스가 남아 `OPEN` 유지.
- `docs/product/blocknote-free-feature-inventory.md`의 `DOC-002`·`BLK-005`·`BLK-006`·`UI-009`는 다른 슬라이스에서 이월된 `PARTIAL` 잔여를 이 슬라이스 범위 밖이라 그대로 뒀다 — R2 전체를 `VERIFIED` 일괄 판정할지는 별도 확인이 필요하다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다(사용자가 push 보류를 명시적으로 선택).

## rollback

`git revert 3755af3 1a258b7`(역순). 위험: 낮음 — 1a258b7(코드)은 core 패키지 국소 변경(2개 신규 파일 + 3개 배선 파일), 3755af3(문서)은 코드 영향 없음. 둘 다 서로 독립적이라 부분 되돌리기도 안전하다.
