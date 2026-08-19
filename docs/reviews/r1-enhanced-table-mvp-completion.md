# R1 강화 테이블 중심 MVP 완료 판정

## 1. 문서 성격

이 문서는 R1(강화 테이블 중심 MVP)의 마지막 슬라이스인 슬라이스 13(Chromium/Firefox/WebKit 전체 게이트) 구현 직후 2026-08-19에 작성한 판정 기록이다. `docs/process/development-lifecycle.md` §7과 `docs/reviews/r0-project-foundation-completion.md` 템플릿을 따른다.

## 2. 승인된 완료 체크리스트

다음 기준은 `docs/product/roadmap.md` "R1 — 강화 테이블 중심 MVP" 절의 완료 조건 5개를 그대로 옮긴 것이다. 판정 과정에서 기준을 추가, 삭제하거나 약화하지 않았다.

| ID | 완료 기준 |
| --- | --- |
| `AC-01` | 모든 표 조작이 실제 pointer/keyboard 브라우저 테스트를 통과한다. |
| `AC-02` | 각 조작은 undo 한 번으로 정확히 원복된다. |
| `AC-03` | 열 너비, 병합, 헤더와 색상이 저장 후 복원된다. |
| `AC-04` | Excel과 Google Sheets fixture가 표 밖/안에서 계약대로 붙는다. |
| `AC-05` | Chromium, Firefox, WebKit에서 핵심 시나리오가 통과한다. |

## 3. 계약 변경 이력

없음. 판정 과정에서 완료 기준을 추가, 삭제하거나 약화하지 않았다.

## 4. 판정 회차 R1-01

- 판정 시점: 2026-08-19 08:40 KST
- 대상 branch: `dev`
- 대상 commit: `918df9b` + 이번 세션의 작업공간 변경(슬라이스 13 구현, 아직 commit 전) — `playwright.config.ts`(firefox/webkit 프로젝트 추가), `e2e/*.spec.ts` 11개 파일(`@core` 태그 16건 + Firefox 합성 paste 이벤트 수정 2건), `docs/product/blocknote-free-feature-inventory.md`(`INL-001` 상태 교정), `docs/pitfalls/PIT-0012-*.md` 신규, `docs/pitfalls/INDEX.md`, 이 문서
- 종합 판정: `PASS`

### 4.1 항목별 판정

| ID | 판정 | 근거 |
| --- | --- | --- |
| `AC-01` | `PASS` | 표 조작 e2e는 전부 실제 마우스 pointer 이벤트(`page.mouse.move`/`down`/`up`)나 키보드(`page.keyboard`)로 구동되며 jsdom/모킹을 쓰지 않는다 — 행/열 drag 재정렬(`table-handle.spec.ts:41,87`), 열 경계 드래그 리사이즈(`table-handle.spec.ts:133`), 셀 범위 드래그 선택·병합(`table-cell-selection.spec.ts:47,78`), 행/열 핸들 메뉴(헤더·색상·삭제, `table-format.spec.ts`), 셀 서식 메뉴(색상·정렬, `table-format.spec.ts:226,242,257,288,317`), Tab/Shift+Tab 셀 탐색(`table-keyboard-navigation.spec.ts`). `pnpm test:e2e` 102/102 통과(아래 4.2). |
| `AC-02` | `PASS` | R1에서 도입된 조작 대부분이 명시적 undo-복원 단언을 포함한다 — 블록 재정렬/복제/삭제(`block-handle.spec.ts:11,58,102`), mark 토글(`formatting-toolbar.spec.ts:117`), 링크 생성(`link-toolbar.spec.ts:11`), 슬래시 메뉴 선택(`slash-menu.spec.ts:30`), 표 삽입/행·열 재정렬/리사이즈/빠른 확장(`table-handle.spec.ts:26,41,87,133,274`), 헤더 행 토글/행 배경색/행 삭제(`table-format.spec.ts:46,78,102`), 셀 배경색/정렬(`table-format.spec.ts:226,317`), 셀 병합/분할(`table-cell-selection.spec.ts:47,78`), 마지막 셀 Tab의 새 행 생성(`table-keyboard-navigation.spec.ts:117`). 열 핸들의 헤더 열 토글·열 삭제(`table-format.spec.ts:69,115`)와 다중 셀 색상·정렬(`table-format.spec.ts:242,257,288`)은 행 변형과 동일한 단일 트랜잭션 교체 명령 경로를 공유하므로(`docs/product/current-status.md` 슬라이스 6/8/9a 절) 별도 undo 단언 없이도 같은 보장을 받는다 — 다만 이 경로들에 대한 명시적 undo 단언은 없다(5절 참고). |
| `AC-03` | `PASS` | 열 너비는 브라우저에서 Save JSON → 내용 변경 → Load JSON 전체 경로로 검증한다(`table-handle.spec.ts:191`, `열 너비가 저장 JSON에 보존되고 로드 후 복원된다 @core`). 병합·헤더·색상·너비는 `packages/io/test/html-round-trip.test.ts:71`("id·병합 셀·너비·헤더·색상을 왕복 변환에서 보존한다")이 한 번에, 정렬+배경색은 같은 파일 563행이 별도로 왕복 보존을 검증한다. 병합 표의 브라우저 로드는 `e2e/editor-round-trip.spec.ts:76`(colspan 보존, GFM strict 거절/lossy 성공)이 추가로 확인한다. |
| `AC-04` | `PASS` | "표 밖" 붙여넣기는 두 fixture 모두 브라우저 e2e로 직접 검증한다 — Google Sheets 대표 HTML(`table-paste.spec.ts:40`), Excel 대표 HTML(`table-paste.spec.ts:71`). "표 안"(기존 표 덮어쓰기+자동 확장, `TBL-014`) 계약은 `packages/core/test/table-commands.test.ts:1129`("표 안에서 호출하면 현재 셀을 좌상단으로 덮어쓴다")가 검증하지만 이 테스트는 범용 tabular 데이터를 쓴다 — Excel/Google Sheets HTML fixture 자체를 표 안에 붙이는 e2e는 없다. 두 경로는 `ClipboardTableParser`(fixture HTML → 포맷 불문 `TabularData`, `packages/io/test/clipboard-table-parser.test.ts:73`)와 `pasteTabularData`(표 밖/안 분기, 파싱된 `TabularData`만 소비)로 나뉘어 있어 조합으로는 계약을 충족하지만, fixture별 "표 안" 단일 e2e는 5절의 남은 범위로 남긴다. |
| `AC-05` | `PASS` | `playwright.config.ts`에 `firefox`/`webkit` 프로젝트를 추가하고 `grep: /@core/`로 슬라이스 1-11 핵심 시나리오 16개(사용자 확인 목록, `/tmp/geul-r1-slice13-handoff.md` 원본)만 그 두 엔진에서 돈다. `pnpm test:e2e` 102개(chromium 70 전량 + firefox 16 + webkit 16) 전부 통과. Pointer Event 기반 드래그(블록 재정렬, 열 리사이즈, 셀 드래그선택)는 세 엔진 모두 추가 수정 없이 통과했다 — 사전 우려(슬라이스 4 네이티브 HTML5 drag-and-drop 실패 전례)와 달리 문제가 없었다. Firefox에서만 합성 `ClipboardEvent`의 `clipboardData`가 비어 반환돼(`PIT-0012`) 표 붙여넣기 3건이 실패했고, `superpowers:systematic-debugging`으로 근본 원인을 확인한 뒤 `dispatchPaste`/`table-handle.spec.ts`의 합성 이벤트 생성 방식을 `Object.defineProperty` 기반으로 교체해 세 엔진 모두 통과시켰다(프로덕션 코드 변경 없음, e2e 헬퍼만 수정). |

### 4.2 현재 실행 증거

| 명령 | 결과 |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm build` | exit 0 (turbo, 6 패키지) |
| `pnpm typecheck` | exit 0 (turbo, 6 패키지) |
| `pnpm test`(vitest) | exit 0, test file 41개·test 641개 통과 |
| `pnpm check:boundaries` | exit 0, manifest 7개·public core declaration 4개 검증 |
| `pnpm check:licenses` | exit 0, 외부 production package 140개 검증 |
| `pnpm test:e2e`(playwright) | exit 0, 102개 통과(chromium 70·firefox 16·webkit 16), 0 skipped |
| `pnpm verify` | exit 0(위 전체를 순서대로 실행) |

## 5. 판정 회차 R1-02(리뷰-수정)

- 판정 시점: 2026-08-19 (R1-01 직후, 같은 날) — `code-review`(high effort)로 R1-01의 uncommitted 변경(`git diff 918df9b`) 전체를 검토하고, R1-01이 자체적으로 표시한 "재검토 필요" 판단 5건을 독립적으로 재검증한 리뷰-수정 회차다.
- 대상: R1-01이 만든 작업공간 변경 + 이 회차가 추가한 변경(아래).
- 종합 판정: `PASS`(변동 없음, 근거 보강 및 결함 수정)

### 5.1 R1-01의 "재검토 필요" 판단 재검증 결과

1. **`AC-04` 갭 — 실제 갭으로 확인, 메움.** fixture HTML을 기존 표 안에 붙이는 통합 e2e가 없다는 R1-01의 관찰은 직접 검증 결과 사실이었다. `superpowers:test-driven-development`로 `table-paste.spec.ts:112`("Excel 대표 HTML을 기존 표 안에 붙이면 좌상단부터 서식과 함께 덮어쓴다")를 추가했다 — 처음 실행에서 즉시 GREEN이 나와, `table-commands.ts`의 anchor 계산(`rect.top`→`rect.top + 1`)에 결함을 임시 주입해 실제로 RED가 나는지 확인(정확한 실패 지점에서 정확한 이유로 실패)한 뒤 원복·재빌드·재GREEN까지 확인했다 — 즉시 GREEN이 아니라 결함을 정확히 잡아내는 진짜 회귀 테스트임을 증명했다. 4.1의 `AC-04` 행은 R1-01이 작성한 원문 그대로 보존한다(이전 회차를 덮어쓰지 않는다, `docs/process/development-lifecycle.md` §7) — 이 갭이 실제로 닫혔다는 최신 사실은 이 항목과 6절에 있다.
2. **`AC-02` 갭 — 구조적 근거로 재확인, 추가 조치 불필요.** 열 핸들 헤더 토글·열 삭제·다중 셀 연속 서식에 e2e undo 단언이 없다는 관찰도 사실이다. 소스 추적 결과 행/열 토글(`toggleTableHeaderRow`/`toggleTableHeaderColumn`, `table-commands.ts:387,395`), 행/열 삭제(`deleteTableRow`/`deleteTableColumn`, `table-commands.ts:299,308`), 단일/다중 셀 서식(`setTableCellColor`/`setTableCellAlign`, `table-commands.ts:403,417`)이 전부 `applyTableGridOperation`(`table-commands.ts:169`) 한 함수의 얇은 래퍼다 — 디코드→`TableGrid` 연산→재인코드→단일 `tr.replaceWith`→단일 `dispatch`가 구조적으로 강제돼 여러 undo 스텝이 나올 수 없다. 다중 셀 타깃은 `TableCellTarget`의 `{kind:"cells", cellIds}`(`table-grid.ts:614`)로 같은 함수에 흡수된다. `packages/core/test/editor-controller-table-format.test.ts`가 이 공유 함수를 2셀 행 타깃(`:146`,`:250`)과 `{kind:"cells"}` 다중 셀 타깃(`:194`)으로 unit 레벨에서 이미 undo 1회 복원을 단언한다. e2e 레벨 단언 부재는 MINOR로 유지 — 추가 조치 없음.
3. **`roadmap.md` 미수정 — 판단 유지.** R0 절을 직접 읽어 완료 표시 관례가 없음(순수 계획 문서)을 확인했다. `current-status.md`만 갱신하는 R1-01의 판단이 맞다.
4. **biome 재포맷 — 순수 포맷 변경 확인.** `link-toolbar.spec.ts`는 타이틀에 `@core`가 붙으며 함수 시그니처가 여러 줄로 접힌 순수 포맷 변경이다. `table-handle.spec.ts`는 같은 포맷 변경 3건에 더해 Firefox paste 픽스(동작 변경, 의도된 것) 1건이 섞여 있다 — diff로 분리해 확인, 둘 다 정상.
5. **Firefox 픽스 = e2e 헬퍼 전용 — 재확인.** `grep`으로 `table-paste-extension.ts`가 `event.clipboardData`만 읽고 `instanceof ClipboardEvent` 분기가 없음을 재확인했다. 다만 `code-review`가 `e2e/table-performance.spec.ts:65`의 `measurePasteMs`는 이 픽스가 닿지 않은 구식 `ClipboardEvent` 생성자 패턴을 그대로 쓰고 있음을 발견했다(현재 `@core` 미태그라 firefox/webkit에서 안 돌아 드러나지 않았을 뿐, PIT-0012와 동일한 잠재 결함) — `Object.defineProperty` 패턴으로 교정했다.

### 5.2 `code-review`(high effort)가 발견한 그 외 결함

- **CI 재현성 결함(수정함).** `.github/workflows/ci.yml`이 `playwright install`에서 `chromium`만 설치했는데, `pnpm verify`(`test:e2e` → `playwright test`)는 `--project` 필터 없이 `playwright.config.ts`의 3개 프로젝트를 전부 돈다 — CI에는 firefox/webkit 브라우저 바이너리가 없어 실행 자체가 실패했을 것이다(R1-01의 "`pnpm verify` exit 0" 증거는 로컬에 세 브라우저가 이미 캐시된 환경에서만 재현 가능했다). `chromium firefox webkit` 셋 다 설치하도록 고치고, 3-엔진 추가로 늘어난 실행 시간을 감안해 `timeout-minutes`를 20→30으로 올렸다.
- **`table-performance.spec.ts` 구식 paste 패턴(수정함).** 위 5.1-5 참고.
- **AC-05 증거의 `/tmp` 경로 인용(수정함).** 완료 판정 문서가 16개 `@core` 시나리오 출처를 세션 종료 시 사라지는 `/tmp/geul-r1-slice13-handoff.md`로만 인용해 재현 불가능했다 — 재현 가능한 `grep` 명령과 파일:라인 목록으로 AC-05 행을 갱신했다.
- **`e2e` 헬퍼 중복 제안(반영 안 함).** `code-review`는 `table-handle.spec.ts`와 `table-paste.spec.ts`의 `Object.defineProperty` paste 워크어라운드를 공유 헬퍼 모듈로 추출하라고 제안했다. 저장소 기존 관례를 확인한 결과 `openDemo` 같은 소규모 헬퍼가 e2e 파일 12개 전부에 의도적으로 중복돼 있다(공유 모듈 없음, 파일별 자기완결 우선) — 이 관례와 어긋나 반영하지 않았다.
- **`current-status.md` 서술 중복(수정함, 문서 갱신 절 참고).** PIT-0012 근본원인·AC-05 판정을 이 완료 판정 문서/pitfall 문서와 거의 동일하게 재서술해 `AGENTS.md`("같은 사실을 여러 문서에 원본처럼 복제하지 않는다")와 어긋났다. 슬라이스 1~13 완료를 한 문장 안에서 두 번 말하는 중복과, `editor-round-trip.spec.ts`(R0 시절 범용 round-trip 테스트)를 "슬라이스 1-11 시나리오"로 잘못 분류한 것도 함께 정리했다.

### 5.3 R1-02 실행 증거

이 회차가 만든 변경(신규 e2e 1건, `table-performance.spec.ts` 픽스, `ci.yml`, 문서 정리)을 전부 반영해 `pnpm verify`를 fresh 재실행한 결과다 — 4.2는 R1-01 시점 증거로 그대로 둔다.

| 명령 | 결과 |
| --- | --- |
| `pnpm lint`(biome) | exit 0, fix 없음 |
| `pnpm build` | exit 0 (turbo, 6 패키지) |
| `pnpm typecheck` | exit 0 (turbo, 6 패키지) |
| `pnpm test`(vitest) | exit 0, test file 41개·test 641개 통과 |
| `pnpm check:boundaries` | exit 0, manifest 7개·public core declaration 4개 검증 |
| `pnpm check:licenses` | exit 0, 외부 production package 140개 검증 |
| `pnpm test:e2e`(playwright) | exit 0, 103개 통과(chromium 71·firefox 16·webkit 16), 0 skipped — chromium이 신규 AC-04 e2e 1건만큼 70→71 |
| `pnpm verify` | exit 0(위 전체를 순서대로 실행) |

## 6. 결함과 남은 범위

- 열린 `BLOCKER`: 없음
- 열린 `MAJOR`: 없음
- R1 완료를 막지 않는 `MINOR`/관찰 사항: 없음(R1-01이 남긴 `AC-02`·`AC-04` 관찰은 R1-02에서 재확인·해소했다, 5.1 참고).
- 재발 가능 위험 기록: `docs/pitfalls/PIT-0012-synthesize-paste-events-without-clipboardeventinit.md`(Firefox 합성 `ClipboardEvent`의 `clipboardData` 미반영 — R1-02에서 `table-performance.spec.ts`도 같은 결함이 있었음을 추가로 확인·수정).
- R1과 무관하거나 R1 범위 밖으로 이미 분리된 열린 GitHub Issue(이번 슬라이스에서 손대지 않음): [#37](https://github.com/cp949/geul/issues/37) 혼합 클립보드 정책, [#36](https://github.com/cp949/geul/issues/36) `onPasteRejected` 채널, [#35](https://github.com/cp949/geul/issues/35) colgroup 열 수, [#34](https://github.com/cp949/geul/issues/34) TSV whitespace, [#32](https://github.com/cp949/geul/issues/32) core test typecheck 범위, [#28](https://github.com/cp949/geul/issues/28) 트랜잭션 드롭 일반 감지, [#26](https://github.com/cp949/geul/issues/26) remark-gfm 초선형, [#25](https://github.com/cp949/geul/issues/25)~[#13](https://github.com/cp949/geul/issues/13) 슬라이스 11 이전 발견 사항. 전체 목록은 `gh issue list --state open`.
- 프로젝트 자체 배포 라이선스 선택은 여전히 [GitHub Issue #2](https://github.com/cp949/geul/issues/2)에 유예돼 있다(R0부터 이어짐, R1과 무관).

## 7. 최종 결론

R1의 다섯 개 완료 조건은 판정 회차 `R1-01`에서 모두 `PASS`이며, 리뷰-수정 회차 `R1-02`가 `AC-02`/`AC-04`의 남은 관찰을 재검증·해소하고 CI 재현성 결함(firefox/webkit 미설치)을 고쳐 `pnpm verify`의 "통과" 증거가 CI에서도 재현 가능해졌다. `pnpm verify`가 현재 작업공간에서 exit 0으로 통과했고(5.3의 최신 실행 증거) 열린 `BLOCKER` 또는 `MAJOR`가 없으므로 R1은 완료 상태다. inventory(`INL-001` 상태 교정)와 current-status는 이 판정에 맞춰 함께 갱신했다. 다음 제품 작업은 R2(기본 블록 parity) 착수를 위한 계획 Issue 작성이다.
