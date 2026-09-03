# Issue #38 슬라이스 8 RD-002 DELTA-02 — 블록 수준 색상·정렬 명령, RD-002 DONE

## 목표

roadmap-workflow RD-002(편집 명령)의 두 번째이자 마지막 DELTA. DELTA-01이 끝낸 인라인 명령 2개(`toggleInlineTextColor`/`toggleInlineBackgroundColor`)를 이어받아 블록 수준 명령 3개(`setBlockTextColor`/`setBlockBackgroundColor`/`setBlockTextAlignment`)를 `EditorController`에 추가한다. 이 DELTA로 RD-002 완료 조건 3개가 모두 충족돼 RD-002가 `DONE`으로 전환된다.

## 확정 커밋

- `71c7991` — core 블록 수준 색상·정렬 명령 추가 (Issue #38 슬라이스 8, RD-002 DELTA-02)

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts`: `EditorController["commands"]`에 `setBlockTextColor(blockId, color)`/`setBlockBackgroundColor(blockId, color)`/`setBlockTextAlignment(blockId, align)` 추가. 세 명령은 이 저장소 단일 블록 명령의 표준 관례(`setBlockType`/`indentBlock` 등)와 같이 명시적 `blockId` 인자를 받는다 — caret/selection 판정은 이 명령 자체가 하지 않는다. `runSetBlockTextPropCommand` 헬퍼 신설 — `findBlockPosition`으로 `blockId`의 `blockContainer` 위치를 찾아 없으면 `BLOCK_NOT_FOUND`, 콘텐츠 타입이 model `isNestableBlockType` 7종(paragraph/heading/quote/목록 4종)이 아니면(`table`/`divider`/`codeBlock`) `COMMAND_NOT_APPLICABLE`, 값 검증(`isCanonicalCellColor`/`isCanonicalCellAlign`) 실패 시 `INVALID_COLOR`/`INVALID_ALIGN`, 그 외 `session.runDocumentCommand`로 위임해 `tr.setNodeMarkup(position, undefined, {...attrs, <field>: value})`로 대상 필드만 바꾼다(기존 attrs 전체 스프레드 — 부분 attrs 전달 시 나머지가 schema default로 리셋되는 함정 회피).
- 테스트(신규): `packages/core/test/editor-controller-block-text-props.test.ts` — 정규값 적용+undo 1회, 같은 값 재호출 무변경 거절, 명시적 `null` 해제, 비정규값 `INVALID_COLOR`/`INVALID_ALIGN` 거절, 존재하지 않는 `blockId`의 `BLOCK_NOT_FOUND`, `table`/`divider`/`codeBlock` 대상 `COMMAND_NOT_APPLICABLE`, heading/quote/목록 항목 적용, 형제·자식 attrs 보존, 3필드 독립 공존.

## 검증

- TDD RED→GREEN: 신규 21개 테스트 전부 RED(`is not a function`) 확인 후 구현으로 GREEN. 계획한 설계가 첫 시도에 그대로 통과(정정 없음).
- `pnpm --filter @cp949/geul-core test`(88 files, 1145/1145 — 기존 1124 + 신규 21), `pnpm --filter @cp949/geul-core typecheck` — 통과(테스트 파일에서 `paragraphBlock`이 반환하는 넓은 `Block` 유니온을 spread 후 필드를 얹는 패턴이 타입 오류를 내 로컬 `paragraphWithProps` 헬퍼로 단일 리터럴 조립하도록 고쳤다 — 구현 코드 변경 없음).
- `pnpm --filter @cp949/geul-model test`(337/337, 무변경 확인용), `pnpm --filter @cp949/geul-io test`(449/449, 무변경 확인용), `pnpm --filter @cp949/geul-react test`(391/391, 무변경 확인용) — 전부 통과.
- 루트 `pnpm typecheck`(전체 10 task) — 전부 통과. `EditorController["commands"]` 확장이 `packages/react` 소비 표면에 파급이 없음을 확인.
- 변경 파일 `eslint` — 0 findings.
- 단일 커밋이라 재그룹화 대상 없음. 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합.
- RD-002 완료 재대조(roadmap-workflow "RD 완료와 roadmap 종료"): 완료 조건 3개 전부 충족 확인 — 조건 1(5개 명령 원자성·undo)·조건 3(table/divider/codeBlock 거절)을 이 DELTA가, 조건 2(CodeBlock mark 거절)를 DELTA-01이 충족. 근거는 `RD-002.md`.

## 등록한 이슈

- 완료 댓글: 사용자에게 RD-002 완료 보고 게시 여부를 물어 게시를 지시받았다. RD-002(DELTA-01+02 통합 요약) 완료 댓글 게시: https://github.com/cp949/geul/issues/38#issuecomment-5530854800 — Issue #38은 후속 RD-003·RD-004와 슬라이스가 다수 남아 `OPEN` 유지, 닫지 않음.
- 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- `blockSelection`(다중 블록 선택, spec §5.3 UI-004) 범위에 걸친 일괄 적용은 이 DELTA 범위 밖이다 — 세 명령 모두 단일 `blockId` 대상만 받는다. RD-003이 UI에서 여러 블록에 반복 호출하는 방식을 그때 결정한다.
- React UI(RD-003)·HTML/GFM 입출력(RD-004)은 착수하지 않았다. `INL-008`~`INL-011`은 사용자 도달 경로(UI)가 아직 없어 이 RD만으로는 기능 인벤토리 상태를 바꾸지 않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — 신규 공개 명령 3개 추가만이라 기존 명령·PM 스키마·model 계약을 바꾸지 않는다.
