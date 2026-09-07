# R3 파일·미디어 parity 완료 판정

## 1. 문서 성격

이 문서는 R3(파일·미디어 parity)의 마지막 슬라이스인 Issue #152 슬라이스 7(Chromium/Firefox/WebKit 전체 게이트, roadmap-workflow RD-001·RD-002) 직후 2026-09-06에 작성한 판정 기록이다. `docs/process/development-lifecycle.md` §7과 `docs/reviews/r1-enhanced-table-mvp-completion.md`·`docs/reviews/r2-basic-block-parity-completion.md` 템플릿을 따른다.

## 2. 승인된 완료 체크리스트

다음 기준은 `docs/product/roadmap.md` "R3 — 파일·미디어 parity" 절의 완료 조건 4개를 그대로 옮긴 것이다. 판정 과정에서 기준을 추가, 삭제하거나 약화하지 않았다.

| ID      | 완료 기준                                              |
| ------- | ------------------------------------------------------ |
| `AC-01` | 업로드 성공·실패·취소가 구조화된 결과로 전달된다.      |
| `AC-02` | 소비자 callback 외의 특정 파일 서버에 의존하지 않는다. |
| `AC-03` | media props가 JSON/HTML round-trip된다.                |
| `AC-04` | resize, replace와 delete가 실제 브라우저에서 검증된다. |

## 3. 계약 변경 이력

없음. 판정 과정에서 완료 기준이나 승인된 공개 계약을 바꾸지 않았다.

## 4. 판정 회차 R3-01

- 판정 시점: 2026-09-06 KST
- 대상 branch: `dev`
- 대상 commit: `021227f`(슬라이스7 RD-001 DELTA-01, chromium 베이스라인 회귀 수정 + `@core` 태그) + 이 세션의 작업공간 변경(RD-002 DELTA-01 — 이 문서, inventory·current-status 갱신, 아직 commit 전)
- 종합 판정: `PASS`

### 4.1 항목별 판정

| ID      | 판정   | 근거                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AC-01` | `PASS` | `MED-002`(소비자 제공 upload callback) `VERIFIED` — `UploadFile = (file, signal) => Promise<UploadResult>`, `UploadResult`가 `success`/`error`/`cancelled` 구조화 결과를 반환한다(spec §4.1, `AGENTS.md` `Result<T,E>` 불변식). 성공/실패/취소 3분기와 업로드 중 블록 삭제 시 완료 결과 무시(경합 가드)를 `e2e/media-upload.spec.ts`(6개 시나리오, 2개 `@core`)로 Chromium에서 검증했다(슬라이스3).                                                                                                                                                                                                                                                                                                                                             |
| `AC-02` | `PASS` | Upload 계약이 소비자 제공 콜백(`uploadFile` 옵션, `CreateEditorOptions`) 하나로 완결되고 geul 자체는 파일 서버나 특정 스토리지 API를 호출하지 않는다(spec §4.1 설계, `packages/core`의 `uploadMediaFile`이 주입된 콜백만 호출). URL 기반 삽입(`MED-001`)도 소비자가 제공한 URL을 `isSupportedLinkHref`로 검증할 뿐 파일 서버에 의존하지 않는다.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AC-03` | `PASS` | JSON round-trip: `packages/model`의 4종 leaf 블록(`FileBlock`/`ImageBlock`/`VideoBlock`/`AudioBlock`) 저장형·검증이 슬라이스1부터 고정됐고 `pnpm --filter @cp949/geul-model test`·`pnpm --filter @cp949/geul-core test`가 production load/save round-trip을 검증한다. HTML round-trip: 슬라이스6이 `<figure>`+`<figcaption>`+`data-geul-*` export/import를 구현하고 `packages/io/test/html-media-round-trip.test.ts`(exportHtml→importHtml 연결 18개, 4종×prop 조합+showPreview 강등+혼합 문서 순서 보존)로 고정했다. GFM은 spec §7.2가 명시한 대로 Image만 strict round-trip 가능하고 나머지는 의도된 손실(strict 거절/lossy 강등)이다 — "완료 조건 문구가 'JSON/HTML round-trip'만 요구하므로 GFM 손실은 조건 위반이 아니다"(spec §7.2 원문). |
| `AC-04` | `PASS` | resize: `MED-007`(`setMediaPreviewWidth`, image/video, 64px~콘텐츠 폭 clamp·중심 고정 대칭) `VERIFIED`, `e2e/media-resize-handle.spec.ts`(5개 시나리오, 1개 `@core`)로 Chromium 검증. replace: `MED-005`(`replaceMediaBlockFile`, 실패 시 기존 값 유지) `VERIFIED`, `e2e/media-upload.spec.ts`의 Replace 시나리오(성공/실패 각 1개, 실패 케이스 `@core`)로 검증. delete: 기존 `deleteBlock` 재사용, `e2e/media-toolbar.spec.ts`의 Delete 시나리오(`@core`)로 undo 1회 복원까지 검증. 3-엔진 게이트(슬라이스7 RD-001)가 drag/drop(`media-drop-paste.spec.ts`) 대표 시나리오를 `@core`로 편입해 firefox/webkit에서도 미디어 기능 대표 흐름이 실행된다(`pnpm test:e2e:full` 255 passed, chromium 183+firefox 36+webkit 36).                        |

### 4.2 현재 실행 증거

| 명령                                                       | 결과                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm lint`(eslint)                                        | exit 0                                                                 |
| `pnpm run format:check`(prettier)                          | exit 0                                                                 |
| `pnpm build`(turbo)                                        | exit 0, 6/6 성공(FULL TURBO, 캐시)                                     |
| `pnpm check:escompat`                                      | exit 0, 138개 파일 Chrome ≥ 75 기준 통과                               |
| `pnpm typecheck`(turbo+configs+e2e+tests+scripts)          | exit 0, 10/10 성공                                                     |
| `pnpm test`(vitest)                                        | exit 0, test file 241개·test 3107개 통과                               |
| `pnpm check:boundaries`                                    | exit 0, manifest 7개·public core declaration 7개 검증                  |
| `pnpm check:licenses`                                      | exit 0, manifest 6개·외부 transitive production package 139개 검증     |
| `pnpm test:e2e`(playwright, chromium)                      | exit 0, 183개 통과                                                     |
| `pnpm verify`                                              | exit 0(위 전체를 순서대로 실행)                                        |
| `pnpm test:e2e:full`(playwright, 3-엔진, RD-001 별도 실행) | exit 0, 255개 통과(chromium 183+firefox 36+webkit 36), 엔진별 실패 0건 |

## 5. 결함과 남은 범위

- 열린 `BLOCKER`: 없음
- 열린 `MAJOR`: 없음
- R3 완료를 막지 않는 이월 예외: 없음. `MED-001`~`MED-009`·`IO-007`은 이미 `VERIFIED`(각 슬라이스 완료 이력 참고), `BLK-013`~`016`은 이번 판정으로 `VERIFIED`로 갱신한다(§6).
- **범위 밖 발견, 이번 슬라이스에서 손대지 않음**: RD-001 readiness probe가 chromium 베이스라인 회귀(`editor-round-trip.spec.ts`, 슬라이스6 `<img>` allowlist 편입 이후 stale 단언)를 발견해 즉시 수정했다(RD-001 책임 범위 안, 보안 posture 회귀 아님 — 상세는 `docs/history/20260906-02-issue152-slice7-rd001-delta01-core-tags.md`). 표 e2e `@core` 태그 유실 회귀는 R1 범위라 이미 별도 Issue #150(OPEN)으로 추적 중이며 이번 슬라이스에서도 손대지 않았다.
- R3와 무관하거나 R3 범위 밖으로 이미 분리된 열린 GitHub Issue(이번 슬라이스에서 손대지 않음): 전체 목록은 `gh issue list --state open`.

## 6. 최종 결론

R3의 네 개 완료 조건은 판정 회차 `R3-01`에서 모두 `PASS`다. `pnpm verify`(2m21s, chromium e2e 포함)와 별도 `pnpm test:e2e:full`(3-엔진, RD-001)이 현재 작업공간에서 exit 0으로 통과했고 열린 `BLOCKER`·`MAJOR`가 없으므로 R3는 완료 상태다. GFM 손실(Image 외 strict 거절/lossy 강등)은 spec §7.2가 명시한 의도된 계약이라 이월 예외가 아니다. inventory(`BLK-013`~`016`을 `VERIFIED`로 갱신)와 current-status는 이 판정에 맞춰 함께 갱신했다. 다음 제품 작업은 R4(확장성과 제품 통합 parity) 착수를 위한 계획 Issue 작성이다.
