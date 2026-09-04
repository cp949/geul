# Issue #38 슬라이스 11 RD-001 DELTA-01 — 3-엔진 `@core` 태그 부여, RD-001 DONE

## 목표

roadmap-workflow RD-001(3-엔진 Chromium/Firefox/WebKit `@core` 게이트 GREEN)의 유일한 DELTA. 슬라이스 1~10이 추가한 기능 중 firefox/webkit `@core` 게이트가 비어 있던 대표 시나리오에 태그를 부여하고 `pnpm test:e2e:full`을 GREEN으로 만든다.

## 확정 커밋

- `80e07a3` — 슬라이스 1~10 대표 시나리오에 @core 태그를 부여해 3-엔진 게이트에 편입한다 (Issue #38 슬라이스 11, RD-001 DELTA-01)

## 변경한 계약과 파일

프로덕션 코드 변경 없음. e2e spec 파일 10개, 테스트 제목에 ` @core` 12개 신규 부여(11 → 23개 시나리오, 9 → 17개 파일, 실측 `npx playwright test --project=firefox --list`):

- `nested-block.spec.ts:142` — 하위 트리 동반 이동(Issue #125, 슬라이스 7a)
- `code-block.spec.ts:75` — 펜스 입력 규칙(`BLK-011`)
- `heading-quote-divider.spec.ts:133` — native `#`/`>`/`---` 입력 규칙(`BLK-003/005/006`)
- `list-item.spec.ts:337` — native `- ` shorthand(`BLK-007`)
- `check-list-item-marker.spec.ts:18` — 체크 토글(`BLK-009`, 파일 유일 테스트)
- `placeholder-trailing.spec.ts:38` — trailing block + heading placeholder(`UI-009`/`UI-010`)
- `block-selection.spec.ts:113,142` — 드래그 범위선택, 삭제+undo(`UI-004`)
- `clipboard-paste.spec.ts:19,48`(+ 파일 헤더 주석 정정) — HTML own-wrapper, Markdown text(`IO-007`)
- `formatting-toolbar.spec.ts:156` — 인라인 글자색(`INL-008`/`INL-009`, 슬라이스 8)
- `block-handle.spec.ts:530` — 블록 글자색(`INL-010`/`INL-011`, 슬라이스 8)

## 구현 중 계획과 달랐던 사실

계획 초안은 `formatting-toolbar.spec.ts`·`clipboard-paste.spec.ts`를 "기존 태그 대표성 재검토" 대상으로만 적었다. 실측 결과(단순 `grep -c "@core"`는 파일 헤더 주석 안의 문구까지 오매칭해 태그 개수를 과대 집계 — `clipboard-paste.spec.ts`는 실제 `@core` 태그 0개였다) 슬라이스 8(`INL-008`~`INL-011`, 글자색/배경색)이 3-엔진 게이트에 전혀 커버되지 않고 있었음을 확인해 `formatting-toolbar.spec.ts`·`block-handle.spec.ts`에 신규 태그를 추가하도록 계획을 갱신했다(`_works/roadmap/RD-001.md`에 반영).

## 검증

- `npx playwright test --project=firefox --list` — 신규 12개 전부 목록에 나타남(태그 반영 확인, 23 tests in 17 files).
- `pnpm test:e2e:full` — 191 passed(1.1m, chromium 145+firefox 23+webkit 23), 0 failed, 0 skipped. **엔진별 실패 0건.**
- `pnpm lint`(biome+eslint) — 통과.
- `pnpm typecheck` — readiness probe 단계에서 통과 확인(전 패키지 cache hit/성공). 이번 diff는 문자열 리터럴+주석뿐이라 재확인하지 않았다.
- 결함 탐지(메인 세션 직접 수행, subagent dispatch 없음 — roadmap-workflow 경량 DELTA 사이클): diff가 테스트 제목 리터럴 12곳+주석 1곳으로 한정된 Micro 변경. 계획 표와 실제 diff 위치가 정확히 일치함을 `git diff` 전체로 대조. 발견 0건.

## 등록한 이슈

없음(대상 후보 1건은 아래 "남은 제한" 참고 — `_works/roadmap/pending-issues/01.md` 초안, 등록 여부는 사용자 지시 대기).

## 남은 제한

- RD-001 완료 조건 2개 전부 실측 증거로 재대조 완료 → RD-001 `DONE`(`_works/roadmap/RD-001.md`).
- RD-002(R2 완료 판정 문서 + 상태 동기화) 진입 조건이 충족돼 `READY`로 전환. Issue #38 슬라이스 11의 나머지 절반이 남아 있다.
- **범위 밖 발견, 별도 등록 검토**: `table-format.spec.ts`·`table-handle.spec.ts`의 `@core` 태그가 현재 0개다. R1 완료 판정 문서(`docs/reviews/r1-enhanced-table-mvp-completion.md` §4.1 AC-05)가 이 두 파일을 포함해 16개 시나리오를 인용했던 것과 불일치한다(회귀 추정, 원인 미조사). R1 범위(Issue #38 슬라이스 11의 "슬라이스 1~10"에 포함 안 됨)라 이 DELTA에서 고치지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 80e07a3`. 위험: 낮음 — e2e 테스트 제목 문자열과 주석만 변경, 프로덕션 코드·assertion 로직 변경 없음. 되돌리면 3-엔진 게이트 커버리지만 이전 상태(11개 시나리오)로 줄어든다.
