# 20260827-01 클립보드 표 붙여넣기 실패 피드백 채널(#36)

- 레인: qq-workflow
- 대상 이슈: #36(종료)
- 작업 브랜치: `feat/36-paste-failure-feedback`(`dev` ff-only 이전 후 삭제)

## 목표

클립보드 표 붙여넣기가 파서 거절(`CLIPBOARD_TABLE_INVALID`)이나 명령 거절(`PASTE_MERGE_CONFLICT` 등)로 실패해도 이벤트만 소비하고 호출자에게 알릴 방법이 없던 문제(Issue #36)를 고쳤다. `TablePasteOptions`/`CreateEditorOptions`에 `onPasteRejected?(reason)` 콜백을 추가해 두 거절 경로 모두에서 원인을 전달한다. `NOT_TABULAR`(기본 붙여넣기 폴백)는 거절이 아니므로 호출하지 않는다.

레인 선택 근거: 이슈 본문의 "새 공개 표면 설계 필요" 문구로 처음엔 ff를 검토했으나, `packages/react/src/editor-provider.tsx`에 이미 `onChange` 미러링 선례(내부/외부 `ownership` 분기 + `useRef` 최신값)가 있어 신규 설계가 필요 없음을 확인했다. 변경 대상이 소스 3파일(core 2·react 1) + 테스트 2파일 + spec 문서 1곳으로 DELTA 크기 상한에 크게 못 미쳐 qq로 확정했다.

## 확정 커밋 해시

`dev`는 fast-forward됐다(`e5cd857..17e1f67`, 재조립 1개 그룹).

| 해시 | 제목 |
| --- | --- |
| `17e1f67` | feat(core,react): 표 붙여넣기 거절 사유를 onPasteRejected로 알린다 |

작업 브랜치 커밋 2개(단계-2 구현 1 + 단계-3 결함 탐지 수정 1)를 1개 그룹으로 재조립했다 — 결함 탐지 수정(공개 export 이름 추가, consumer fixture 소비 증거 채움, stale 주석 정정)이 구현 커밋 자신이 만든 표면의 잔여 갭이라 별도 그룹으로 둘 이유가 없었다. `refs/backup/<브랜치>-pre-squash` 대비 트리 diff 2회(재조립 직후, 병합 직전) 모두 빈 출력.

## 바꾼 계약과 파일

- `packages/core/src/table-paste-extension.ts` — `TablePasteOptions.onPasteRejected` 추가, `handlePaste`가 파서·명령 거절 시 호출(반환값·G-EDT-001 원자성 계약은 불변).
- `packages/core/src/editor-controller.ts` — `CreateEditorOptions.onPasteRejected` 추가, `TablePasteExtension.configure`에 전달.
- `packages/core/src/table-command-error.ts`(신규) — `TableCommandError`/`TableCodecError`/`PasteRejectedReason`을 Tiptap/PM 비참조 파일로 분리(`CreateEditorOptions`가 `onPasteRejected`로 이 타입에 도달하면서 기존 위치가 ADR-0002의 declaration 비노출 계약을 깼음을 실측 확인). `table-commands.ts`는 재-export로 호환 유지.
- `packages/react/src/editor-provider.tsx` — `onChange`와 동일 패턴(ownership 분기 + `useRef` 최신 콜백)으로 `onPasteRejected` 중계.
- `packages/core/src/index.ts`, `packages/react/src/index.ts` — `PasteRejectedReason`을 `DocumentChangeEvent`와 같은 자리로 이름 export.
- `fixtures/consumer/src/index.ts` — `onPasteRejected`/`PasteRejectedReason`을 직접 참조해 G-WKS-001 소비 증거를 채움.
- `docs/specs/2026-08-18-r1-slice11-clipboard-paste-design.md` §7.2 — "구현 반영" 단락 2개(설계 결정, 타입 분리 경위)로 결정 기록.

파일 9개(`+292/-23`, `table-command-error.ts` 신규).

## 실행한 검증과 결과

```
pnpm --filter @cp949/geul-core exec vitest run --root ../.. test/editor-controller-table-paste.test.ts test/public-types.test.ts   → Test Files 2 passed / Tests 16 passed
pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/editor-content.test.tsx                                          → Test Files 1 passed / Tests 7 passed
pnpm --filter consumer-fixture typecheck                                                                                            → 통과
pnpm check:boundaries                                                                                                                → "Package boundaries verified across 7 manifests and 5 public core declarations."
pnpm verify(전량, 병합 직전 1회)                                                                                                        → 통과(lint/format/build/escompat/typecheck/unit/boundary/license/e2e chromium 83)
```

재조립 그룹 경계(1곳)에서 `pnpm typecheck` 통과.

## 단계-3 결함 탐지

읽기 전용 subagent 2개(정확성·불변식 렌즈 / 경계·테스트 갭 렌즈) 병렬 dispatch. BLOCKER 없음. `PasteRejectedReason` 미공개 export를 두 렌즈가 각각 MINOR·MAJOR로 다르게 판정했는데, `docs/process/development-lifecycle.md`의 MAJOR 정의("승인된 필수 요구사항이나 회귀 계약 미충족")에 해당하지 않아 MINOR로 확정하고 수정했다. Consumer fixture가 신규 공개 표면을 전혀 exercise하지 않은 것(G-WKS-001 적용 조건 성립, 01-계획.md §6이 이 가이드를 놓침)은 MAJOR로 확정하고 수정했다. 상세는 `IMPL-REVIEW-01.md`(작업 폴더, gitignore 대상)가 원본.

## 등록한 이슈와 pitfall

- 완료 댓글 등록 후 #36 종료(https://github.com/cp949/geul/issues/36#issuecomment-5432073505). 신규 이슈·pitfall 등록 없음 — 발견한 결함(경계·테스트 갭 MAJOR 2건, MINOR 1건)은 전부 이번 diff 안에서 즉시 수정했다.

## 남은 제한

- `apps/demo`가 아직 `onPasteRejected`를 소비하지 않는다 — 화면에 보이는 실패 피드백(토스트 등)은 issue #36의 완료 기준에 없어 이번 범위 밖으로 남겼다. 필요해지면 별도 이슈로 등록한다.
- 01-계획.md §6이 G-WKS-001을 처음부터 지목하지 못한 원인은 계획 단계의 가이드 대조 누락이다 — 가이드 자체는 이미 정확한 적용 조건("public type 또는 package dependency 변경")을 갖고 있어 가이드 보강 대상은 아니다.
