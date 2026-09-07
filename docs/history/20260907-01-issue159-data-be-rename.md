# data-be-* → data-geul-* DOM attribute 개명

- 목표: `data-be-*` DOM attribute(약 60종)를 `data-geul-*`로 개명한다. "be"는 이 프로젝트 명명이 아니라 BlockNote(참고 대상, ADR-0004)에서 가져온 접두어라 이 프로젝트에 의미가 없고, 2글자 범용 접두어라 다른 라이브러리와 충돌할 위험이 있었다. `.be-editor`/`--be-color-*`는 커밋 `e40d4be`에서 이미 `geul-`로 개명했고 `data-be-*` DOM attribute만 그 범위에서 제외된 채 남아있던 것을 완료했다.
- 이슈: [#159](https://github.com/cp949/geul/issues/159)

## 확정 커밋

- `722e330` refactor: data-be-* DOM attribute 60여 종을 data-geul-*로 개명(Issue #159) — RD-001~008 병렬 실행 결과 + 잔여 리터럴 정리를 재그룹화해 1개로 스쿼시
- `d537d8e` docs(history): 완료된 슬라이스 기록 23건 정리(사용자 지시, 개명과 무관)
- `021a7a7` chore: 빌드 산출물 정리 스크립트 추가(clean.sh, 개명과 무관)

## 바꾼 계약과 파일

roadmap-workflow로 진행했다(`_works/_completed/`에 아카이브). 패키지 경계가 아니라 write/read 결합 단위로 RD 8개(RD-001~008)로 나눴다:

- **RD-005**: `data-be-columns`(model+core+react, 기존 ADR-0002 공식 계약) — ADR-0002 본문도 함께 갱신
- **RD-006**(신규 식별): 표 셀 서식 `data-be-text-color`/`-background-color`/`-align`(core+io 클립보드 "자기 복사" 계약)
- **RD-007**(신규 식별): production own-content 마커 `data-be-block-id`/`-block-group`/`-{bullet,numbered,check,toggle}-list-item`/`-checked`/`-collapsed`/`-start-number`(core+io+react 일부 — io의 `importHtml`이 core 라이브 DOM을 own-content로 재인식하도록 의도적으로 설계된 계약)
- **RD-001/002/003/004/008**: 결합 없는 독립 속성군(react 전용 UI 21종, io 전용 문서 HTML 8종+표 좌표계, core 전용 자기완결 4종, core+react 마커 위젯 스타일링 4종, core+react 표 핸들 라이브 DOM 5종)
- **RD-009**: 위 개명을 서술하던 문서(ADR, spec, product inventory, 가이드) 갱신

영향 패키지: `@cp949/geul-{model,core,io,react}` 전체 src/test, `e2e/*.spec.ts`, `docs/{adr,specs,product,reviews,guides}`.

## 실행한 검증과 결과

- 저장소 전체 grep(`data-be-`/`dataBe[A-Z]`) 0건(역사적 언급 주석 1건 제외)
- `pnpm verify:packages`(lint·format·build·escompat·typecheck·test 3342/3342·boundary·licenses) 전부 통과
- `pnpm test:e2e`(chromium) 183/183 통과

## 남은 제한

- **e2e 3-엔진 전체 게이트(`pnpm test:e2e:full`, firefox/webkit `@core` 부분집합) 생략** — 사용자가 이번 실행에서 명시 지시(2026-09-07). chromium 전량과 `pnpm verify:packages`는 통과했고 AGENTS.md 기본 게이트(`pnpm verify`)도 chromium만 요구하지만, firefox/webkit 고유 렌더링 차이로 인한 회귀는 이번 실행에서 확인하지 못했다. 필요 시 `pnpm test:e2e:full` 별도 실행 권장.
- 병렬 worktree subagent 실행 중 `git stash`가 저장소 전체에서 공유돼(worktree별이 아님) RD-003·RD-004의 WIP이 뒤섞이는 사고가 있었다 — 둘 다 복구했고 최종 커밋은 메인 세션이 재검증했다. 향후 병렬 dispatch 시 subagent에 `git stash` 사용을 금지해야 한다.
