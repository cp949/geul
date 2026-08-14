# R0 프로젝트 기반 완료 판정

## 1. 문서 성격

이 문서는 R0 구현 종료 후 코드, 테스트, commit과 제품 문서를 다시 대조해 2026-08-14에 작성한 소급 완료 기록이다. 당시의 개별 리뷰 회차를 재구성하지 않고, 입증 가능한 과거 근거와 현재 재검증을 분리한 `R0-RETRO-01` 기준선만 기록한다.

## 2. 승인된 완료 체크리스트

다음 기준은 승인된 MVP 설계, R0 제품 범위와 로드맵 완료 조건을 대조해 고정했다. 소급 작성 과정에서 기준을 추가, 삭제하거나 약화하지 않았다.

| ID | 완료 기준 |
| --- | --- |
| `AC-01` | `pnpm verify`가 fresh checkout 조건에서 성공한다. |
| `AC-02` | model, io, core가 React와 DOM 전역 없이 import된다. |
| `AC-03` | 독자 JSON decoder가 잘못된 문서와 잘못된 표 격자를 구조화된 오류로 거부한다. |
| `AC-04` | 지원 문서의 JSON→HTML→JSON이 ID, mark, 표 병합, header, width, color를 보존한다. |
| `AC-05` | GFM strict는 모든 손실을 원자적으로 거부하고 lossy는 위치가 포함된 warning을 반환한다. |
| `AC-06` | 위험 HTML이 script, event handler, unsafe URL, 임의 style을 남기지 않는다. |
| `AC-07` | core 공개 declaration에 Tiptap/ProseMirror 타입이 노출되지 않는다. |
| `AC-08` | 소비자 fixture가 빌드 산출물과 package exports만 사용해 typecheck된다. |
| `AC-09` | demo에서 문단/H1-H3 문서를 편집하고 JSON/HTML/GFM 저장·복원 흐름을 실행할 수 있다. |
| `AC-10` | 표 포함 문서는 model/io에서는 처리되며 R0 editor에서는 부분 변경 없이 명시적으로 거절된다. |

## 3. 계약 변경 이력

없음. 소급 작성 과정에서 완료 기준을 추가, 삭제하거나 약화하지 않았다.

## 4. 판정 회차 R0-RETRO-01

- 판정 시점: 2026-08-14 19:20 KST
- 대상 branch: `main`
- 대상 HEAD: `c7f0b23`
- 제품 코드와 테스트: HEAD 대비 변경 없음
- 작업공간: 기존 `AGENTS.md`, `README.md`, `docs/product/current-status.md` 변경과 이번 소급 문서가 존재하는 dirty 상태
- 종합 판정: `PASS`

### 4.1 항목별 판정

| ID | 판정 | 과거 근거 | 현재 재검증 |
| --- | --- | --- | --- |
| `AC-01` | `PASS` | `49fed67`이 build 선행, 배포·브라우저 게이트와 최종 리뷰 수정을 함께 고정했다. | `pnpm verify` exit 0. lint, build, typecheck, 176개 unit/integration test, package boundary, license, Chromium E2E 4개가 통과했다. |
| `AC-02` | `PASS` | `1cfb626`이 model/io의 DOM 없는 compiler fixture와 workspace 의존 경계를 추가했고 `49fed67`이 배포 소비 검증을 추가했다. | DOM 전역이 없는 Node에서 model/io/core `dist/index.js` 동시 import 성공. package boundary와 consumer fixture typecheck 통과. |
| `AC-03` | `PASS` | `8bafbb8`이 독자 문서 decoder, 표 논리 격자와 의미 검증 순서를 하나의 model 계약으로 고정했다. | model test 49개 통과. `document.test.ts`, `table-grid-validation.test.ts`, property test가 구조화된 오류와 격자 불변식을 검증한다. |
| `AC-04` | `PASS` | `1b2c23e`이 HTML round-trip을 추가했고 `49fed67`이 비정렬 기준 셀, 교차 header, mark와 문자열 불변식을 보강했다. | io test 53개와 Chromium의 reversed-anchor/header metadata 시나리오 통과. `html-round-trip.test.ts`가 ID, mark, 병합, header, width, color를 검증한다. |
| `AC-05` | `PASS` | `a23cfe8`이 strict/lossy export, downgrade, reference 복원과 손실 위치 계약을 고정했다. | `markdown-loss.test.ts`와 `markdown-round-trip.test.ts`를 포함한 io test 통과. Chromium table 시나리오에서 strict 실패와 lossy warning을 확인했다. |
| `AC-06` | `PASS` | `1b2c23e`이 sanitize를 도입했고 `49fed67`이 raw warning/sanitized 의미 경계와 comment 회귀를 보강했다. | `html-security.test.ts`와 위험 HTML Chromium 시나리오 통과. |
| `AC-07` | `PASS` | `3990396`이 독자 core API를 추가했고 `49fed67`이 배포 경계 검사를 연결했다. | `public-types.test.ts`와 `check-package-boundaries.mjs` 통과. 3개의 도달 가능한 core 공개 declaration에서 Tiptap/ProseMirror 누수가 없음을 확인했다. |
| `AC-08` | `PASS` | `49fed67`이 build 선행과 `fixtures/consumer` 검증을 함께 고정했다. | `pnpm verify`의 build 후 `consumer-fixture` typecheck 통과. |
| `AC-09` | `PASS` | `b269330`이 React 어댑터와 demo를 추가했고 `49fed67`이 브라우저 저장·복원 흐름을 완성했다. | Chromium `edits and restores JSON, HTML and markdown` 시나리오 통과. |
| `AC-10` | `PASS` | `8bafbb8`과 IO 구현이 표 모델·변환을 제공했고 `3990396`이 R0 editor의 원자적 표 거절을 구현했다. `49fed67`이 visible browser flow를 추가했다. | core의 `atomically rejects table documents in R0`와 Chromium의 merged-table 거절 시나리오 통과. 입력 HTML과 기존 editor 내용이 보존되고 `EDITOR_FEATURE_UNAVAILABLE`이 보고됐다. |

### 4.2 현재 실행 증거

| 명령 | 결과 |
| --- | --- |
| `pnpm --filter @cp949/geul-model test` | exit 0, test file 3개·test 49개 통과 |
| `pnpm --filter @cp949/geul-io test` | exit 0, test file 4개·test 53개 통과 |
| `pnpm --filter @cp949/geul-core test` | exit 0, test file 3개·test 57개 통과 |
| `pnpm --filter @cp949/geul-react typecheck` | exit 0 |
| DOM 없는 Node에서 model/io/core dist import | exit 0 |
| `pnpm verify` | exit 0, test file 12개·test 176개, boundary 7 manifest·3 declaration, 외부 production package 139개, Chromium E2E 4개 통과 |

테스트 개수는 이 판정 회차의 실행 증거이며 장기 완료 계약이 아니다.

## 5. 결함과 남은 범위

- 열린 `BLOCKER`: 없음
- 열린 `MAJOR`: 없음
- R0 완료를 막는 `MINOR`: 없음
- 공개 배포 전 프로젝트 자체 라이선스 선택은 [GitHub Issue #2](https://github.com/cp949/geul/issues/2)에 유예 작업으로 기록했다.
- R1 이후 이미 승인된 기능은 inventory와 roadmap이 소유하므로 별도 Issue로 중복 등록하지 않았다.

## 6. 최종 결론

R0의 열 개 필수 항목은 `R0-RETRO-01`에서 모두 `PASS`다. 현재 전체 게이트가 통과했고 열린 `BLOCKER` 또는 `MAJOR`가 없으므로 R0는 완료 상태를 유지한다. 다음 제품 작업은 `docs/product/current-status.md`가 지정한 R1 구현 계획 Issue 작성이다.
