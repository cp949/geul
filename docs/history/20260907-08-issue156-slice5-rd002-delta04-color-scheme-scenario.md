# Issue #156 슬라이스5 RD-002 DELTA-04 — 색상-전환 시나리오 회귀 테스트, RD-002 완료

## 목표

RD-002의 마지막 DELTA. `attributeOverrides.editor`로 컨슈머가 만든 attribute(예: `data-color-scheme`)와 `--geul-color-*` 재선언을 조합하면 실제로 "다크 전환" 시나리오가 동작함을 회귀 테스트로 고정한다. roadmap.md "결정"(전용 `colorScheme` prop 대신 `attributeOverrides` 흡수)의 핵심 주장을 검증하는 자리다. 새 프로덕션 코드는 없다.

## 확정 커밋

- `be14211` — test(core): attributeOverrides.editor + --geul-color-* 다크 전환 회귀 테스트

## 변경한 계약과 파일

- `packages/core/test/attribute-overrides-color-scheme.test.ts`(신규, 2건) — 컨슈머가 `attributeOverrides.editor`로 만든 attribute를 selector로 쓰는 CSS로 `--geul-color-*`를 재선언하면 실제 편집 가능 DOM에 반영됨을 검증(대조군: 미지정 시 미반영).

## 착수 중 발견

`mountTiptapEditor()`의 컨테이너(`document.createElement("div")`)가 `document`에 붙지 않은 채 반환된다(`list-item-block-type-support.ts`의 기존 계약) — `:root` 선언의 상속 해석은 `documentElement`까지 이어지는 실제 트리 연결이 필요해(jsdom 실측: 미연결 트리에서 상속값은 빈 문자열, 요소 자신에 직접 매치하는 규칙만 연결 여부와 무관하게 해석됨) 최초 작성한 대조군 테스트가 의도와 다르게 실패했다. 기존 헬퍼 계약을 바꾸지 않고 이 시나리오 검증에서만 `attachToDocument()` 헬퍼로 `document.body`에 붙이는 방식으로 해결했다.

## 검증

- 판별력 검증(RED 대체, 새 프로덕션 코드가 없어 전통적 RED가 없음): `production-editor-assembly.ts`의 `editorProps` 배선을 임시로 제거해 다크 전환 테스트가 실패로 전환됨을 확인한 뒤 원복 — characterization 테스트가 실제로 회귀를 잡을 수 있음을 증명했다(`attribute-overrides-editor.test.ts`의 기존 2건도 같은 mutation에서 함께 실패해 교차 검증됨).
- GREEN(원복 후): `attribute-overrides-color-scheme.test.ts` 2/2 통과.
- `pnpm --filter @cp949/geul-core typecheck` clean.
- **RD-002 완료 재대조**: `pnpm --filter @cp949/geul-core test` 138 files / 1608 tests 통과, `pnpm --filter @cp949/geul-react typecheck` clean(RD-002는 core만 변경하지만 공개 타입 영향 최종 확인).

## RD-002 완료

완료 조건 5개 전부 충족(RD-002.md에서 원문 "`@cp949/geul-react test`"가 RD-001 복사 오기였음을 이번 재대조에서 발견·정정 — 실제로는 `@cp949/geul-core test`가 맞는 검증 대상):

- `attributeOverrides.editor` 반영(DELTA-01, 커밋 `e94827c`).
- `attributeOverrides.blockContainer` 반영(DELTA-02, 커밋 `eefeb0a`).
- class 병합·예약 `data-geul-*` 충돌 시 무시+경고(DELTA-02, 커밋 `eefeb0a`, `blockGroup`도 같은 규칙 재사용해 DELTA-03에서 재검증).
- `attributeOverrides.editor` + `--geul-color-*` 다크 전환 시나리오(DELTA-04, 이 커밋).
- `pnpm --filter @cp949/geul-core test` 통과(위 재대조).

RD-002 상태를 `DONE`으로 전환한다. roadmap.md 진행 표·전체 완료 조건 갱신. **RD-001·RD-002 둘 다 `DONE`이라 roadmap 전체(슬라이스5)가 완료된다** — `docs/product/blocknote-free-feature-inventory.md`의 `EXT-008`을 `VERIFIED`로 갱신하고 Issue #156에 슬라이스5 통합 완료 댓글을 게시한다(슬라이스1~4 전례: 개별 RD/DELTA는 게시하지 않고 슬라이스 전체로 한 번만 게시).

## 등록한 이슈

없음.

## 게시

Issue #156에 슬라이스5(theming, `EXT-008`) 통합 완료 댓글 게시 예정 — roadmap 전체 완료 동기화(제품 문서 갱신, archive)와 함께 이 세션에서 이어서 수행한다.

## 남은 위험

- 없음 — 프로덕션 코드 변경이 없는 순수 회귀 테스트 추가다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert be14211`. 위험: 없음(테스트 파일 삭제만).
