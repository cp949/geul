# Issue #156 슬라이스3 RD-001 DELTA-01 — `commands` 등록 + `runCustomCommand` 호출 경로

## 목표

roadmap-workflow RD-001(`commands` 등록, controller 배선)의 유일한 DELTA. 소비자가 `CreateEditorOptions.commands`로 커스텀 명령을 등록하고 `EditorController.runCustomCommand(name, ...args)`로 호출할 수 있게 한다(`EXT-005`, spec §5).

착수 전 그릴링 결정(`_works/roadmap/roadmap.md` "결정"): RD-001(`commands`)/RD-002(`keyboardShortcuts`) 분리, `keyboardShortcuts` 키 충돌 정책(소비자 우선 + `console.warn`, RD-002 몫). RD-001 자체는 미결 정책이 없어 즉시 착수했다.

## 확정 커밋

- `e2d4920` — feat(core): 커스텀 command 등록(EXT-005) 지원

## 변경한 계약과 파일

- `packages/core/src/editor-controller-types.ts` — `CreateEditorOptions.commands?: Record<string, (editor: EditorController, ...args: unknown[]) => Result<void, EditorError>>` 신설. `EditorController.runCustomCommand(name: string, ...args: unknown[]): Result<void, EditorError>` 신설.
- `packages/core/src/editor-controller.ts` — `createEditor()`에서 `options.commands`를 `controllerFacade`(`deferred-controller-facade.ts`)로 partial-apply해 내부 조회 테이블(`customCommandFns`, 비공개)을 만들고, `runCustomCommand`가 이름을 찾아 실행하거나 `commandNotApplicable(name)`(`production-editor-session.ts`, 기존 헬퍼 재사용)로 거절한다.
- `packages/core/test/editor-controller-custom-commands.test.ts` — 신규 테스트 6건.

## 발견(계획에 없던 typecheck 마찰, 착수 중 즉시 해소)

계획 초안(`RD-001-DELTA-01.md` "## 계획")은 `EditorController.customCommands: Record<string, Fn>`을 직접 노출하는 안이었다(RD-001.md가 "정확한 접근 경로는 DELTA-01에서 확정"으로 열어 둔 지점). typecheck에서 `noUncheckedIndexedAccess`(`tsconfig.base.json`) 아래 모든 `customCommands.<name>()` 호출부가 "possibly undefined"로 거절됨을 확인 — 실제 소비자도 동일한 마찰을 겪는다. `Record` 직접 노출을 접고 `runCustomCommand(name, ...args)` 메서드로 전환해 미등록 이름을 `COMMAND_NOT_APPLICABLE`(기존 에러 코드 재사용)로 정상 처리하도록 설계를 그 자리에서 수정했다(테스트 파일도 함께 갱신). RD-001.md/roadmap.md의 완료 조건 문구("이름 충돌 없이 동작", "Result 계약 만족")는 이 전환으로도 그대로 충족된다 — RD 수준 결정 재변경 아님.

## 검증

- RED: `customCommands`/`runCustomCommand` 미구현 상태에서 신규 테스트 5건(초안) 전부 실패(`TypeError: Cannot read properties of undefined`, `AssertionError`) 확인.
- 최소 구현 후 GREEN: 신규 테스트 6건(설계 전환으로 1건 추가) 전부 통과.
- `pnpm --filter @cp949/geul-core typecheck` 0건(전환 전 5건 → 전환 후 0건).
- `pnpm --filter @cp949/geul-core test` 132 파일·1585 테스트 전부 통과(이 작업에서 처음 건드리는 패키지라 전체 1회 실행, 회귀 없음).
- `pnpm exec prettier --check`/`eslint`(변경 3파일) 0 문제(prettier 1건 자동 포맷 후 재확인 통과).
- 재그룹화: 백업 ref(`refs/backup/feat/156-slice3-custom-commands-pre-squash`, `-tip`) 생성 → 단일 커밋 재조립 → 트리 대조 2회(4단계·6단계) 전부 빈 출력 → `dev` ff-only 병합 → 브랜치·백업 ref 정리 완료.

## RD-001 완료 조건 재대조 (마지막 DELTA)

- 등록된 command가 기존 명령과 이름 충돌 없이 동작한다 — PASS. 증거: "runCustomCommand와 commands가 같은 이름을 써도 서로 독립적으로 동작한다" 테스트.
- 등록된 command가 `Result<T,EditorError>` 계약을 만족한다 — PASS. 증거: "등록된 command를 호출하면 그 함수가 반환한 Result를 그대로 돌려준다" 테스트(ok:true/ok:false 양쪽).
- `pnpm --filter @cp949/geul-core test` 통과 — PASS. 증거: 위 검증(1585 passed).

3개 전부 충족 — RD-001 `DONE` 전환(`_works/roadmap/RD-001.md`).

## 등록한 이슈

없음.

## 남은 위험

- RD-002(`keyboardShortcuts` 등록)가 아직 `READY`(미착수)다 — 슬라이스3(`EXT-005`) 전체는 RD-002까지 완료해야 끝난다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — 슬라이스1·슬라이스2 완료 댓글 선례(2026-09-06)와 동일 기준으로, 슬라이스 하나(이 경우 슬라이스3)의 모든 RD가 `DONE`일 때만 게시한다. RD-002 완료 후 슬라이스3 통합 댓글 1건으로 게시할 예정.
- `runCustomCommand`에 등록한 함수가 예외를 던지면(반환이 아니라 throw) 그대로 전파된다 — 기존 `commands.*`도 동일 계약이라 이 DELTA가 새로 만든 위험은 아니지만 명시 테스트는 없다.

## rollback

`git revert e2d4920`. 위험: 낮음 — `CreateEditorOptions.commands`/`EditorController.runCustomCommand` 둘 다 신규 optional 필드/메서드라 기존 호출부에 영향 없다(전체 회귀 스위트로 확인). 되돌리면 이 API 자체가 사라진다.
