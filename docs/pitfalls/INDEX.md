# 함정 목록

가이드나 정상적으로 보이는 실행이 조용히 잘못된 결과를 내는 반복 실패만 기록한다. 정상 구현 절차는 [`docs/guides/`](../guides/INDEX.md)가 소유한다.

계획할 때 먼저 가이드 INDEX에서 정상 경로를 선택한다. 아래 적용 조건이 현재 변경과 맞을 때만 상세 함정을 읽는다.

## ACTIVE

| ID | 적용 조건 | 오해하기 쉬운 신호 | 정상 가이드 |
| --- | --- | --- | --- |
| [`PIT-0006`](./PIT-0006-build-before-distribution-verification.md) | source 변경 뒤 배포 소비 검증 | stale `dist`를 검사해 통과·오진 | `G-WKS-002` |
| [`PIT-0008`](./PIT-0008-avoid-object-narrowing-across-closures.md) | callback에서 찾은 ProseMirror node 사용 | test 통과, `tsc` narrowing 실패 | `G-EDT-001` |
| [`PIT-0009`](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md) | selection 기반 overlay의 Escape 닫기 | 단독 통과, 병렬에서 재오픈 | `G-TST-001`, `G-UI-001` |
| [`PIT-0011`](./PIT-0011-clamp-fixed-overlays-into-viewport.md) | 내용에 따라 fixed overlay 크기 변경 | 최초 clamp 뒤 mode 전환에서 이탈 | `G-UI-001` |
| [`PIT-0012`](./PIT-0012-synthesize-paste-events-without-clipboardeventinit.md) | E2E paste event 합성 | Chromium 통과, 다른 engine의 data 소실 | `G-TST-001` |
| [`PIT-0014`](./PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md) | contenteditable selector를 fake DOM에서 사용 | IDL 값은 있지만 selector가 찾지 못함 | `G-TST-001` |
| [`PIT-0015`](./PIT-0015-separate-tsconfig-for-composite-package-tests.md) | package test config가 dependency type import | verify 통과, clean typecheck 실패 | `G-WKS-003` |
| [`PIT-0019`](./PIT-0019-anchor-suppression-keys-to-stable-ids.md) | stable-key DOM 재정렬 뒤 click 억제 | 이동 전 index가 이동 후 handler와 불일치 | `G-UI-002` |
| [`PIT-0023`](./PIT-0023-editor-opening-git-commands-succeed-silently.md) | editor 입력을 요구하는 Git 명령 | exit 0이지만 의도한 편집 미적용 | `ff-workflow` |
| [`PIT-0027`](./PIT-0027-define-what-a-validator-accepts-not-what-it-rejects.md) | validator 뒤 관용적 skip 처리 | exit 0과 검사 대상 0건 | `G-WKS-004` |
| [`PIT-0028`](./PIT-0028-scope-shared-teardown-hooks-to-run-per-file.md) | 공유 teardown과 Vitest isolation 변경 | 기본 통과, no-isolate 반복 실패 | `G-TST-003` |
| [`PIT-0029`](./PIT-0029-verify-pnpm-passthrough-flags-reach-the-real-command.md) | pnpm script에 임시 flag 전달 | 명령 통과, flag 미적용 | `G-WKS-004` |
| [`PIT-0031`](./PIT-0031-pair-doc-identity-checks-with-doc-changed-for-filter-rejection.md) | document reference로 filter 거절 판별 | 정상 selection transaction을 거절로 오판 | `G-EDT-001` |
| [`PIT-0032`](./PIT-0032-judge-typecheck-coverage-by-ownership-not-membership.md) | typecheck 커버리지를 멤버십·태스크 수로 판정 | 실행은 exit 0·태스크 수 감소, dry graph는 수 유지·command 누락 | `G-WKS-003` |
| [`PIT-0034`](./PIT-0034-verify-wall-clock-limits-separate-regression-from-load-noise.md) | 복잡도 회귀를 시간 상한만으로 게이트 | 단독 통과, 동시 실행에서만 간헐 실패 | `G-TST-004` |
| [`PIT-0035`](./PIT-0035-treat-copy-detection-scan-passes-as-partial-coverage.md) | copy-detection 스캔 결과 판독 | 0건을 사본 없음으로, 우연한 매치를 사본으로 오판 | `G-WKS-004` |

## 승격 기준

새 `ACTIVE` 함정은 다음 조건을 모두 만족한다.

1. 적용할 가이드 또는 명시적 계약이 이미 있다.
2. 정상적으로 보이는 실행이 잘못된 결과나 조용한 성공을 만든다.
3. 같은 원인으로 다른 작업에서도 재발할 수 있다.
4. 구체적인 회피와 탐지법이 있다.

가이드가 없어 구현이 갈린 경우에는 pitfall 대신 가이드를 추가하거나 보강한다. 자동화할 수 있는 규칙은 test·lint·gate가 우선 소유한다.

삭제한 pitfall ID는 재사용하지 않는다. 다음 신규 ID는 `PIT-0037`다. 과거 ID와 내용은 Git 이력이 보존한다.
