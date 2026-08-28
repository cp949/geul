# Issue #38 슬라이스 2 — placeholder와 trailing block

- 일자: 2026-08-28
- 레인: qq-workflow (자동 선택 — 예상 변경이 DELTA 1개 크기, spec §6.4가 계약 원본 소유)
- 확정 커밋: `6981150` (feat(core,react): 빈 블록 placeholder와 문서 끝 trailing paragraph 불변식을 추가한다)

## 목표

Issue #38 슬라이스 2 — 빈 블록 타입별 placeholder(`UI-009`)와 문서 끝 trailing paragraph 불변식(`UI-010`)을 spec §6.4대로 구현한다.

## 바꾼 계약과 파일

- `packages/core/src/placeholder-extension.ts` (신규) — 자체 PM 데코레이션 확장(외부 의존성 없음). 빈 paragraph는 캐럿 위치 시만 "Enter text or type '/' for commands", 빈 heading은 레벨별 "Heading N" 상시, 표 셀 제외(셀 content `inline*` 스키마 보장), 저장 JSON 무흔적.
- `packages/core/src/trailing-block-extension.ts` (신규) — 마지막 최상위 블록이 자식 없는 paragraph가 아니면 빈 paragraph 자동 추가. 편집 시점 `appendTransaction`(트리거 편집과 한 히스토리 이벤트, undo 1회 원상복원), 로드 시점 동기 `onMount` 정규화(`addToHistory:false`). tiptap 3.30.1 실측: `create` 이벤트는 setTimeout 비동기 emit이라 로드 훅으로 쓸 수 없고 `mount`가 동기다.
- `packages/core/src/editor-controller.ts` — 확장 등록, 로드 정규화 중 커밋 억제(revision 불변·onChange 미발화), `replaceDocument` 커밋 소스를 에디터 재독으로 변경.
- `packages/react/src/_editor.scss` — `[data-placeholder]::before` 표시 CSS(데코레이션·문구는 core 소유 — react에 @tiptap 의존성이 없어 이슈 본문의 "react 소유" 서술을 사실 기반 조정).
- **로드→저장 동등성 계약 변경(사용자 승인)**: trailing 정규화가 필요한 문서(표·heading·자식 딸린 paragraph로 끝남)는 로드 시 빈 paragraph가 붙어 다음 저장 JSON부터 포함된다. 기존 테스트 13곳을 "정규화 후 동등"으로 갱신, 상수 id 팩토리 테스트 3곳을 순차 팩토리로 갱신(행 방지).
- 제품 문서: `UI-009` `PARTIAL`(후속 블록 타입 placeholder는 각 타입 슬라이스가 포함), `UI-010` `VERIFIED`, current-status 다음 작업을 슬라이스 3으로 갱신.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-core test` 539/539, `pnpm --filter @cp949/geul-react test` 254/254, 두 패키지 복합 `typecheck` exit 0.
- `pnpm verify` 전량(병합 직전): 패키지 게이트 전부 통과, e2e chromium 86 passed / 1 failed — 실패는 사전 결함 Issue #131(`formatting-toolbar.spec.ts:67`, base `3c05eda` 동일 실패 실측). 이 변경이 만든 실패 0건.
- 단계-3 리뷰: 완료 조건 10개 전부 PASS, 결함 탐지(읽기 전용 subagent) 확정 결함 0건.

## 남은 제한

- e2e 게이트는 Issue #131 해소 전까지 전량 실행에서 적색 1건을 유지한다(이 작업 무관).
- 정규화가 필요한 같은 원본으로 `replaceDocument` 반복 호출 시 호출마다 trailing id 재발급·revision 증가 — 로드 포함 불변식 결정의 수용된 파생. 소비자 계약 문제로 판명되면 spec 판단 선행.

## 등록한 이슈

- Issue #136 (신규) — 사용자 제공 `createId`가 유일 id를 못 만들면 `BlockIdExtension` 무상한 재시도 루프가 에디터를 행시킨다(구현 중 실측, trailing 불변식으로 노출 빈도 증가).
- Issue #38 완료 댓글 등록(슬라이스 2 항목 완료). 이슈는 슬라이스 3~11 미착수로 열어 둠. 닫은 이슈 없음.
