# table-handles.tsx 부분 분리(타입·상수·순수 헬퍼)

- 레인: qq-workflow (사용자 지시 — "가장 긴 소스코드 3개" 검토 후 분리 승인)
- 대상 이슈: 없음
- 작업 폴더: `_works/20260907-03-table-handles-partial-split/`(gitignore, 저장소에는 남지 않음)
- 확정 커밋: `30aa791`(dev, `refactor(react): table-handles.tsx 부분 분리(타입·상수·순수 헬퍼)`)

## 목표

`packages/react/src/table-handles.tsx`(928줄)에서 안전하게(순수 이동만으로) 뽑아낼 수 있는 타입·상수·순수 헬퍼를 분리한다. 928줄 중 756줄(81%)이 `TableHandles` 컴포넌트 본문 하나이고 hover/재정렬/리사이즈/메뉴 네 책임이 `activeTableId→geometry` 공유 파생 상태로 강결합돼 있어 `import-markdown.ts`/`block-side-menu.tsx`류의 전면 분리 대상이 아니다 — 이번은 부분 분리로 범위를 한정했다.

## 바꾼 계약과 파일

신규 파일 3개 + 축소된 진입점(순수 이동, 컴포넌트 본문 무변경):

- `table-handles-types.ts` — `ReorderKind`/`ReorderState`/`HandleMenuState`/`ResizeState`
- `table-handles-constants.tsx` — 라벨 6개, JSX 아이콘 5개, 클래스명 3개, `HANDLE_HOVER_MARGIN`, dismiss/hover selector 상수 2개(JSX 포함이라 `.tsx`)
- `table-handles-helpers.ts` — `readColumnStyleWidth`/`setColumnStyleWidth`/`computeReorderTargetIndex`/`clampWidth`(순수 DOM·좌표 함수)
- `table-handles.tsx` — 928줄 → 814줄(12.3% 감소). `TableHandles`(유일한 export) 컴포넌트 본문(756줄)은 이동 전후 byte-identical(md5 대조 확인).

`packages/react/src/index.ts`는 `TableHandles`를 재노출하지 않는 현재 상태 그대로다. `computeReorderTargetIndex`/`clampWidth`는 각각 `table-handle-geometry.ts`/`@cp949/geul-core`를 기존과 동일하게 참조한다. `media-resize-handles.tsx`의 동일 이름 `ResizeState`는 무관한 별개 구현이라 손대지 않았다.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-react test` — 36 files / 505 tests pass
- `pnpm --filter @cp949/geul-react typecheck` — pass(복합 3단 스크립트, PIT-0038 준수)
- `pnpm --filter @cp949/geul-react build` — pass
- `pnpm exec prettier --check`(신규 3개 파일) — pass(포맷 위반 없음, 직전 block-side-menu-split 작업의 교훈을 반영해 구현 subagent가 커밋 전 직접 확인)
- 단계-3 결함 탐지(읽기 전용 subagent) — 확정 결함 0건. 컴포넌트 본문 무변경(diff exit 0), 순환 import 없음, 심볼 중복·누락 없음, `.tsx` 확장자 필요성, `media-resize-handles.tsx` 무관, ADR-0002 준수를 전수 확인. 참고(결함 아님): 테스트 파일 2곳의 주석이 언급하는 절대 줄번호가 파일 축소로 stale해졌으나 등록 기준 미충족으로 처리하지 않음.
- 병합 직전 `pnpm verify` 전량(lint, format, 전 패키지 build/typecheck, unit test, package boundary, license, E2E chromium 183건 — `table-handle.spec.ts` 포함) — 전부 pass. 이번엔 `set -o pipefail`을 처음부터 적용해 종료 코드를 신뢰할 수 있는 상태로 확인했다(직전 작업에서 `tee` 파이프가 실패를 가린 사고 재발 방지).

## 남은 제한

- 등록한 이슈 없음 — 순수 구조 리팩터이고 제품 동작·게이트 구멍·거짓 통과를 드러내지 않아 issue-tracker.md "등록 기준"을 통과하는 발견이 없었다.
- `TableHandles` 컴포넌트 본문(hover/재정렬/리사이즈/메뉴 상태 머신)의 훅 재설계나 프레젠테이셔널 서브컴포넌트 추출은 이번 범위에서 하지 않았다 — 검토 리포트가 "중간 위험"으로 분류했고, 인지 부하 감소 대비 비용이 커 별도 판단 없이는 착수하지 않는다.
- 테스트 파일(`table-handle-menu.test.tsx`/`table-handles.test.tsx`)의 stale 줄번호 주석은 정리하지 않았다 — 후속에서 그 파일을 만질 일이 있으면 같이 정리하는 정도로 충분하다고 판단한다.

## 3개 파일 분리 작업 종합

"가장 긴 소스코드 3개"(2026-09-07 검토) 분리를 모두 완료했다.

| 파일 | 분리 전 | 분리 후 진입점 | 신규 파일 | 확정 커밋 |
|---|---|---|---|---|
| `import-markdown.ts` | 854줄 | 111줄 | 7개 | `b1cbe53` |
| `block-side-menu.tsx` | 919줄 | 449줄 | 4개 | `3b58f97` |
| `table-handles.tsx` | 928줄 | 814줄(부분 분리) | 3개 | `30aa791` |

`import-markdown-split` 작업 중 동시에 저장소를 쓰던 다른 세션이 작업 브랜치에 실수로 병합 커밋을 남긴 사고가 있었다 — 사용자 확인 후 데이터 손실 없이 복구했다. 자세한 내용은 `docs/history/20260907-01-import-markdown-split.md`를 참고한다.
