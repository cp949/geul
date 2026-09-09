# Issue #165 — Media Toolbar·File Panel viewport clamp

## 목표

전용 SCSS가 없어 `position: static`으로 렌더되던 Media Toolbar와 File Panel을 fixed overlay로 정상화하고, File Panel의 fixed 전환이 노출한 Media Toolbar dismiss 경합을 해소한다.

## 확정 커밋

- `0a6de89` — `fix(react): 미디어 오버레이 clamp와 dismiss 경합을 해소한다 (Issue #165)`

## 변경

- `packages/react/src/_media-toolbar.scss`, `_file-panel.scss`, `styles.scss`: `position: fixed`, `centerBelow` 변환, viewport `max-width`와 가로 overflow 적용.
- `packages/react/src/file-panel.tsx`: 자신이 소유한 블록에 URL이 채워져도 적용 결과를 표시한 채 panel을 유지하고 editor-local blockId marker를 관리.
- `packages/react/src/media-toolbar.tsx`: 같은 editor에서 File Panel이 소유 중인 blockId에는 toolbar를 활성화하지 않음. 공유 dismiss 훅과 ADR-0013은 변경하지 않음.
- `e2e/media-file-panel.spec.ts`, `media-toolbar.spec.ts`: 양쪽 overlay의 fixed position·네 viewport 경계와 URL 제출 직후 dismiss 경합 회귀 고정.

## 검증

- TDD: File Panel clamp `position: static` RED, 직접 경합과 기존 resize 회귀 각각 5/5 RED 확인.
- 수정 후 직접 경합 5회 + 기존 resize 회귀 5회, 총 10건 병렬 통과.
- React typecheck, React unit 45 files / 632 tests, focused Chromium E2E 40 tests 통과.
- `pnpm verify`: unit 313 files / 3513 tests, Chromium·mobile E2E 205 tests 포함 전량 통과. lint, format, build, Chrome 75 호환성, typecheck, package boundaries, licenses 통과.
- 재그룹화 뒤 React typecheck, 문서 동기화 뒤 `pnpm lint`와 `git diff --check` 통과.

## 남은 제한

없음. 두 overlay는 단일 행 toolbar형이므로 max-height·세로 overflow는 이번 완료 조건에 포함하지 않았다.

## GitHub

- Issue #165 완료 댓글: `issuecomment-5596111162`
- Issue #165 종료.
- commit·`dev` ff-only merge 완료. push·tag·PR 생성은 수행하지 않았다.
