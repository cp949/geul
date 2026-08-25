# 20260825-14 TableCellSelection.mergeable을 cellIds.length에서 파생시킴(#24)

- 레인: qq-workflow (단계 1~4)
- 대상 이슈: #24(종료)
- 작업 브랜치: `refactor/24-table-cell-selection-mergeable-derive`(`dev` ff-only 이전 후 삭제)

## 목표

`TableCellSelection.mergeable: boolean`이 `cellIds.length > 1`에서 파생 가능한 값인데도 `editor-controller.ts`(core)와 `table-selection-toolbar.tsx`(react) 두 파일에 별도 필드로 복제돼 있던 중복을 제거한다. 병합 가능 판정 로직이 바뀔 때(예: 잠긴 셀 제외) 새 생성 지점이 `mergeable`을 `cellIds`와 다르게 설정하면 툴바가 병합 버튼을 잘못 보여주거나 숨길 위험이 있었다.

## 확정 커밋 해시

| 해시 | 제목 |
| --- | --- |
| `4fe1926` | refactor(core,react): TableCellSelection.mergeable을 cellIds.length에서 파생시킨다 |
| `bdace19` | docs(react): mergeable 필드 제거 후 남은 stale 주석을 정정한다 |

작업 브랜치 커밋 2개 — 구현(4fe1926)과 단계-3 결함 탐지 후 발견한 stale 주석 정정(bdace19)이 상쇄 관계가 아니어서 그대로 재조립했다.

## 바꾼 계약과 파일

`TableCellSelection`(core 공개 타입)에서 `mergeable` 필드 제거 — 필드 축소라 ADR-0002("core 공개 declaration에 Tiptap/ProseMirror 타입 비노출")를 위반하지 않는다.

- `packages/core/src/editor-controller.ts`(-6/+4) — `TableCellSelection` 타입과 `getTableCellSelection()`의 두 반환 지점에서 `mergeable` 제거, 주석 정정.
- `packages/react/src/table-selection-toolbar.tsx`(-2/+1) — `ToolbarState`에서 `mergeable` 제거, 병합 버튼 렌더 조건을 `toolbarState.cellIds.length > 1`로 직접 파생.
- `packages/core/test/editor-controller-table.test.ts`(-4) — `mergeable` fixture 필드 제거.
- `packages/react/test/table-selection-toolbar.test.tsx`(-4/+2) — `mergeable` fixture 필드 제거, stale 주석 2곳 정정.

파일 4개(`+9/-20`, 단계-3 정정 커밋 포함 총 `+11/-22`).

## 실행한 검증과 결과

`pnpm verify` 전량 2회 모두 통과 — unit 1015 passed(69 files), e2e 116 passed(chromium/firefox/webkit, 39.7s), `check:boundaries`(7 manifests, 4 public core declarations), license 게이트 통과. 재그룹화 그룹 경계(구현 / 주석 정정)마다 `@cp949/geul-core`·`@cp949/geul-react` typecheck 재확인.

```
pnpm --filter @cp949/geul-core test      400 passed(22 files)
pnpm --filter @cp949/geul-react test     191 passed(16 files)
pnpm build / pnpm --filter consumer-fixture typecheck   통과
```

단계-3 결함 탐지(읽기 전용 subagent 1개) — G-WKS-001(패키지 경계), ADR-0002, AGENTS.md 아키텍처 불변식, ACTIVE pitfall 7건(PIT-0011·0023·0027·0029·0032·0034·0035)을 diff와 대조, 발견 없음. 파생값 불일치(`mergeable`이 실제로 `cellIds.length > 1`과 다른 경로) 없음을 확인.

## 남은 제한

없음. 관찰 가능한 동작 변경이 없는 순수 중복 제거였다.

## 등록한 이슈와 가이드

- 신규 이슈 등록 없음.
- 완료 댓글 1건 등록 — [#24](https://github.com/cp949/geul/issues/24#issuecomment-5407773674). 종료.
- 신규 가이드·함정 등록 없음(적용 계약 위반·guide gap 없음).
