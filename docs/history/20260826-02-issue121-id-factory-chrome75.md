# 2026-08-26 `defaultIdFactory`의 `crypto.randomUUID()` Chrome75/83 미지원 해소 (Issue #121)

ff-workflow(트랙 0~8, DELTA 3개, PLAN-REVIEW 2회, IMPL-REVIEW 2회)로 진행했다.

## 목표

Issue #120 트랙-6이 분리한 결함 — `defaultIdFactory`(`crypto.randomUUID()`)가 Chrome75/83 실브라우저에 없어 블록 분리·표 행/열 추가 등 편집기 핵심 동작이 즉시 `TypeError`를 던진다. `model`/`core` 3곳에 흩어진 중복 정의를 `model` 계층 공유 구현으로 정리하고 Chrome83 실브라우저 e2e로 회귀를 잡는다.

## 확정 커밋

- `a7f2e89` feat(model): Chrome75 호환 RFC4122 v4 id 생성 함수를 model 계층에 신설한다
- `d8b7f7f` feat(core): editor-controller와 block-id-extension의 중복 defaultIdFactory를 model 공유 구현으로 대체하고 회귀 테스트에 UUID v4 형식 검증을 추가한다
- `9e75ef7` feat(e2e): Chrome83 실브라우저 createId() 경로 회귀 시나리오를 추가하고 발급 id의 UUID v4 형식 검증을 포함한다
- `8390dd0` docs(guides): Chrome75 floor 미지원 Web API 자체구현 패턴 가이드(G-WKS-006)를 추가한다(트랙-8이 `dev`에 직접 커밋 — 작업 브랜치 범위 밖)

## 바꾼 계약

- **`@cp949/geul-model` 신규 공개 export** — `createRandomDocumentId()`(`packages/model/src/id-factory.ts`), `crypto.getRandomValues` 기반 RFC4122 v4 직접 구현, 신규 npm 의존성 없음.
- **`packages/model/src/create-document.ts`, `packages/core/src/editor-controller.ts`, `packages/core/src/block-id-extension.ts`** — 로컬 `crypto.randomUUID()` 정의 3곳 제거, 신규 함수로 통일. `core -> model` 기존 의존 방향 유지(신규 위반 없음).
- **`playwright.config.ts`** — `chrome83` project `testMatch`를 `block-handle.spec.ts`까지 확장(`link-toolbar.spec.ts`는 유지).
- **신규 가이드 `G-WKS-006`** — "Chrome75 floor에서 미지원인 Web API를 자체 구현으로 메운다". ADR-0009가 core-js 위임 범위 밖으로 명시한 격차의 첫 구체 사례를 일반화했다.

## 주요 파일

`packages/model/src/id-factory.ts`(신규)·`test/id-factory.test.ts`(신규)·`create-document.ts`, `packages/core/src/editor-controller.ts`·`block-id-extension.ts`·`test/default-id-factory.test.ts`(신규), `e2e/block-handle.spec.ts`, `playwright.config.ts`, `packages/react/test/mount-editor.tsx`(주석). 10파일, +169/-13.

## 검증

- `pnpm verify` 전량 exit 0(트랙-8 병합 직전 재실행) — lint(기존 `packages/io` info 4건, 신규 아님) / build / `check:escompat` 68파일 Chrome≥75 / typecheck / `vitest run` 75 Test Files·1031 Tests / `check:boundaries`(7 manifests·4 public core declarations) / `check:licenses`(6 manifests·141 packages) / `test:e2e` 82 passed(chromium).
- 재그룹화 3그룹 각 경계에서 focused 검증: G1(model) `pnpm --filter @cp949/geul-model typecheck`·`test` 108/108, G2(core) `pnpm --filter @cp949/geul-core typecheck`·`test` 403/403, G3(e2e/react) `pnpm typecheck` 전체 GREEN. 재조립 전후 트리 diff 빈 출력(무결성 확인, 2회).
- `pnpm test:e2e:chrome83`(Docker, Chrome83 실바이너리) — DELTA-03 실행 시점 실측: HEAD GREEN(2 passed) ↔ DELTA-01·02 이전 상태로 되돌리면 RED(`globalThis.crypto.randomUUID is not a function` pageerror 2건 + 블록 분리 실패). 원 결함 재현과 수정 확인을 한 쌍으로 실측.
- 트랙-6(결함 탐지, Full 3렌즈)이 MINOR 2건 발견·수정 — `default-id-factory.test.ts`와 `block-handle.spec.ts` 신규 시나리오 둘 다 원래는 발급 id의 형식·유일성을 검증하지 않았다(비어있지 않은 문자열/예외 없음만 확인). UUID v4 형식 assertion을 추가해 mutation(`weak-id`)으로 RED 재현 후 원복.

## 남은 제한

- 표 행/열 추가의 `createId()` 경로는 코드 검토(`table-grid.ts`/`table-commands.ts`가 `createId`를 매개변수로만 받아 공유 factory를 그대로 씀)로만 안전을 확인했다 — Chrome83 실기기 e2e 실측은 없다. 완료기준3("최소 1개")은 블록 분리 시나리오로 문구상 충족.
- `chrome83` project webServer의 `reuseExistingServer: !process.env.CI`가 stale preview 서버를 재사용해 거짓 통과·거짓 실패를 만들 수 있다는 것을 DELTA-03 구현 중 실측했다 — 이번 작업이 만든 오염은 아니다.

## 등록·종료한 이슈

- 종료: #121 (완료 댓글에 완료 기준 3개 대조·검증·남은 제한 기록)
- 신규 등록: #123(`chrome83` webServer `reuseExistingServer` 게이트 신뢰성), #124(`chrome83` 게이트가 표 행/열 `createId()` 경로 미검증)
