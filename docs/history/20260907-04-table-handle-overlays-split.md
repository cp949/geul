# table-handle-overlays 분리

- 레인: qq-workflow (사용자 지시 — "table-handles.tsx 라인수가 너무 길다" 그릴링 후 승인)
- 대상 이슈: 없음
- 작업 폴더: `_works/20260907-04-table-handle-overlays-split/`(gitignore, 저장소에는 남지 않음)
- 확정 커밋: `4603f72`(dev, `refactor(react): table-handles.tsx 오버레이 서브컴포넌트 분리`)

## 목표

`table-handles.tsx`(814줄, 직전 부분분리 `30aa791` 이후 남은 크기)의 렌더 오버레이를 `table-handle-overlays.tsx`로 분리해 진입점을 줄인다. 직전 이력 문서(`20260907-03-table-handles-partial-split.md`)가 "훅 재설계나 프레젠테이셔널 서브컴포넌트 추출은 중간 위험, 별도 판단 없이는 착수하지 않는다"로 남긴 후속 판단이다. 그릴링(설계 인터뷰)으로 확정한 범위: hover/재정렬/리사이즈/메뉴 4개 상태머신 재설계는 이번에도 범위 밖으로 유지하고, 프레젠테이셔널 서브컴포넌트 추출 + 순수 계산 헬퍼 이동만 하는 하이브리드안을 택했다.

## 바꾼 계약과 파일

신규 파일 1개 + 축소된 진입점 + 헬퍼 확장(순수 이동, 상태머신·이펙트 무변경):

- `table-handle-overlays.tsx`(신규, 225줄) — 행/열 재정렬 핸들, 열 리사이즈 스트립, 행/열 확장 버튼, indent/outdent 버튼, reorder guide를 전담하는 프레젠테이셔널 컴포넌트. `TableHandleMenu`와 같은 경계로, 이미 계산된 값(geometry, `reorderGuideRect`, boolean 플래그, 콜백)만 props로 받는다 — 원시 `reorderState`/`resizeState`/`menuState`는 받지 않는다.
- `table-handles-helpers.ts`(57 → 139줄) — `computeReorderGuideRect`/`computeMenuPosition` 순수 함수 추가. 원래 render 본문 IIFE를 로직 무변경으로 이동.
- `table-handles.tsx`(814 → 604줄, 25.8% 감소) — JSX를 `TableHandleOverlays` 호출로 교체. diff hunk 3개(import 블록 2개 + 파일 꼬리 1개)만 존재 — 상태머신·이펙트(hover 판정, 드래그 제스처 2건, geometry 재계산, 메뉴 유효성 감시) 구간은 diff에 나타나지 않는다.
- `table-handle-menu.test.tsx` — 402번째 줄 stale 소스 줄번호 인용(`handlePointerMove, table-handles.tsx:366-413` — 이미 없는 함수·줄)을 `handleHoverCandidateChange, table-handles.tsx:86-117`로 갱신.

`packages/react/src/index.ts`는 `TableHandleOverlays`를 재노출하지 않는 현재 상태(`TableHandleMenu`와 동일 관행) 그대로다.

누적: `table-handles.tsx`는 928줄(`30aa791` 이전) → 814줄(부분분리) → 604줄(이번), 총 34.9% 감소. 렌더 로직은 `table-handle-overlays.tsx`(225줄)로, 순수 계산은 `table-handles-helpers.ts`로 옮겨갔다.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-react test` — 38 files / 505 tests pass (이동 전후 동일 개수, `table-handles.test.tsx`(14)+`table-handle-menu.test.tsx`(29) assertion 무변경)
- `pnpm --filter @cp949/geul-react typecheck` — pass(복합 3단 스크립트, PIT-0038 준수)
- `pnpm --filter @cp949/geul-react build` — pass, `dist/table-handle-overlays.js` 정상 생성
- `pnpm exec prettier --check`(변경 파일 4개) — pass
- 단계-3 결함 탐지(읽기 전용 subagent) — 확정 결함 0건. hunk 경계 대조로 상태머신 무변경 확인, JSX/key/data-be-*/style 좌표식 문자 그대로 대조, 콜백 시그니처·매개변수 순서 대조, `reorderGuideRect≠null`이면서 `geometry===null`인 조합이 함수 계약상 불가능함을 증명(렌더 위치 이동이 회귀 아님), eslint 0건, import 순환 없음, ADR-0002 경계 위반 없음.
- 병합 직전 `pnpm verify` 전량(lint, format, build, typecheck, unit test, package boundary, license, E2E chromium 183건 — `table-handle.spec.ts` 전체 포함) — 전부 pass.

## 남은 제한

- 등록한 이슈 없음 — 순수 구조 리팩터이고 제품 동작·게이트 구멍·거짓 통과를 드러내지 않아 issue-tracker.md "등록 기준"을 통과하는 발견이 없었다.
- 계획서(`01-계획.md`) 완료조건 7의 "`table-handles.test.tsx` 21개 케이스"는 계획 작성 시점 오기였다(실측 14개) — 구현·검증에는 영향 없었고 단계-3 리뷰에서 정정 기록만 남겼다.
- `hover/재정렬/리사이즈/메뉴` 4개 상태머신의 훅 재설계는 이번에도 범위 밖이다 — `activeTableId→geometry` 공유 파생값 강결합과 드래그 타이밍 버그 이력(#15/#63/#64)을 이유로 그릴링에서 명시적으로 보류를 재확인했다. 이후 다시 다룰 때도 별도 판단이 필요하다.
- `table-handle-geometry.ts`/`table-handle-menu.tsx`(singular)와 `table-handles-types.ts`/`table-handles-constants.tsx`/`table-handles-helpers.ts`(plural) 사이의 네이밍 불일치는 이번에도 통일하지 않았다. 신규 `table-handle-overlays.tsx`는 singular(선례 `table-handle-menu.tsx`와 짝) 쪽을 택했다.
