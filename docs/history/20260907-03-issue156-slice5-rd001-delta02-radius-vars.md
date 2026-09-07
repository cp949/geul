# Issue #156 슬라이스5 RD-001 DELTA-02 — `border-radius` `--geul-radius-*` 변수 승격

## 목표

RD-001의 두 번째 DELTA. `border-radius` 하드코딩 3종 값(0.25rem/0.375rem/0.5rem, 29건, 14개 파일)을 `--geul-*` CSS 커스텀 속성으로 승격한다.

## 확정 커밋

- `6ec90b4` — feat(react): border-radius를 --geul-radius-* 변수로 승격

## 변경한 계약과 파일

- `packages/react/src/_tokens.scss` — 신규 변수 3개: `--geul-radius-sm`(0.25rem), `--geul-radius-md`(0.375rem), `--geul-radius-lg`(0.5rem). 크기 스케일 이름을 썼다 — 같은 파일 안에서도 컨테이너(md)와 버튼/항목(sm)이 섞여 쓰이고 lg는 `_code-block-language-combobox.scss` 컨테이너 1곳뿐이라 역할 이름을 붙이면 실제보다 세분화된 것처럼 오독된다(DELTA-02.md "이름 결정").
- 14개 파일(`_formatting-toolbar.scss`, `_slash-menu.scss`, `_code-block-language-combobox.scss`, `_block-selection-toolbar.scss`, `_link-toolbar.scss`, `_editor.scss`, `_table-cell-format-menu.scss`, `_menu-shared.scss`, `_table-handle-menu.scss`, `_table-handles.scss`, `_block-side-menu.scss`, `_table-selection-toolbar.scss`, `_emoji-picker.scss`, `_media-resize-handles.scss`)의 border-radius 하드코딩 29건을 `var(--geul-radius-*, ...)` fallback으로 전환.
- `packages/react/test/style-build.test.ts` — 신규 변수 3개 선언 회귀 테스트, 대표 3개 규칙(lg/md/sm 각 1곳)의 var() 소비 회귀 테스트, `src/*.scss` 전체를 읽어 하드코딩 리터럴 잔존 0건을 정적으로 확인하는 전수 테스트 추가.

## 검증

- RED: 신규 3개 테스트(토큰 3개 선언, 대표 3개 규칙 var() 전환, 전수 리터럴 잔존 0건)가 구현 전 실패 확인 — 전수 테스트는 14개 파일 전부를 offender로 보고했다.
- GREEN: `style-build.test.ts` 23/23 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- 패키지 전체 테스트는 DELTA-01에서 이미 1회 실행했으므로 반복하지 않음(ff-workflow "선행 DELTA가 이미 전체 실행한 패키지에는 반복하지 않는다").
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-01·DELTA-02 완료. 완료 조건 중 "box-shadow"·"border-radius" 하드코딩 전환 2건 충족. 남은 것은 DELTA-03(`--geul-color-*` override 회귀 테스트)뿐 — 충족하면 RD-001 `DONE`.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스5, RD-001·RD-002)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 없음 — 전부 `var(--토큰, <원래 하드코딩 값>)` fallback 전환이라 변수 미정의 상태에서도 시각 결과가 기존과 동일하다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 6ec90b4`. 위험: 낮음.
