# Issue #38 슬라이스 8 RD-002 DELTA-01 — 인라인 색상 토글 명령

## 목표

roadmap-workflow RD-002(편집 명령)의 첫 DELTA. `EditorController`에 `toggleInlineTextColor`/`toggleInlineBackgroundColor`(선택 텍스트, 팔레트 값 중 하나 또는 해제) 2개 공개 명령을 추가한다. RD-002 5개 명령 중 인라인 2개만 이 DELTA의 범위 — 블록 수준 3개(`setBlockTextColor`/`setBlockBackgroundColor`/`setBlockTextAlignment`)는 DELTA-02로 남긴다.

## 확정 커밋

- `6ec24ae` — core 인라인 색상 토글 명령 추가 (Issue #38 슬라이스 8, RD-002 DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts`: `EditorController["commands"]`에 `toggleInlineTextColor(color: string | null)`/`toggleInlineBackgroundColor(color: string | null)` 추가. `runInlineColorCommand` 헬퍼 신설 — `rejectCodeBlockMark()` → `color`가 `null`이 아니면 `isCanonicalCellColor` 검증(`@cp949/geul-model` 재사용) → 빈 selection이면 `COMMAND_NOT_APPLICABLE` → `session.runDocumentCommand`로 위임. mutation은 Tiptap 코어 제네릭 chain 명령만 쓴다(`color === null`이면 `unsetMark(markName)`, 아니면 `toggleMark(markName, { color })`) — mark extension에 전용 `addCommands()`를 추가하지 않는다. RD-001이 이미 등록한 `TextColorMark`/`BackgroundColorMark` PM mark·codec은 변경 없음.
- 테스트(신규): `packages/core/test/editor-controller-inline-color.test.ts` — CodeBlock caret/교차 선택 거절 2종(`it.each`), collapsed selection `COMMAND_NOT_APPLICABLE`, 비정규 색상값(`#aabbcc`, `red`) `INVALID_COLOR` 거절(무변경), 정규 색상 적용+undo 1회, 같은 색 재호출 시 해제(진짜 토글), 명시적 `null` 해제, `textColor`/`backgroundColor` 독립 공존, undo 이력 보존.

## 검증

- TDD RED→GREEN: 신규 18개 테스트 전부 RED(`is not a function`, 타입 미존재) 확인 후 구현으로 GREEN. 계획한 설계가 첫 시도에 그대로 통과(정정 없음).
- `pnpm --filter @cp949/geul-core test`(1124/1124 — 기존 1106 + 신규 18), `pnpm --filter @cp949/geul-core typecheck` — 통과.
- `pnpm --filter @cp949/geul-model test`(337/337, 무변경 확인용), `pnpm --filter @cp949/geul-io test`(449/449, 무변경 확인용), `pnpm --filter @cp949/geul-react test`(391/391, 무변경 확인용) — 전부 통과.
- 루트 `pnpm typecheck`(전체 10 task) — 전부 통과.
- 변경 파일 `eslint` — 0 findings.
- 단일 커밋이라 재그룹화 대상 없음. `git diff <pre-squash 백업 ref> feat/38-rd002-delta01 --stat` 빈 출력으로 트리 무결성 확인 후 ff-only 병합.

## 등록한 이슈

- 완료 댓글: 게시하지 않음. RD-002(편집 명령)는 아직 미완료(5개 명령 중 2개만 구현, 완료 조건 3개 중 1개만 충족)라 보고할 완료 단위가 아니다 — RD-001과 같은 기준(DELTA 단위가 아니라 RD 단위 완료에서 게시 여부를 사용자에게 확인).
- 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- RD-002 완료 조건 1(5개 명령 전부)·조건 3(`table`/`divider`/`codeBlock` 대상 블록 명령 `COMMAND_NOT_APPLICABLE`)은 DELTA-02(`setBlockTextColor`/`setBlockBackgroundColor`/`setBlockTextAlignment`)가 담당한다.
- `getSelectionMarks()`는 여전히 속성 없는 마크 5종만 보고한다 — 인라인 색상 활성 상태 read accessor는 RD-002 결과 정의 밖(명령만)이며, RD-003이 툴바 하이라이트에 필요하면 그때 추가한다.
- React UI(RD-003)·HTML/GFM 입출력(RD-004)은 착수하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — 신규 공개 명령 2개 추가만이라 기존 명령·PM 스키마·model 계약을 바꾸지 않는다.
