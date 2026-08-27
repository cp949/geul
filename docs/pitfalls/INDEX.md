# 함정 목록

가이드 또는 명시적 계약이 있는데도 에이전트가 따르지 않았거나 문구를 모호하게 해석해 반복한 실수만 기록한다. 정상 구현·검증 경로는 [`docs/guides/`](../guides/INDEX.md)가 소유한다.

함정은 가이드와 별개 조건으로 선택한다 — 아래 적용 조건이 현재 작업 조건이나 리뷰에서 관측된 오해 신호와 맞을 때만 상세 함정을 읽는다.

## ACTIVE

| ID | 적용 조건 | 오해하기 쉬운 신호 | 지배 가이드·계약 |
| --- | --- | --- | --- |
| [`PIT-0011`](./PIT-0011-clamp-fixed-overlays-into-viewport.md) | 내용에 따라 fixed overlay 크기 변경 | 최초 clamp 뒤 mode 전환에서 이탈 | `G-UI-001` |
| [`PIT-0023`](./PIT-0023-editor-opening-git-commands-succeed-silently.md) | editor 입력을 요구하는 Git 명령 | exit 0이지만 의도한 편집 미적용 | `AGENTS.md`, `ff-workflow` |
| [`PIT-0027`](./PIT-0027-define-what-a-validator-accepts-not-what-it-rejects.md) | validator 뒤 관용적 skip 처리 | exit 0과 검사 대상 0건 | `G-WKS-004` |
| [`PIT-0029`](./PIT-0029-verify-pnpm-passthrough-flags-reach-the-real-command.md) | pnpm script에 임시 flag 전달 | 명령 통과, flag 미적용 | `G-WKS-004` |
| [`PIT-0032`](./PIT-0032-judge-typecheck-coverage-by-ownership-not-membership.md) | typecheck 커버리지를 멤버십·태스크 수로 판정 | 실행은 exit 0·태스크 수 감소, dry graph는 수 유지·command 누락 | `G-WKS-003` |
| [`PIT-0034`](./PIT-0034-verify-wall-clock-limits-separate-regression-from-load-noise.md) | 복잡도 회귀를 시간 상한만으로 게이트 | 단독 통과, 동시 실행에서만 간헐 실패 | `G-TST-004` |
| [`PIT-0035`](./PIT-0035-treat-copy-detection-scan-passes-as-partial-coverage.md) | copy-detection 스캔 결과 판독 | 0건을 사본 없음으로, 우연한 매치를 사본으로 오판 | `G-WKS-004` |
| [`PIT-0037`](./PIT-0037-strip-frontmatter-before-posting-issue-tracker-drafts.md) | 이슈 트래커 초안 파일을 `--body-file`로 게시 | `gh` 명령 exit 0·URL 정상 반환, frontmatter 노출 무신호 | `issue-tracker` |

## 승격 기준

새 `ACTIVE` 함정은 다음 조건을 모두 만족한다.

1. 지배하는 가이드 또는 명시적 계약이 이미 있다.
2. 실제 에이전트가 그 지침을 따르지 않았거나 모호하게 해석한 실수가 반복됐다.
3. 정상처럼 보이는 성공 신호 때문에 실수가 조용히 지나갈 수 있다.
4. 재발 조건과 구체적인 탐지법이 있다.

가이드가 없어 구현이 갈린 경우에는 pitfall이 아니라 가이드를 추가하거나 보강한다. 가이드 문구가 모호해서 생긴 실수는 먼저 가이드를 명확하게 고치고, 그 뒤에도 재발을 탐지할 가치가 있는 실수 패턴만 함정으로 남긴다. 한 번 관측한 가설이나 원인 미확정 사례는 승격하지 않는다. 자동화할 수 있는 규칙은 test·lint·gate가 우선 소유한다.

각 함정은 지배하는 가이드를 한 방향으로만 가리킨다(`pitfall -> guide`). 가이드와 가이드 INDEX는 함정을 역참조하지 않는다.

삭제한 pitfall ID는 재사용하지 않는다. 다음 신규 ID는 `PIT-0038`다. 과거 ID와 내용은 Git 이력이 보존한다.
