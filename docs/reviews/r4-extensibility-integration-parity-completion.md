# R4 확장성과 제품 통합 parity 완료 판정

## 1. 문서 성격

이 문서는 R4(확장성과 제품 통합 parity)의 슬라이스1~10(i18n 슬라이스11 제외)이 완료된 직후 2026-09-07에 작성한 판정 기록이다. `docs/process/development-lifecycle.md` §7과 `docs/reviews/r1-enhanced-table-mvp-completion.md`·`r2-basic-block-parity-completion.md`·`r3-file-media-parity-completion.md` 템플릿을 따른다.

## 2. 승인된 완료 체크리스트

다음 기준은 `docs/product/roadmap.md` "R4 — 확장성과 제품 통합 parity" 절의 완료 조건 8개를 그대로 옮긴 것이다. 판정 과정에서 기준을 추가, 삭제하거나 약화하지 않았다.

| ID      | 완료 기준                                                          |
| ------- | -------------------------------------------------------------------- |
| `R4-01` | 별도 fixture extension이 사용자 정의 block/inline/style을 등록한다. |
| `R4-02` | 소비자 UI가 기본 메뉴 중 하나를 교체해 동일 command를 실행한다.     |
| `R4-03` | v0.54.0 기본 locale 전체와 사용자 번역 override가 검증된다.         |
| `R4-04` | mobile viewport의 formatting·file resize 등 기준 동작을 touch 입력으로 검증한다. |
| `R4-05` | 핵심 menu와 editor flow를 keyboard-only 및 접근성 assertion으로 검증한다. |
| `R4-06` | Next.js fixture가 SSR 중 editor DOM을 평가하지 않고 client에서 정상 mount된다. |
| `R4-07` | server 환경에서 DOM 전역 없이 지원 변환을 수행한다.                  |
| `R4-08` | 공개 API에 Tiptap/ProseMirror 타입이 노출되지 않는다.                |

`R4-03`은 `EXT-009`(사용자 번역 override)와 `EXT-010`(v0.54.0 기본 locale 사전 전체) 둘 다를 포괄하는 단일 완료 조건이다. `EXT-009`/`EXT-010`(i18n, 슬라이스11)은 2026-09-06 사용자 결정으로 보류 중이라 이 판정 회차에서 `R4-03`은 제외한다 — `roadmap.md` R4 절(171행)이 "R4는 이 조건을 제외한 나머지가 모두 충족되면 먼저 게이트를 통과하고, i18n은 재개·완료 시 별도로 충족한다"고 명시한다. Issue #156 슬라이스10 원문은 이를 "완료 조건 8개 중 EXT-009/EXT-010 관련 2개를 제외한 6개"로 서술하지만, `roadmap.md`의 실제 목록은 `R4-03` 하나가 두 기능 ID를 함께 포괄하는 구조라 제외 대상은 조건 1개(`R4-03`)이고 판정 대상은 7개(`R4-01`·`R4-02`·`R4-04`~`R4-08`)다 — 이 문서가 정확한 개수로 판정한다(완료 기준 문구 자체는 바꾸지 않았다).

## 3. 계약 변경 이력

없음. 판정 과정에서 완료 기준이나 승인된 공개 계약을 바꾸지 않았다.

## 4. 판정 회차 R4-01

- 판정 시점: 2026-09-07
- 대상 branch: `dev`(RD-001, 코드 변경 없음) + `docs/156-r4-completion`(RD-002, 이 문서·inventory·current-status 갱신, 이 세션에서 병합 예정)
- 종합 판정: `PASS`(7개 판정 대상 전부 `PASS`, `R4-03`은 슬라이스11 보류로 이번 회차 판정 대상 제외)

### 4.1 항목별 판정

| ID      | 판정      | 근거                                                                                                                                                                                                                                                                                                                                                    |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R4-01` | `PASS`    | `EXT-001`~`004` `VERIFIED`(슬라이스2) — `model`의 leaf 전용 `CustomBlock`/`InlineContentItem` 확장/`CustomTextMark`와 zod 라우팅 계층, `core`의 `customBlocks`/`customInlineContent`/`customStyles` registry 디스패치·PM atom 노드 조건부 등록·`enabledBlockTypes`. 별도 fixture extension이 `core.createEditor()` 경유로 커스텀 block/inline/style을 등록하고 JSON round-trip됨을 검증(`_works/_completed/20260906-04-roadmap-custom-schema-foundation/`). `packages/react`의 `EditorProvider`는 이 옵션들을 아직 forwarding하지 않는다 — §5 "결함과 남은 범위" 참고, 후속 이슈 등록. |
| `R4-02` | `PASS`    | `EXT-006` `VERIFIED`(슬라이스4) — `SlashMenu`에 공개 `SlashMenuCustomItem[]`을 추가해 소비자 아이템이 기본 목록 뒤에 붙는다. `EXT-007` `PARTIAL`이지만 `FormattingToolbar`/`LinkToolbar`/`MediaToolbar`/`FilePanel` 4개 중 하나만 교체해도 조건을 만족한다 — 4개 전부 `component` override prop으로 동일 command를 실행함을 Chromium e2e(`formatting-toolbar.spec.ts`/`link-toolbar.spec.ts`/`media-toolbar.spec.ts`/`media-file-panel.spec.ts`)로 검증했다. `BlockSideMenu`/`TableHandles`는 이번 R4 범위 밖(슬라이스4 그릴링 결정)이라 `R4-02` PASS 판정을 막지 않는다. |
| `R4-04` | `PASS`    | `UI-015` `VERIFIED`(슬라이스6) — 블록 드래그 핸들 `touch-action:none`+`preventDefault()`, `MediaResizeHandles` touch 입력 e2e(`media-resize-handle.spec.ts:243`, `@mobile`), 전용 `mobile` Playwright project(`devices["Pixel 5"]`). `pnpm test:e2e`(mobile project 포함) 188 passed로 재확인.                                                                                    |
| `R4-05` | `PASS`    | `UI-016` `VERIFIED`(슬라이스6) — `SlashMenu`의 `aria-activedescendant`, `LinkToolbar` keyboard-only e2e(`formatting-toolbar.spec.ts:106`·`link-toolbar.spec.ts:23` 등 `@core`). RD-001 작업 중 발견한 `BlockSelectionToolbar` pointerup 레이스도 같은 세션에서 근본 수정됨(current-status.md 슬라이스6 서술).                                                                                    |
| `R4-06` | `PASS`    | `EXT-013` `VERIFIED`(슬라이스8) — `production-editor-assembly.ts`의 자기-mount round-trip을 `document` 존재 조건 분기해 `createEditor()`가 순수 Node 환경에서 크래시하지 않음을 Node 스모크 테스트로 고정. `react` 진입점에 `"use client"` 지시어를 추가하고 `EditorProvider`가 `createEditor()` 호출을 `useEffect`로 게이트해 서버 렌더에서 항상 `null`을 반환하는 self-guard를 가짐을 `renderToString` 기반 SSR 시뮬레이션으로 실측 확인 — 별도 Next.js e2e fixture 없이 기존 chromium e2e 전체(모든 spec의 `openDemo`)가 이미 같은 `EditorProvider`/`EditorContent` 경로의 client mount를 증명한다(`_works/_completed/20260907-07-.../RD-002.md:9`, roadmap-workflow 자동 재계획으로 단순화). |
| `R4-07` | `PASS`    | `IO-009` `VERIFIED`(슬라이스9) — `exportHtml`/`importHtml`/`exportMarkdown`/`importMarkdown`이 순수 Node 환경(DOM 전역 없음)에서 왕복 동작함을 `packages/io/test/server-render-html.test.ts`·`server-render-markdown.test.ts` 회귀 fixture로 고정. 신규 변환 로직 없이 기존 구현이 이미 DOM-free였음을 판정만 했다.                                                                                            |
| `R4-08` | `PASS`    | `pnpm check:boundaries`(이번 판정 실행: 7개 manifest, 11개 public core declaration 검증, exit 0, ADR-0002 소유) — R4가 추가한 모든 공개 표면(`commands`/`keyboardShortcuts`(`EXT-005`), `customBlocks`/`customInlineContent`/`customStyles`(`EXT-001`~`003`), `getBlock`/`insertBlocks`/`onBeforeChange` 등(`DOC-004`~`010`))이 `Result<T,EditorError>`와 geul 자체 타입만 노출하고 raw PM/Tiptap 타입을 노출하지 않는다.                                                                        |
| `R4-03` | 판정 제외 | `EXT-009`/`EXT-010`(i18n, 슬라이스11) 보류 — 2026-09-06 사용자 결정. 재개·완료 시 별도 회차로 판정한다.                                                                                                                                                                                                                                                     |

### 4.2 현재 실행 증거

| 명령                                                | 결과                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm lint`(eslint)                                  | exit 0                                                                                              |
| `pnpm run format:check`(prettier)                    | exit 0                                                                                              |
| `pnpm build`(turbo)                                  | exit 0, 6/6 성공(FULL TURBO, 캐시)                                                                  |
| `pnpm check:escompat`                                | exit 0, 161개 파일(core 91+io 40+model 30) Chrome ≥ 75 기준 통과                                    |
| `pnpm typecheck`(turbo+configs+e2e+tests+scripts)    | exit 0, 10/10 성공                                                                                  |
| `pnpm test`(vitest)                                  | exit 0, test file 294개·test 3390개 통과                                                            |
| `pnpm check:boundaries`                              | exit 0, manifest 7개·public core declaration 11개 검증                                              |
| `pnpm check:licenses`                                | exit 0, manifest 6개·외부 transitive production package 139개 검증                                  |
| `pnpm test:e2e`(playwright, chromium+mobile)         | exit 0, 188개 통과                                                                                  |
| `pnpm verify`                                        | exit 0(위 전체를 순서대로 실행)                                                                     |
| `pnpm test:e2e:full`(playwright, 3-엔진, RD-001)     | exit 0, 262개 통과(chromium 188+firefox 37+webkit 37 상당, 엔진별 실패 0건 — 상세는 `result/RD-001-DELTA-01.md`) |

## 5. 결함과 남은 범위

- 열린 `BLOCKER`: 없음
- 열린 `MAJOR`: 없음
- **R4 완료를 막지 않는 이월·발견 사항**:
  - `packages/react`의 `EditorProvider`가 R4에서 `core`에 추가된 확장성 옵션 7개(`customBlocks`/`customInlineContent`/`customStyles`/`enabledBlockTypes`(`EXT-001`~`004`), `commands`/`keyboardShortcuts`(`EXT-005`), `attributeOverrides`(`EXT-008`))를 forwarding하지 않는다 — 소비자는 `core.createEditor()` 직접 호출(또는 `editor` prop 경유)로만 이 기능들을 쓸 수 있다. 이 갭은 슬라이스2·3 완료 시점에 이미 발견·기록됐고(`_works/_completed/20260906-04-.../RD-002.md`, Issue #156 완료 댓글 issuecomment-5565180489) `EXT-008`도 같은 특성으로 이미 `VERIFIED` 처리된 선례가 있어(`docs/product/blocknote-free-feature-inventory.md:197`) 이번 판정에서도 `R4-01`/`R4-02` PASS를 막지 않는다. 이번 판정에서 후속 이슈 초안을 등록해 범위 밖 발견을 닫는다(`_works/roadmap/pending-issues/01.md`, 등록 여부는 사용자 승인 대기).
- 표 e2e `@core` 태그 유실 회귀는 R1 범위라 이미 별도 Issue #150(OPEN)으로 추적 중이며 이번 슬라이스에서도 손대지 않았다(R3와 동일 판단).
- R4와 무관하거나 R4 범위 밖으로 이미 분리된 열린 GitHub Issue(이번 슬라이스에서 손대지 않음): 전체 목록은 `gh issue list --state open`.

## 6. 최종 결론

R4의 완료 조건 8개 중 `R4-03`(i18n, `EXT-009`/`EXT-010`)을 제외한 7개는 판정 회차 `R4-01`에서 모두 `PASS`다. `pnpm verify`(lint/format/build/escompat/typecheck/test 294f·3390t/boundaries/licenses/test:e2e 188 passed 전부 exit 0)와 별도 `pnpm test:e2e:full`(3-엔진, RD-001, 262 passed)이 현재 작업공간에서 통과했고 열린 `BLOCKER`·`MAJOR`가 없으므로 R4는 i18n(슬라이스11)을 제외하고 완료 상태다. `EditorProvider`의 R4 옵션 미배선은 이미 알려진 이월 사항이고 이 판정에서 후속 이슈로 등록해 추적한다. inventory(`DOC-004`~`010`·`013`·`EXT-001`~`005`)와 current-status는 이 판정에 맞춰 함께 갱신했다. i18n 슬라이스11은 사용자 지시로 보류 중이며(2026-09-06 결정), 재개·완료 시 `R4-03`을 별도로 판정한다. 다음 제품 작업은 사용자 지시 대기 — R5(고급 무료 콘텐츠) 계획 착수 또는 i18n 슬라이스11 재개 중 선택.
