# Issue #38 슬라이스 9 RD-001 DELTA-01 — 블록 타입 변환 키보드 단축키 12개

## 목표

roadmap-workflow RD-001의 유일한 DELTA. 캐럿이 속한 블록을 `Mod-Alt-N`/`Mod-Alt-q`/`Mod-Shift-6~9` 12개 단축키로 문단·제목 1-6·인용문·목록 4종(글머리·번호·체크·토글)으로 변환한다. codeBlock·divider·table은 대상이 아니다.

## 확정 커밋

- `0cbd0e0` — 블록 타입 변환 키보드 단축키 12개 추가 (Issue #38 슬라이스 9, RD-001 DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/block-type-commands.ts`(신규) — `setBlockTypeCommand(editor, blockId, descriptor)`. `EditorController.commands.setBlockType`은 session 생성 후에만 존재해 키보드 shortcut 확장(`this.editor`만 가짐)에서 호출할 수 없다는 제약을 readiness probe에서 발견 — `indent-commands.ts`/`check-list-item-commands.ts`와 같은 저수준 `(editor, blockId) => Result` command 계층을 신설했다.
- `packages/core/src/block-type-keyboard-extension.ts`(신규) — `BlockTypeKeyboardExtension`, `setBlockTypeShortcut`(표 셀 가드 + `nearestBlockContainerId` 라우팅).
- `packages/core/src/block-position.ts` — `nearestBlockContainerId` 공유 추출(`indent-keyboard-extension.ts`와 공유).
- `packages/core/src/indent-keyboard-extension.ts` — 위 공유 추출에 따른 import 교체(동작 변경 없음).
- `packages/core/src/production-editor-assembly.ts` — 새 확장 등록.
- `packages/core/test/block-type-keyboard-extension.test.ts`(신규) — core 유닛 테스트 28건.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/block-type-keyboard-extension.test.ts` → 28 passed.
- `pnpm --filter @cp949/geul-core typecheck`·`test`(전체 89 files/1173 tests) — 통과, 회귀 없음.
- 메인 세션 셀프 리뷰에서 실제 keydown 커버리지 공백(heading level 2~5가 문자열 키 자체를 검증하지 않음) 1건 발견 즉시 수정.
- ADR-0007(증명 계층 소유권) 기준 Playwright 미자격 판정(readiness probe) — 순수 keydown → 모델 상태 변경, `IndentKeyboardExtension`의 Tab/Shift-Tab 직접 선례(대응 e2e 0개)와 동형.

## 등록한 이슈

- 완료 댓글: 슬라이스 9 전체(RD-001~004) 완료 시점까지 보류(사용자 결정, 이 세션의 마지막 커밋에서 게시 — `20260904-17-issue38-slice9-rd004-delta02-active-selection-move-rd004-done.md` 참고).

## 남은 제한

- RD-002~004는 이 DELTA와 독립이라 readiness 변화 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 0cbd0e0`. 위험: 낮음 — 신규 파일 2개 추가 + 공유 헬퍼 추출 1건, 기존 동작 변경 없음.
