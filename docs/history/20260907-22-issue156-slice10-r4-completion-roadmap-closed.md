# Issue #156 슬라이스10 — Chromium/Firefox/WebKit 전체 게이트 + R4 완료 판정, roadmap 종료

## 목표

Issue #156(R4, 확장성과 제품 통합 parity)의 마지막 슬라이스. 기존 `@core` e2e 스위트를 3-엔진(Chromium/Firefox/WebKit)에서 재실행하고, `docs/reviews/r4-extensibility-integration-parity-completion.md`를 작성해 roadmap R4 완료 조건을 판정하며, inventory/current-status를 실제 상태와 동기화한다. i18n(슬라이스11, `EXT-009`·`EXT-010`)은 사용자 지시로 계속 보류한다(2026-09-06 결정).

## 확정 커밋

- `85b02e8` — docs(product): Issue #156 슬라이스10 R4 완료 판정, inventory 13개 ID VERIFIED 갱신 (RD-002 DELTA-01, 병합 시 재그룹화로 최종 해시가 바뀔 수 있음)

## 변경한 계약과 파일

- 신규 `docs/reviews/r4-extensibility-integration-parity-completion.md` — roadmap R4 완료 조건 8개 중 `R4-03`(i18n)을 제외한 7개(`R4-01`·`R4-02`·`R4-04`~`R4-08`) 전부 `PASS`로 판정.
- `docs/product/blocknote-free-feature-inventory.md` — `DOC-004`~`010`·`DOC-013`(슬라이스1, 8개)·`EXT-001`~`005`(슬라이스2·3, 5개) 총 13개 ID를 `NOT_STARTED`→`VERIFIED`로 갱신. 슬라이스4~9는 완료 시점에 이미 갱신됐으나 슬라이스1~3은 누락돼 있었다.
- `docs/product/current-status.md` — "마지막 완료 단계"를 R3에서 R4로, "다음 진행 단계"를 R4에서 R5로 전환. "R4 실행 상태"에 슬라이스10 완료를, "바로 다음 작업"에 R4 완료·R5 대기 상태를 반영.

## 구현 중 발견·재검토

- **e2e 게이트 범위 재확인**: 슬라이스4(커스텀 UI/이모지/portal)·슬라이스5(theming)·슬라이스7(paste handler)·슬라이스8(SSR/Next.js)에 대응하는 전용 e2e spec 파일이 0개임을 실측(`npx playwright test --project=firefox --list`)으로 확인했다. 각 슬라이스는 이미 vitest/컴포넌트 테스트 근거로 완료 승인을 받았고(슬라이스7은 그릴링으로 "unit 수준으로 충분" 명시 결정), 이번 슬라이스10은 그 결정을 소급 재심사하지 않고 기존 `@core` 스위트(22개 파일·38개 시나리오)를 3엔진 재실행해 회귀만 확인했다 — `pnpm test:e2e:full` 262 passed, 0 failed, 프로덕션·테스트 코드 변경 없음(RD-001).
- **인벤토리 누락 발견**: `DOC-004`~`010`·`013`(슬라이스1)·`EXT-001`~`005`(슬라이스2·3)가 Issue 체크리스트상 완료([x])인데도 inventory에는 갱신되지 않고 `NOT_STARTED`로 남아 있었다(슬라이스4~9는 완료 시 매번 갱신했으나 1~3은 그렇지 않았다). 각 슬라이스 자체 roadmap-workflow 산출물(`_works/_completed/20260906-03-.../`, `20260906-04-.../`, `20260907-01-.../`)의 완료 조건·증거를 대조해 13개 ID를 `VERIFIED`로 갱신했다.
- **`EditorProvider` 미배선 발견**: `EXT-001`~`005`(커스텀 schema, extension/command 등록)가 core 계층에서는 완성됐지만 `packages/react`의 `EditorProvider`가 이 옵션들(`customBlocks`/`customInlineContent`/`customStyles`/`enabledBlockTypes`/`commands`/`keyboardShortcuts`)을 forwarding하지 않음을 재확인했다(슬라이스2 RD-002.md와 슬라이스3 완료 댓글이 이미 "알려진 제약"으로 기록했으나 별도 이슈로 분리되지 않은 상태였다). `EXT-008`의 `attributeOverrides`도 같은 특성이며 이미 `VERIFIED` 처리된 선례가 있어(react 미배선이 VERIFIED 판정을 막지 않는 이 저장소의 기존 관례) 이번 판정에서도 `R4-01`/`R4-02` PASS를 막지 않았다. 후속 이슈 초안을 등록해(`_works/roadmap/pending-issues/01.md`) 처음으로 별도 추적을 시작했다.
- **완료 조건 개수 정정**: Issue #156 슬라이스10 원문은 "roadmap R4 완료 조건 8개 중 EXT-009/EXT-010 관련 2개를 제외한 6개"라고 서술했으나, `docs/product/roadmap.md` R4 절 실측 결과 `EXT-009`/`EXT-010`은 단일 완료 조건(`R4-03`, "v0.54.0 기본 locale 전체와 사용자 번역 override가 검증된다") 하나에 함께 포괄돼 있어 제외 대상은 조건 1개이고 판정 대상은 7개다. 완료 판정 문서에 정확한 개수로 기록했다(완료 기준 문구 자체는 바꾸지 않음).

## 검증

- RED/GREEN: 신규 구현이 아니므로 RED 없음(판정·문서 동기화 작업) — 작성 즉시 GREEN 확인.
- `pnpm test:e2e:full`(3-엔진): 262 passed, 0 failed(RD-001).
- `pnpm verify`: exit 0 — lint/format:check/build(6/6)/check:escompat(161파일)/typecheck(10/10)/test(294f·3390t)/check:boundaries(manifest 7·public core declaration 11)/check:licenses(manifest 6·외부 package 139)/test:e2e(chromium+mobile, 188 passed) 전부 통과.
- `git diff --check`, `git status --short`: 문제 없음.

## RD-001·RD-002 진행 상태, roadmap 종료

RD-001(3-엔진 게이트) DELTA-01 완료 — 코드 변경 없음(테스트만 재실행, 회귀 0건) — **RD-001 DONE**. RD-002(완료 판정 문서+동기화) DELTA-01 완료 — **RD-002 DONE**. **RD-001·RD-002 둘 다 DONE — roadmap 전체(Issue #156 슬라이스10)도 완료.**

전체 완료 조건 6개 재대조(`_works/roadmap/roadmap.md`):

- `pnpm test:e2e:full` 전량 GREEN(RD-001) — 262 passed, 0 failed.
- R4 완료 판정 문서가 `EXT-009`/`EXT-010` 제외 7개 전부 `PASS`, 열린 `BLOCKER`/`MAJOR` 없음(RD-002) — `docs/reviews/r4-extensibility-integration-parity-completion.md` `R4-01`.
- inventory가 Issue #156 슬라이스1~10 범위 기능 ID를 실제 검증 상태로 갱신(RD-002) — 13개 ID `VERIFIED` 갱신.
- roadmap.md R4 절 i18n 캐벗 문장 재확인(RD-002) — 이미 존재, 변경 불필요.
- current-status.md가 R5 진입 상태로 갱신(RD-002).
- `pnpm verify` exit 0(RD-002).

## 등록한 이슈

- `EditorProvider`가 R4 확장성 옵션 7개를 forwarding하지 않음 — 초안 `_works/roadmap/pending-issues/01.md`, 등록 여부는 사용자 승인 대기.

## 게시

Issue #156에 슬라이스10 완료 댓글 게시, 체크리스트 슬라이스10 항목 `[x]` 갱신(roadmap-workflow 완료 게이트 통과, `docs/agents/issue-tracker.md` "게시 승인" 넷째 bullet). 위 후속 이슈 등록은 별도 사용자 확인 대상. 이슈는 닫지 않는다 — 슬라이스11(i18n, 보류 중)이 남아 있다.
