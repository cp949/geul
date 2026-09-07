# Issue #156 슬라이스8 RD-001 — core self-mount SSR 크래시 방어

## 목표

`EXT-013`(SSR/Next.js 통합)의 첫 결과. `createEditor()`가 `document` 없는 순수 Node 환경에서 크래시하지 않도록 `production-editor-assembly.ts`의 자기-mount round-trip을 조건 분기한다(spec §11.2).

## 확정 커밋

- `a30c4ff` — feat(core): createEditor가 document 없는 SSR 환경에서 크래시하지 않도록 self-mount round-trip 조건 분기

## 변경한 계약과 파일

- `packages/core/src/production-editor-assembly.ts` — self-mount/unmount round-trip을 `typeof globalThis.document !== "undefined"` 조건부로 감쌌다. `document` 없으면 로드 시점 trailing paragraph 정규화가 실제 client mount 시점으로 지연된다(알려진 제약 — 공개 계약 변경 아님, `document` 있는 기존 경로는 회귀 없음).
- `packages/core/test/production-editor-ssr-smoke.test.ts`(신규) — `document` 없는 Node 환경(`// @vitest-environment node`)에서 `createEditor` 호출·`destroy`가 크래시하지 않음, 정규화 지연 characterization 총 4건.

## 재조사 결과 (spec §11.2가 요구한 "왜 원래 이 방식을 선택했는지")

self-mount는 PM `appendTransaction`이 초기 state 생성에는 실행되지 않고 Tiptap "create" 이벤트가 비동기(`setTimeout`)라, 동기적으로 발화하는 "mount" 훅을 빌려 로드 시점 정규화를 동기 실행하려는 수단이었다(`trailing-block-extension.ts:37-44` 기존 주석). `document`가 없으면 이 동기화 자체가 불가능하므로 건너뛰고, 소비자의 실제 client mount 시점에 같은 `onMount` 훅이 정규화를 적용한다 — 더 근본적인 재설계(정규화를 순수 모델 레벨 함수로 이전) 없이 최소 조건 분기로 충분하다고 판단했다.

## 검증

- RED 확인: 신규 스모크 테스트 3건이 기존 코드에서 `TypeError`로 실패(`globalThis.document.createElement` 접근 — `Cannot read properties of undefined`).
- GREEN: `pnpm --filter @cp949/geul-core test` 139 files / 1619 tests 전부 통과(기존 1615 + 신규 4).
- `tsc -p tsconfig.json --noEmit`, `tsc -p tsconfig.test.json --noEmit` clean.
- 변경 파일 대상 `eslint` clean.

## RD-001 진행 상태

RD-001의 유일한 예상 DELTA(01) 완료 — RD-001 DONE. roadmap(R4 슬라이스8, `EXT-013`)은 RD-002(react client-only 가이드 + SSR fixture)가 남아 미완료다.

## 등록한 이슈

없음.

## 게시

GitHub 게시 없음 — 슬라이스8이 아직 완료되지 않았다(RD-002 남음). `docs/agents/issue-tracker.md` "게시 승인"의 workflow 완료 예외는 슬라이스(roadmap) 전체 완료 시에만 적용한다 — Issue #156 슬라이스1~7 선례(각 슬라이스 완료 시 댓글 1건, RD 단위 개별 댓글 없음)와 동일하게 슬라이스 단위로만 게시한다.
