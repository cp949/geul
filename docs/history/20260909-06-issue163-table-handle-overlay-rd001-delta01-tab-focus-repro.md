# Issue #163 표 핸들 오버레이 뷰포트 도달성 RD-001 DELTA-01 — 키보드 Tab 포커스 재현 확인

## 목표

roadmap-workflow(RD-001 키보드 Tab 포커스 실측, RD-002 오버레이 6종 뷰포트 도달성 확보)의 RD-001 유일 DELTA. 표 핸들 오버레이(`position: fixed`)가 뷰포트 밖으로 밀려난 뒤 키보드 Tab만으로 도달해도 실제로 화면 밖에 갇히는지 Chromium e2e로 재현/비재현을 확정한다.

## 확정 커밋

- `1a30acb` — test(table-handle): 뷰포트 밖 Add row 버튼 Tab 포커스 재현 e2e 추가

## 변경한 계약과 파일

- `e2e/table-format.spec.ts`: 신규 테스트 1건("뷰포트 밖으로 밀려난 표 확장 버튼은 키보드 Tab 포커스만으로 도달해도 화면 밖에 남는다") 추가. 기존 `growTableTo11Rows`/`scrollIntoViewportBounds` 헬퍼 재사용, 수정 없음. 공개 계약 변경 없음.

## 검증

- `pnpm exec playwright test e2e/table-format.spec.ts --project=chromium` — 20/20 통과(신규 1건 포함, 기존 19건 회귀 없음).
- `pnpm exec eslint e2e/table-format.spec.ts` — clean.
- `pnpm exec prettier --check e2e/table-format.spec.ts` — clean(최초 구현에 formatting 이슈 1건 있어 `--write`로 수정 후 재검증).
- `git diff --check` — clean.
- 재그룹화 절차의 그룹 경계 typecheck: `pnpm typecheck:e2e` — clean.

## 발견과 처리(메인 세션 직접 검증, DELTA 규모상 subagent dispatch 없이 진행)

- MINOR 1건, 수정 안 함: 뷰포트 밖 sanity check(`initialBox === null || initialBox.y >= viewport.height`)가 요소 부재와 위치 이탈을 구분하지 않는다. 같은 테스트의 후속 `toBeFocused()` assertion이 요소 존재를 이미 확인하므로 거짓양성 위험 없음 — 등록 기준(게이트 구멍·거짓통과) 미충족이라 별도 pending-issue 등록 안 함.

## RD-001 완료 — `DONE`(완료 조건 1개 전부 충족)

- 조건 1(키보드 Tab만으로 뷰포트 밖 오버레이 도달 시도 결과가 e2e로 재현 가능하게 기록됨): 이 DELTA가 충족.

**실측 결과(사실)**: 재현 확인. Tab으로 초점은 Add row 버튼까지 이동하지만(`document.activeElement` 일치) `window.scrollY`는 불변, 버튼의 `boundingBox()`도 뷰포트 밖에 그대로 남는다 — 네이티브 scroll-into-view가 `focus()` 경로에서도 `position: fixed` 요소에 no-op이라는 Issue #163의 가설이 그대로 재현됐다.

## RD-002에 대한 함의

재현이 확정됐으므로 RD-002는 "포지셔닝 전략 재설계(대안 조사·트레이드오프 정리 포함)" 분기를 따른다. "자동화 전용 결함으로 범위 축소" 분기는 해당하지 않는다. `docs/product/ui-ux-checklist.md`의 `QA-056`(같은 증상을 "테스트 설계 아티팩트, 제품 결함 아님"으로 판정)이 이 결과와 상충 — RD-002 완료 시 갱신 예정(그릴링 세션 확정 사항).

## roadmap(Issue #163) 상태

`_works/roadmap/roadmap.md`의 진행 표 — RD-001 `DONE`, RD-002는 `CANDIDATE`(RD-001 `DONE`으로 readiness probe 대상이 됐으나 이번 실행에서는 진행하지 않음). roadmap 전체는 미완료.

## 등록한 이슈

없음. 위 "발견과 처리" MINOR 1건은 등록 기준(제품 동작·게이트 구멍·거짓 통과) 미충족이라 등록하지 않았다.

## 게시

진행 상황 댓글 초안(`_works/roadmap/pending-issues/01.md`)을 작성했다 — Issue #163에 RD-001 완료·재현 확인 사실을 요약한다. 게시는 사용자 확인 후 수행한다(roadmap-workflow DELTA 사이클은 qq 단계-4·ff 트랙-8과 달리 게시 무확인 예외 대상이 아님 — Issue #162 RD-003 완료 시에도 동일하게 초안만 남기고 게시는 사용자 확인 후 수행한 선례를 따름).

## 남은 위험

- 이 DELTA 범위 안에서는 없음(조사만 수행, 코드 수정 없음).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.
- RD-002(실제 수정)는 착수하지 않았다 — 별도 지시 필요.

## rollback

`git revert 1a30acb`. 위험: 낮음 — 신규 테스트 1건 추가뿐, 다른 코드나 커밋에 영향 없음.
