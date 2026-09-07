# Issue #156 슬라이스5 RD-001 DELTA-03 — `--geul-color-*` override 회귀 테스트, RD-001 완료

## 목표

RD-001의 마지막 DELTA. 기존 `--geul-color-*`(8종, 이미 100% 승격 완료) override가 실제 렌더된 에디터 DOM에 반영된다는 사실을 회귀 테스트로 고정한다. 새 프로덕션 코드는 없다.

## 확정 커밋

- `e42a41d` — test(react): --geul-color-* override가 렌더된 DOM에 반영됨을 고정

## 변경한 계약과 파일

- `packages/react/test/color-token-override.test.tsx`(신규) — `EditorContent`를 실제 렌더하고 컴파일된 `styles.scss`를 `<style>`로 주입해 `.geul-editor`의 `--geul-color-border` 커스텀 속성이 (1) 패키지 기본값을 상속하고 (2) 소비자 `:root` 재선언으로 override됨을 검증하는 테스트 2건.

## 검증

- jsdom 제약 스파이크(착수 전): `getComputedStyle(el).color` 같은 단축 속성은 `var(--x, fb)`를 해석하지 않고 리터럴 문자열을 반환하지만, `getPropertyValue("--x")`로 커스텀 속성 자체를 조회하면 `:root` 재선언의 source-order cascade와 자손 상속을 정확히 해석함을 3건의 스파이크로 확인 — 이 경로로 테스트를 설계했다.
- 판별력 검증(RED 대체, 새 프로덕션 코드가 없어 전통적 RED가 없음): `_tokens.scss`의 `--geul-color-border`에 `!important`를 일시 삽입해 override 테스트 1건이 실패로 전환됨을 확인한 뒤 원복 — characterization 테스트가 실제로 회귀를 잡을 수 있음을 증명했다.
- GREEN(원복 후): `color-token-override.test.tsx` 2/2 통과.
- `pnpm --filter @cp949/geul-react typecheck` clean.
- **RD-001 완료 재대조**: `pnpm --filter @cp949/geul-react test` 41 files / 555 tests 통과.

## RD-001 완료

완료 조건 4개 전부 충족:

- box-shadow 하드코딩 → `--geul-shadow-*`(DELTA-01, 커밋 `e79b299`).
- border-radius 하드코딩 → `--geul-radius-*`(DELTA-02, 커밋 `6ec90b4`).
- `--geul-*` override 시 실제 시각 속성이 바뀜이 단위 테스트로 검증(DELTA-03, 이 커밋).
- `style-build.test.ts` 포함 `pnpm --filter @cp949/geul-react test` 통과(위 재대조).

RD-001 상태를 `DONE`으로 전환한다. roadmap.md 진행 표·`_works/roadmap/RD-001.md` 갱신. 남은 것은 RD-002(`attributeOverrides`)뿐 — RD-002 완료 시 roadmap 전체(슬라이스5) 완료.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스5, RD-002 남음)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 없음 — 프로덕션 코드 변경이 없는 순수 회귀 테스트 추가다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e42a41d`. 위험: 없음(테스트 파일 삭제만).
