# Issue #156 슬라이스6 RD-002 DELTA-02 — LinkToolbar keyboard-only e2e

## 목표

RD-002(키보드 a11y, `UI-016`)의 두 번째이자 마지막 DELTA. LinkToolbar가 keyboard-only(Shift+Tab 이동 + Enter)로 링크 생성까지 도달·완료됨을 e2e로 고정한다. RD-002 완료 조건 2("SlashMenu·FormattingToolbar·LinkToolbar가 keyboard-only로 핵심 동작까지 도달·완료된다")의 남은 부분 — SlashMenu·FormattingToolbar Bold는 기존 e2e가 이미 커버했다.

## 확정 커밋

- `aef5db1` — test(e2e): LinkToolbar Add link 버튼 keyboard-only 경로 검증 추가

## 변경한 계약과 파일

- `e2e/link-toolbar.spec.ts` — `formatting-toolbar.spec.ts`의 `focusWithShiftTab` 헬퍼를 그대로 복제해 추가(2번째 사용, `openDemo`처럼 다수 spec 중복 문턱에는 못 미쳐 이번엔 공용화하지 않았다). 신규 테스트 1건: Shift+Tab만으로 `Add link` 버튼에 도달 → Enter로 활성화 → URL 입력 → Enter로 저장까지 keyboard-only로 검증.
- 제품 소스 변경 없음 — LinkToolbar는 이미 표준 `<button>`/`<input>` Tab 순서와 Enter/Escape keydown 핸들러를 갖추고 있었다(characterization).

## 검증

- `pnpm test:e2e --project=chromium -g "키보드만으로 Add link"` 1 passed — 구현 전부터 기존 동작이 이미 통과(신규 코드 없이 신규 테스트만 추가한 characterization).
- `pnpm typecheck:e2e` clean.
- RD-002 완료 재대조: `pnpm test:e2e --project=chromium` 전량 185 passed(DELTA-01 시점 184 + 신규 1).
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-002 완료

두 완료 조건 모두 충족.

- "SlashMenu가 현재 하이라이트된 옵션을 `aria-activedescendant`로 알린다" — DELTA-01, 증거: `docs/history/20260907-09-...md`.
- "SlashMenu·FormattingToolbar·LinkToolbar가 keyboard-only로 핵심 동작까지 도달·완료된다" — DELTA-02(LinkToolbar) + 기존 e2e(SlashMenu `e2e/slash-menu.spec.ts:54`, FormattingToolbar `e2e/formatting-toolbar.spec.ts:106`), 증거: 위 검증.

RD-002 `DONE`. `_works/roadmap/roadmap.md`·`RD-002.md`·`progress.md` 갱신. 다음은 RD-001(mobile/touch, `UI-015`)로 전환.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스6, RD-001·RD-002)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert aef5db1`. 위험: 없음 — 신규 테스트 파일 추가뿐, 제품 소스 변경이 없다.
