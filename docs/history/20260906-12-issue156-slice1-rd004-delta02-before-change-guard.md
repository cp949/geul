# Issue #156 슬라이스1 RD-004 DELTA-02 — onBeforeChange 다중 등록 + revision guard 편입(RD-004 완료)

## 목표

roadmap-workflow RD-004(lifecycle·변경전 훅 이벤트, `DOC-009`/`DOC-010`)의 두 번째이자 마지막 DELTA. `CreateEditorOptions`에 `onBeforeChange?: (context: { changes: DocumentChangeEvent }) => boolean | void`를 추가하고, 기존 내부 `canApplyDocumentChange`(revision overflow 가드)를 이 훅과 AND 결합·fail-fast로 평가하는 단일 목록으로 합친다(spec §3.3). 이 DELTA 완료로 RD-004가 `DONE`이 된다.

## 확정 커밋

- `b4e3120` — feat(core): onBeforeChange 다중 등록 + revision guard 편입 (RD-004 완료)

## 변경한 계약과 파일

- `packages/core/src/revision-guard-extension.ts` — `canApplyDocumentChange` 시그니처를 `(transaction: Transaction) => boolean`으로 확장.
- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션의 `canApplyDocumentChange`를 `(transaction, loadNormalizing) => boolean`으로 확장.
- `packages/core/src/production-editor-session.ts` — `onBeforeChange` 옵션 추가, `evaluateBeforeChange`(평가 순서 소유)·`buildBeforeChangeDocument`(preview 전용 변환) 신설.
- `packages/core/src/editor-controller.ts` — `CreateEditorOptions`에 `onBeforeChange` 선언 추가.
- `packages/core/test/editor-controller-before-change.test.ts`(신규) — 8건.

## 검증

- `pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-before-change.test.ts` — 8 passed.
- `pnpm --filter @cp949/geul-core test`(전체) — 109 files / 1538 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-core typecheck` · `build`(`tsc -b`) — clean.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- post-fix mutation 검증 4건, 전부 의도한 테스트가 정확히 실패함을 확인 후 원복·재검증(8 passed): `loadNormalizing` 제외 분기 제거(즉시 크래시로 검출), root transaction 판정 제거(호출 2회로 검출), revision 검사 순서 이동(DOM 직접 dispatch 테스트로 검출), `!== false` → `=== true` 교체(void 반환 오판 3건 검출).

## 구현 중 계획과 달랐던 사실

- "한 논리적 편집당 정확히 1회만 평가" 완료 조건을 처음엔 PM의 `tr.setMeta("appendedTransaction", rootTr)` 표식으로 판정하려 했다. 이 접근이 실제로는 성립하지 않는다는 것을 mutation 검증(완료 조건 7 테스트가 2를 반환)으로 발견했다 — prosemirror-state의 `applyTransaction`이 그 meta를 appended transaction 자신의 `filterTransaction` 판정이 **통과한 뒤에만** 설정하기 때문에, 내 plugin이 그 transaction을 평가하는 시점에는 아직 meta가 없다. `transaction.before !== this.tiptapEditor.state.doc`(root transaction만 `.before`가 dispatch 시작 시점 문서와 같다) 판정으로 교체해 해결했다(`RD-004-DELTA-02.md` "## 계획"의 granularity 결정 갱신).
- mutation 검증 도중 테스트 자체의 결함도 발견했다: "최대 revision에서는 onBeforeChange를 호출하지 않고 그대로 거절한다" 테스트가 `commands.setText` 경유라 `runDocumentCommand` 자신의 독립된 revision 상한 검사에서 이미 걸러져, `evaluateBeforeChange` 내부 평가 순서 자체를 검증하지 못했다 — `editor-controller-revision.test.ts`의 "최대 revision에서 DOM 트랜잭션을..." 선례처럼 `mountTiptapEditor` + 직접 `tiptap.view.dispatch(...)`로 우회하는 테스트를 추가해 실제 순서 보장을 검증하도록 보강했다.
- `onBeforeChange` preview 변환은 세션 공유 id factory(`this.createId`)가 아니라 이 평가 1회 전용의 격리된 placeholder factory(`__pending-block-N__`)를 쓴다 — 구현 전 `tiptapToModel`의 `resolveBlockId`가 누락 id를 `createId()`로 채운다는 사실을 확인해, 공유 factory 재사용 시 실제 커밋 시점 `BlockIdExtension`이 같은 factory를 다시 소비해 카운터가 어긋나는 결함을 사전에 차단했다.

## 등록한 이슈

없음. 범위 밖 발견 없음.

## RD-004 완료 재대조

RD-004 완료 조건 4개 전부 실측 증거로 재확인:

- `onMount`/`onUnmount`가 `mount()`/`unmount()` 호출 시 정확히 1회 발화한다 — 증거: `RD-004-DELTA-01.md`.
- `onSelectionChange`가 PM selection 변경 시 발화한다 — 증거: 같은 DELTA-01 결과.
- `onBeforeChange` 다중 등록이 AND 결합·fail-fast로 동작한다 — 증거: 이 DELTA 완료 조건 1~4·7.
- 기존 revision overflow 가드가 `onBeforeChange` 목록 편입 후에도 동일하게 차단한다 — 증거: 이 DELTA 완료 조건 5, `editor-controller-revision.test.ts` 기존 케이스 GREEN 유지.

RD-004 `DONE`. 남은 RD(RD-005 읽기 전용)는 여전히 독립이고 이 완료로 새로 열린 후속 edge는 없다 — 슬라이스1의 마지막 RD다.

## 남은 제한

- `onBeforeChange`의 `changedBlockIds`는 새로 생성되는 블록에 한해 placeholder id를 담을 수 있다 — 실제 커밋 id와 다를 수 있다(설계 결정, 이 DELTA 완료 조건이 요구하지 않는 범위).
- `onBeforeChange`가 등록되면 매 편집마다 문서 전체를 한 번 더 변환·diff한다(기존 커밋 경로와 별개로 preview 전용 변환 1회 추가) — 성능 트레이드오프이지 결함은 아니다.
- `replaceDocument()`는 이 DELTA에서 `onBeforeChange` 대상이 아니다(설계 결정 — PM transaction을 만들지 않는 별도 경로, 필요해지면 additive 확장 가능).
- 슬라이스1의 나머지 RD(RD-005)는 아직 미착수다.
- push·tag·PR·`dev` → `main` 병합은 이 세션에서 실행하지 않았다.

## rollback

`git revert b4e3120`. 위험: 낮음 — 기존 파일 확장(신규 옵션 1개 + 시그니처 확장)뿐, 기존 메서드·동작 변경 없음(기존 revision overflow 가드는 값 그대로 위임). 되돌리면 `onBeforeChange`가 사라지고 RD-004는 DELTA-01만 반영된 상태(완료 조건 2/4)로 되돌아간다.
