# Issue #156 슬라이스5 RD-001 DELTA-01 — box-shadow/accent-highlight `--geul-*` 변수 승격

## 목표

RD-001(`--geul-*` 비색상 변수 승격 + override 검증 고정, `EXT-008`)의 첫 DELTA. `box-shadow` 하드코딩 2종 값과 `_block-selection-toolbar.scss:49`의 accent 하이라이트 rgba를 `--geul-*` CSS 커스텀 속성으로 승격한다.

readiness probe(2026-09-07)로 RD-001·RD-002 둘 다 `READY` 판정 후 착수 — RD-002(attributeOverrides, core 타입·렌더 경로)보다 scss만 건드리는 이쪽이 더 단순·저위험이라 먼저 선택(슬라이스4 "더 단순한 RD 먼저" 전례와 동일 논리, `_works/roadmap/progress.md` 참고).

## 확정 커밋

- `e79b299` — feat(react): box-shadow/accent-highlight를 --geul-* 변수로 승격

## 변경한 계약과 파일

- `packages/react/src/_tokens.scss` — 신규 변수 3개: `--geul-shadow-menu`(`0 2px 8px rgba(0,0,0,0.15)`), `--geul-shadow-toolbar`(`0 1px 4px rgba(0,0,0,0.15)`), `--geul-color-accent-highlight`(`rgba(26,115,232,0.16)`).
- 메뉴류 4개 파일(`_code-block-language-combobox.scss`, `_block-side-menu.scss`, `_slash-menu.scss`, `_menu-shared.scss`, `_emoji-picker.scss` — 5개) box-shadow → `var(--geul-shadow-menu, ...)`.
- 툴바류 4개 파일(`_formatting-toolbar.scss`, `_block-selection-toolbar.scss`, `_link-toolbar.scss`, `_table-selection-toolbar.scss`) box-shadow → `var(--geul-shadow-toolbar, ...)`.
- `_block-selection-toolbar.scss`의 선택 범위 하이라이트 배경 → `var(--geul-color-accent-highlight, ...)`. `--geul-color-accent-muted`(불투명, 뱃지·버튼 배경)와 값·용도가 달라 재사용하지 않고 신규 변수로 분리(RD-001.md "결정", readiness probe 시점 확정).
- `packages/react/test/style-build.test.ts` — 기존 `--geul-color-*` 8개 토큰 회귀 테스트를 9개(accent-highlight 포함)로 갱신, `--geul-shadow-*` 2개 선언·9개 소비처 var() 전환 신규 회귀 테스트 4건 추가.

## 검증

- RED: 신규 4개 테스트(디자인 토큰 9개 선언, shadow 토큰 2개 선언, 9개 파일 box-shadow var() 전환, accent-highlight var() 전환)가 구현 전 실패 확인(기존 16개는 그대로 통과).
- GREEN: `style-build.test.ts` 20/20 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- 첫 진입 패키지 전체 테스트: `pnpm --filter @cp949/geul-react test` 40 files / 550 tests 통과.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-01 완료. 완료 조건 중 "box-shadow 하드코딩 값이 전부 `--geul-shadow-*` 변수 참조로 전환된다" 충족(증거: 위 검증). 남은 것은 DELTA-02(border-radius 승격), DELTA-03(`--geul-color-*` override 회귀 테스트).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스5, RD-001·RD-002)가 미완료라 슬라이스1~4 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- `_block-selection-toolbar.scss`의 accent-highlight 변수 분리는 RD-001.md에 이미 근거를 기록한 낮은 비용 결정이다 — 되돌리는 비용은 SCSS 변수 선언 삭제 수준.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e79b299`. 위험: 낮음 — 전부 `var(--토큰, <원래 하드코딩 값>)` fallback 전환이라 변수 미정의 상태에서도 시각 결과가 기존과 동일하다.
