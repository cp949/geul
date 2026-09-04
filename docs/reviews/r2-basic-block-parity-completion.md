# R2 기본 블록 parity 완료 판정

## 1. 문서 성격

이 문서는 R2(기본 블록 parity)의 마지막 슬라이스인 Issue #38 슬라이스 11(Chromium/Firefox/WebKit 전체 게이트, roadmap-workflow RD-001·RD-002) 직후 2026-09-04에 작성한 판정 기록이다. `docs/process/development-lifecycle.md` §7과 `docs/reviews/r1-enhanced-table-mvp-completion.md` 템플릿을 따른다.

## 2. 승인된 완료 체크리스트

다음 기준은 `docs/product/roadmap.md` "R2 — 기본 블록 parity" 절의 완료 조건 4개를 그대로 옮긴 것이다. 판정 과정에서 기준을 추가, 삭제하거나 약화하지 않았다.

| ID | 완료 기준 |
| --- | --- |
| `AC-01` | 모든 기본 블록이 생성, 종류 변경, 중첩, 이동, 저장과 복원된다. |
| `AC-02` | 목록 번호·체크·토글 상태가 round-trip된다. |
| `AC-03` | 다중 선택 조작과 undo가 브라우저에서 검증된다. |
| `AC-04` | 일반 clipboard 우선순위와 fallback이 fixture로 고정된다. |

`IO-007`(파일 붙여넣기)은 R3로 이월되어 R2 완료 시점에 `PARTIAL`로 남는다 — roadmap.md §4 이월 예외 조항에 따라 AC-04는 HTML/Markdown/plain text 범위로 판정하고 이 `PARTIAL`을 완료 판정에 포함한다(2026-08-27 사용자 승인, Issue #38).

## 3. 계약 변경 이력

**`BLK-005`(인용문) GFM 중첩 표현 — 이월 예외 신설(2026-09-04, 이 판정 회차 중 사용자 승인).**

- 이전 기준: Issue #38 "완료 기준(Issue 전체)"은 "이 Issue 범위 기능 ID가 `VERIFIED`로 갱신된다(`IO-007`은 `PARTIAL`)"이라 `BLK-005`도 `VERIFIED`를 요구했다. 확정 사항 9는 "목록·인용문처럼 자체 컨테이너가 있는 타입에 후속 슬라이스가 중첩을 추가하면 그 타입은 손실 규칙에서 제외될 수 있다(재평가 대상)"고 예고했다.
- 발견: 슬라이스 11 RD-002 재조사(subagent 실측) 결과 슬라이스 5가 목록만 재평가해 `isGfmListLikeBlockType`에 편입시켰고, 인용문은 슬라이스 3 이후 한 번도 재평가되지 않았다 — 중첩 인용문은 지금도 GFM strict 거절·lossy 평탄화(`NESTED_CHILDREN`) 대상이다(`packages/io/test/markdown-quote-loss.test.ts`, 2026-08-29 이후 미변경). `TextBlockProps`(색상·정렬)는 슬라이스 8이 실제로 닫았다(`editor-controller-block-text-props.test.ts:278-306`, quote 대상 확인) — 두 gap 중 하나만 남았다.
- 변경: `IO-007`과 같은 이월 예외를 `BLK-005`에도 적용한다 — R2 완료 판정에서 `BLK-005`는 `PARTIAL`로 남고, GFM 중첩 인용문 표현 재평가는 별도 후속 이슈로 분리한다(등록 여부는 사용자 지시 대기, `_works/roadmap/pending-issues/`).
- 근거: paragraph/heading은 CommonMark에 자식-컨테이너 노드가 없어 중첩 표현이 원천 불가능(확정 사항 9)하지만, blockquote는 CommonMark가 `>>` 중첩 인용문을 표현할 수 있어 기술적으로는 재평가 여지가 다르다 — 즉시 거절이 아니라 후속 이슈로 남긴다.
- 영향 범위: JSON/HTML round-trip(AC-01)과 core 명령·React UI는 인용문 중첩에서 이미 정상 동작한다(`packages/core/test/list-item-commands.test.ts:193-214` 계열 패턴, `editor-controller-quote.test.ts:41,180-190`). 영향은 **GFM(Markdown) export/import 경로**로 한정된다 — AC-01의 "저장과 복원"은 JSON/HTML을 포함해 판정하므로 이 이월이 AC-01 `PASS` 판정을 막지 않는다.
- 틀렸을 때 비용: 낮음 — 기존 슬라이스 3 GFM 계약(strict 거절/lossy 평탄화)을 그대로 유지하는 결정이라 되돌릴 코드 변경이 없다. 후속 이슈에서 재평가 결과 구현하기로 하면 `io` 패키지 국소 변경(loss-analysis, export/import-markdown)으로 끝난다.

## 4. 판정 회차 R2-01

- 판정 시점: 2026-09-04 17:xx KST
- 대상 branch: `dev`
- 대상 commit: `80e07a3`(슬라이스 11 RD-001 DELTA-01, `@core` 태그 12개 신규) + 이 세션의 작업공간 변경(RD-002 DELTA-01 — 이 문서, inventory·current-status 갱신, 아직 commit 전)
- 종합 판정: `PASS`

### 4.1 항목별 판정

| ID | 판정 | 근거 |
| --- | --- | --- |
| `AC-01` | `PASS` | `DOC-002`(중첩 모델)·`BLK-003`~`BLK-011`(H4-H6·토글 제목·인용문·구분선·코드 블록·목록 4종) 전부 `VERIFIED`(`BLK-005` 예외는 §3). `children?: Block[]`가 `paragraph`/`heading`/`quote`/목록 4종 7개 타입에 공통 정의되고(`packages/model/src/types.ts`), `indentBlock`/`outdentBlock`이 `nestableBlockContent` group 판정으로 타입 무관 동작함을 이번 회차 재조사로 확인(`packages/core/test/list-item-commands.test.ts:193-214`, `editor-controller-quote.test.ts:41,180-190`). 종류 변경은 `setBlockType`(모든 대상 간 변환), 이동은 `moveBlockBefore`/`duplicateBlock`(Issue #125, 하위 트리 인지)이 커버한다. 저장·복원은 JSON(model)·HTML(io) round-trip이 각 블록 타입 unit 테스트로 고정돼 있다(`pnpm test` 219 files/2659 tests 전부 통과, 아래 4.2). |
| `AC-02` | `PASS` | `BLK-007`(글머리)·`BLK-008`(번호, `startNumber`)·`BLK-009`(체크)·`BLK-010`(토글) 전부 `VERIFIED`. 번호는 `ol[start]`+9자리 상한, 체크는 `checked` decoration+undo, 토글은 `collapsed` 저장+복원이 각각 JSON/HTML/GFM round-trip과 Chromium gate로 검증됐다(슬라이스 5·6 완료 이력, inventory 해당 행). |
| `AC-03` | `PASS` | `UI-004` `VERIFIED` — `blockSelection` 상태(`selectBlockRange`/`deleteSelectedBlocks`/`moveSelectedBlocksBefore`)와 `BlockSelectionToolbar`가 `e2e/block-selection.spec.ts`(드래그 범위선택, 삭제+undo, 이동+undo, 형제 경계 비활성화 등 8개 시나리오)로 검증됐다. 이번 슬라이스 11 RD-001이 드래그 범위선택·삭제+undo 2건을 `@core`로 승격해 Firefox/WebKit에서도 통과 확인(`pnpm test:e2e:full`, 아래 4.2). |
| `AC-04` | `PASS` | `IO-007` `PARTIAL`(계획된 이월, §2 참고). 우선순위(표>HTML>Markdown 감지>plain text)와 슬라이스 2~9 전체 블록 타입(11종)이 core fixture로 고정됐고(슬라이스 10 RD-006), 실제 Chromium `ClipboardEvent`로 대표 시나리오 4개를 검증했다. 슬라이스 11 RD-001이 HTML own-wrapper·Markdown text 2건을 `@core`로 승격해 Firefox/WebKit에서도 통과 확인. |

### 4.2 현재 실행 증거

| 명령 | 결과 |
| --- | --- |
| `pnpm lint`(biome+eslint) | exit 0 |
| `pnpm run format:check` | exit 0 |
| `pnpm build`(turbo) | exit 0, 10/10 성공 |
| `pnpm check:escompat` | exit 0, 126개 파일 Chrome ≥ 75 기준 통과 |
| `pnpm typecheck`(turbo+configs+e2e+tests+scripts) | exit 0, 10/10 성공 |
| `pnpm test`(vitest) | exit 0, test file 219개·test 2659개 통과 |
| `pnpm check:boundaries` | exit 0, manifest 7개·public core declaration 5개 검증 |
| `pnpm check:licenses` | exit 0, manifest 6개·외부 transitive production package 139개 검증 |
| `pnpm test:e2e`(playwright, chromium) | exit 0, 145개 통과 |
| `pnpm verify` | exit 0(위 전체를 순서대로 실행) |
| `pnpm test:e2e:full`(playwright, 3-엔진, RD-001 별도 실행) | exit 0, 191개 통과(chromium 145+firefox 23+webkit 23), 엔진별 실패 0건 |

## 5. 결함과 남은 범위

- 열린 `BLOCKER`: 없음
- 열린 `MAJOR`: 없음
- R2 완료를 막지 않는 이월 예외: `IO-007`(파일 붙여넣기, 계획된 이월, 2026-08-27 승인), `BLK-005`(GFM 중첩 인용문, 이번 회차 신규 승인 — §3).
- **범위 밖 발견, 후속 이슈 등록 검토**: `table-format.spec.ts`·`table-handle.spec.ts`의 `@core` 태그가 현재 0개다. R1 완료 판정 문서(§4.1 `AC-05`)가 이 두 파일을 포함해 16개 시나리오를 인용했던 것과 불일치한다(회귀 추정, 원인 미조사). R1 범위(Issue #38 슬라이스 11의 "슬라이스 1~10"에 포함 안 됨)라 이 슬라이스에서 고치지 않았다 — R2 완료를 막지 않는다(3-엔진 게이트 자체는 현재 `@core` 23개 시나리오로 GREEN이고, R2 신규 기능은 전부 커버됐다).
- R2와 무관하거나 R2 범위 밖으로 이미 분리된 열린 GitHub Issue(이번 슬라이스에서 손대지 않음): 전체 목록은 `gh issue list --state open`.

## 6. 최종 결론

R2의 네 개 완료 조건은 판정 회차 `R2-01`에서 모두 `PASS`다. `pnpm verify`(3.xx분, chromium e2e 포함)와 별도 `pnpm test:e2e:full`(3-엔진, RD-001)이 현재 작업공간에서 exit 0으로 통과했고 열린 `BLOCKER`·`MAJOR`가 없으므로 R2는 완료 상태다. `IO-007`(계획된 이월)과 `BLK-005`(이번 회차 신규 승인 이월, §3)만 `PARTIAL`로 남고 둘 다 후속 이슈로 추적한다. inventory(`DOC-002`·`UI-009`를 `VERIFIED`로 갱신, `BLK-005` 사유 갱신)와 current-status는 이 판정에 맞춰 함께 갱신했다. 다음 제품 작업은 R3(파일·미디어 parity) 착수를 위한 계획 Issue 작성이다.
