# Issue #38 슬라이스 6 RD-003 — 토글 저장 기반(model·core)

## 목표

roadmap-workflow RD-003: 토글 제목(`HeadingBlock.isToggleable`/`collapsed`)과 토글 목록(`ToggleListItemBlock`)을 검증된 저장 계약으로 추가하고, production editor가 `collapsed` 상태를 로드·저장하며 `collapsed: true`인 블록의 자식을 편집기 DOM에서 시각적으로 숨긴다. React 컴포넌트·사용자 커맨드는 RD-004로 이관한다(로드맵 결정 D6).

## 확정 커밋

- `0172051` — feat(model): 토글 제목·토글 목록 저장 계약 추가
- `1c12a49` — feat(core): 토글 제목·토글 목록 PM 스키마·codec·DOM 숨김 구현
- `353e1d6` — fix(core): 단계-3 결함 탐지 F1·F2 수정 — heading 토글 유실, toggleListItem UX 누락

## 변경한 계약과 파일

- `packages/model/src/types.ts`: `HeadingBlock`에 `isToggleable?`/`collapsed?` 추가, `ToggleListItemBlock` 신규 타입, `Block` 유니온 편입.
- `packages/model/src/block-kind.ts`: `NestableBlockType`에 `toggleListItem`을 `ListItemBlockType`과 별도로 직접 추가(io 직렬화 축과 재귀 검증 축 분리). 결함 탐지로 신규 `isListEntryBlockType`(`bulletListItem`·`numberedListItem`·`toggleListItem` — 편집 UX 축) 추가.
- `packages/model/src/schema.ts`: `headingBlockSchema` 필드 확장, `toggleListItemBlockSchema` 신설, `validateBlocksAt`에 heading `collapsed`/`isToggleable` 불변식 분기 추가.
- `packages/core/src/list-item-extension.ts`: `ToggleListItemExtension` 신설.
- `packages/core/src/production-editor-assembly.ts`: `HeadingExtension` attrs 확장, `ProductionToggleListItemExtension`·`ToggleCollapseVisibilityExtension` 등록.
- `packages/core/src/tiptap-to-model.ts`/`model-to-tiptap.ts`: heading·toggleListItem codec 양방향 확장.
- `packages/core/src/toggle-collapse-visibility-extension.ts`(신규): `collapsed: true`인 블록의 `blockGroup`에 `display:none` decoration.
- `packages/core/src/editor-controller.ts`: `BlockTypeSource`에 `toggleListItem`을 `divider`/`table`과 같은 자리(`BlockTypeDescriptor` 미지원 → null)로 추가 — `Block` 유니온 확장 시 `react/block-side-menu.tsx`의 비좁힘 호출이 컴파일 깨지는 것을 막는 완결성 유지.
- `packages/core/src/generic-block-commands.ts`: `setBlockType`이 heading level만 바꿀 때 `isToggleable`/`collapsed`를 캐리포워드하도록 수정(F1).
- `packages/core/src/placeholder-extension.ts`·`block-split-extension.ts`·`block-join-extension.ts`: 목록형 편집 UX 판정을 `isListItemBlockType`(io 전용)에서 `isListEntryBlockType`(편집 UX 축)으로 교체(F2).
- 테스트: `packages/model/test/document-heading-toggle.test.ts`, `document-toggle-list-item.test.ts`, `block-kind.test.ts`(확장); `packages/core/test/toggle-list-item-schema.test.ts`, `toggle-list-item-codec.test.ts`, `toggle-collapse-load-save.test.ts`, `toggle-list-item-editing-ux.test.ts`(신규), `block-type-descriptor.test.ts`·`editor-controller-heading-levels.test.ts`·`editor-controller-quote.test.ts`(확장/보정).

## 검증

- 단계-3 완료 조건 대조(메인 세션 직접 판정): `01-계획.md` 완료 조건 8개 전부 `PASS`(`IMPL-REVIEW-01.md`).
- 단계-3 결함 탐지(읽기 전용 subagent, diff `dev...feat/38-slice6-rd003-toggle-foundation`): F1(`setBlockType` heading level 변경 시 토글 상태 유실)·F2(`toggleListItem`이 목록형 편집 UX predicate에서 누락돼 placeholder 없음·Enter 탈출 불가) MAJOR 2건을 실행으로 재현. 회귀 테스트를 먼저 추가해 RED 확인(소스만 `git stash`로 되돌려 재현, 4건 실패) 후 수정해 GREEN 확인.
- `pnpm --filter @cp949/geul-model test`(296/296)·`typecheck`, `pnpm --filter @cp949/geul-core test`(969/969)·`typecheck`, `pnpm --filter @cp949/geul-io test/typecheck`(382/382, 무변경 확인용), `pnpm --filter @cp949/geul-react test/typecheck`(339/339, 무변경 확인용) — 전부 통과.
- `pnpm build`(전체 6개 패키지: model/io/core/react/consumer-fixture/demo) — 통과.
- `pnpm verify` 전량: lint·format·build·Chrome 75 escompat·typecheck(전 프로젝트)·unit 171 files/2124 tests·package boundary·license·Chromium E2E 115/115 — 통과.
- `git diff --check`, `git status --short` — 이상 없음.
- 재그룹화 4→3 커밋, `git diff <pre-squash 백업 ref> HEAD --stat` 빈 출력으로 트리 무결성 확인 후 `dev`로 ff-only 이전.

## 등록한 이슈

- 완료 댓글: https://github.com/cp949/geul/issues/38#issuecomment-5490005173 — Issue #38은 후속 RD(RD-001·002·004·005)와 슬라이스(7~11)가 남아 닫지 않음.
- 이번 작업 범위 밖 신규 이슈 등록 없음(pending 발견 1건은 `_works/roadmap/RD-004.md`에 참고 사항으로만 기록 — 등록 기준 미달, 사용자 도달 경로 없음).

## 남은 제한

- RD-004(토글 편집·생성 UX: 명령, React 접힘 트라이앵글, Slash·Turn into)와 RD-005(HTML `<details>`, GFM strict/lossy)가 남아 `BLK-004`·`BLK-010`은 상태를 바꾸지 않았다.
- `generic-block-commands.ts`의 목록↔CodeBlock 상호 변환 거절 가드(`currentIsList`/`targetIsList`)가 `toggleListItem`을 포함하지 않아, 자식 없는 `toggleListItem`은 codeBlock으로 변환이 허용된다(데이터 유실 없음, 사용자 도달 UI 없음 — RD-004에서 `SetBlockTypeDescriptor` 확장 시 함께 정리).
- Firefox·WebKit 전체 게이트는 이번 범위 밖이라 실행하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 3개를 역순으로 `dev`에서 `git revert`한다. 위험: 낮음 — `model`·`core` 내부 변경이고 공개 저장 계약 확장은 전부 optional 필드라 하위 호환을 깨지 않는다. `editor-controller.ts`의 `BlockTypeSource` 확장과 3개 core 파일의 predicate 교체(F2)까지 함께 되돌려야 `toggleListItem` 관련 코드가 남지 않는다.
