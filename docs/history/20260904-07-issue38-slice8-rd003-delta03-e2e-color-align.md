# Issue #38 슬라이스 8 RD-003 DELTA-03 — Chromium e2e, RD-003 DONE

## 목표

roadmap-workflow RD-003(React UX)의 세 번째이자 마지막 DELTA. DELTA-01(인라인 색상 팔레트)·DELTA-02(블록 메뉴 색상·정렬 섹션)를 실제 Chromium pointer/keyboard 순서와 실제 렌더 결과로 검증한다. 이 DELTA로 RD-003 완료 조건 4개가 모두 충족돼 RD-003이 `DONE`으로 전환된다.

## 확정 커밋

- `b3ba6ab` — e2e 인라인·블록 색상·정렬 팔레트 검증 추가 (Issue #38 슬라이스 8, RD-003 DELTA-03)

## 변경한 계약과 파일

- `e2e/formatting-toolbar.spec.ts`: 인라인 글자색 팔레트 적용 e2e(computed style `rgb(26, 115, 232)` 확인, undo 1회로 mark 제거) 1건, 배경색 적용 후 None 해제 e2e 1건.
- `e2e/block-handle.spec.ts`: 블록 메뉴 색상·정렬 e2e 2건 신규 — 착수 전 재확인한 사실(아래) 때문에 computed style이 아니라 데모 앱 "Save JSON"으로 읽은 `Document source` textarea JSON을 `JSON.parse`해 `textColor`/`textAlignment` 반영을 검증한다(`editor-round-trip.spec.ts`와 같은 패턴). 기존 "스크롤·뷰포트 변경 후 블록 메뉴가 블록을 따르고..." 테스트는 DELTA-02가 늘린 메뉴 높이(실측 약 1146px)에 맞춰 뷰포트 높이를 1000→1500px로 올리고 주석을 갱신했다.
- `e2e/tailwind-migration.spec.ts`: "블록 메뉴 구분선이 0폭으로 붕괴하지 않고..." 테스트가 DELTA-02로 늘어난 두 번째 `hr`(색상 섹션 앞 구분선) 때문에 `menu.locator("hr")`에서 strict-mode violation을 내 `.first()`로 좁혔다 — 검증 자체(margin-inline: 0 규칙 유효성)는 그대로다.
- 착수 전 재확인한 중요한 사실(D5, `_works/roadmap/RD-003.md`): 인라인 `textColor`/`backgroundColor` mark(`text-color-mark-extension.ts`)는 `renderHTML`이 실제 `<span style="color/background-color: ...">`를 만들어 computed style e2e가 유효하지만, 블록 수준 `TextBlockProps`는 `block-container-extension.ts:57-59`가 세 attrs를 전부 `rendered: false`로 선언해(RD-001 DELTA-01부터, 이후 어떤 커밋도 바꾸지 않음) 편집 화면에 시각 변화가 없다 — 그래서 두 표면의 e2e 검증 방식이 다르다.

## 검증

- `pnpm exec playwright test --project=chromium formatting-toolbar block-handle` → 32/32(신규 4건 포함).
- `pnpm exec playwright test --project=chromium`(전체) → 139/139. 첫 실행에서 `list-item.spec.ts` 1건이 실패했으나 `--workers=1 --repeat-each=3` 격리 재실행 3회 전부 통과, 이후 전체 재실행에서도 재현하지 않아 병렬 실행 중 자원 경합에 의한 baseline flake로 판단(이 DELTA가 그 파일이나 관련 소스를 건드리지 않는다는 사실과 일치).
- `pnpm run typecheck:e2e`, 루트 `pnpm typecheck`(전체 10 task, react build 포함) — 전부 통과.
- 변경 파일 `eslint` — 0 findings. `prettier --check` — 이미 정형.
- 단일 커밋이라 재그룹화 대상 없음. 백업 ref·트리 diff 재대조(빈 출력) 후 ff-only 병합.
- RD-003 완료 조건 갱신(roadmap-workflow "경량 DELTA 사이클" 9단계): 조건 4(Chromium e2e)를 이 DELTA가 충족 — 완료 조건 4개 전부 체크돼 RD-003을 `DONE`으로 전환(재대조 근거는 `RD-003.md`).

## 등록한 이슈

- 완료 댓글: 사용자에게 RD-003 완료 보고 게시 여부를 아직 묻지 않았다 — 다음 세션(또는 이 세션 종료 시)에 확인한다.
- 범위 밖 신규 이슈 등록 없음 — 가이드·pitfall 갭 없음. 블록 수준 색상·정렬의 편집기 내 시각 렌더 부재(D5)는 이 DELTA가 만든 사실이 아니라 RD-001 DELTA-01부터 있던 기존 설계 결정이고, 필요해지면 별도 RD/이슈로 제안할 사안이라 여기서 이슈로 등록하지 않는다.

## 남은 제한

- RD-003(React UX)이 `DONE`이 됐다 — Issue #38 슬라이스 8의 남은 RD는 RD-004(HTML/GFM)뿐이다.
- 블록 수준 `textColor`/`backgroundColor`/`textAlignment`는 편집 화면에 시각 렌더가 없다(위 사실 참고) — 사용자가 실제로 색이 바뀐 것을 보려면 HTML/GFM export나 별도 렌더 작업이 필요하나 이 로드맵 범위 밖이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — e2e 테스트 추가·기존 e2e 2건의 전제(뷰포트 높이·locator) 보정만이라 프로덕션 코드 변경이 없다.
