# table-handle 네이밍 통일 + 훅 재설계 영구 종결

- 레인: qq-workflow (직전 두 이력 문서 20260907-03/04가 "남은 제한"으로 남긴 두 항목 정리)
- 대상 이슈: 없음
- 작업 폴더: `_works/20260907-05-table-handle-naming-unification/`(gitignore, 저장소에는 남지 않음)
- 확정 커밋: `96972f0`(dev, `refactor(react): table-handle 파일 네이밍 singular 통일`)

## 목표

직전 두 이력 문서(`20260907-03-table-handles-partial-split.md`, `20260907-04-table-handle-overlays-split.md`)가 "남은 제한"으로 남긴 두 항목을 정리한다.

1. `table-handle-*`(singular)와 `table-handles-*`(plural) 네이밍 불일치를 singular로 통일한다.
2. hover/재정렬/리사이즈/메뉴 4개 상태머신의 훅 재설계를 "보류"에서 "영구 종결"로 전환하고 사유를 기록한다 — 이 항목은 코드 변경이 아니라 문서화다.

## 바꾼 계약과 파일

### A. 순수 rename(코드 변경)

`git mv`로 rename, 세 파일 모두 git이 rename으로 추적, 자기참조 import 경로 1곳 외 내용 무변경:

- `table-handles-constants.tsx` → `table-handle-constants.tsx`(내용 무변경)
- `table-handles-helpers.ts` → `table-handle-helpers.ts`(자기참조 import 1줄만 변경: `./table-handles-types.js` → `./table-handle-types.js`)
- `table-handles-types.ts` → `table-handle-types.ts`(내용 무변경)

import 경로 갱신(파일 rename 없음, 참조만 새 이름으로):

- `table-handles.tsx` — import 3곳(`./table-handles-constants.js`/`./table-handles-helpers.js`/`./table-handles-types.js` → `./table-handle-constants.js`/`./table-handle-helpers.js`/`./table-handle-types.js`)
- `table-handle-overlays.tsx` — import 3곳(동일 패턴)

결과: `packages/react/src/` 내 `table-handle-*` 계열 6개 파일(`table-handle-constants.tsx`, `table-handle-geometry.ts`, `table-handle-helpers.ts`, `table-handle-menu.tsx`, `table-handle-overlays.tsx`, `table-handle-types.ts`) 전부 singular로 통일됐다. 진입점 `table-handles.tsx`(plural)만 의도적 예외로 남는다 — `TableHandles` 컴포넌트명과 짝을 이루는 고유 이름이라 이번 통일 대상이 아니다(계획서 5절 범위 밖).

export 이름·함수·타입 내용·로직은 완전히 무변경이다.

### B. 훅 재설계 "영구 종결" 결정(문서화, 코드 변경 없음)

hover/재정렬/리사이즈/메뉴 4개 상태머신의 훅 재설계를, `20260907-03`/`20260907-04`가 "보류"로 남긴 상태에서 "영구 종결"로 전환한다. `table-handles.tsx`는 이번에도 상태머신을 그대로 둔다 — 이 결정 자체가 코드를 바꾸지 않는다.

사유:

1. **선례 일치**: 자매 컴포넌트 `block-side-menu.tsx`가 919→449줄로 축소된 뒤(`docs/history/20260907-02-block-side-menu-split.md`, 커밋 `3b58f97`) hover+드래그+메뉴 조율 상태머신을 훅으로 더 쪼개지 않고 단일 컴포넌트로 남긴 전례가 있다. 두 컴포넌트는 같은 종류의 얽힌 상태(hover 판정, 포인터 드래그 제스처, 메뉴 열림/닫힘 조율)를 다룬다 — 한쪽만 훅으로 더 쪼갤 이유가 없다.
2. **구체적 통증 부재**: 줄수 미학(파일이 "길다") 외에 훅 재설계를 정당화할 실제 버그나 리뷰 어려움 사례가 없다. `20260907-03`/`04`도 같은 이유로 착수를 보류했다.
3. **리스크 대비 이득 부재**: 이 영역은 드래그 타이밍 버그 이력(Issue #15, #63, #64)이 있다. 새 추상화 계층(상태를 훅으로 추출)은 그 타이밍에 새 리스크를 얹을 뿐, 상쇄할 구체적 이득(버그 감소, 리뷰 용이성 개선 등 측정 가능한 근거)이 없다.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-react test` — 38 files / 505 tests pass(rename 전후 동일 개수, `table-handles.test.tsx`/`table-handle-menu.test.tsx`/`table-handle-geometry.test.ts` 포함 전체 assertion 무변경)
- `pnpm --filter @cp949/geul-react typecheck` — pass(복합 3단 스크립트: `tsc -p tsconfig.json` → `tsconfig.test.json` → `tsconfig.configs.json`, PIT-0038 준수)
- `pnpm --filter @cp949/geul-react build` — pass, `dist/table-handle-helpers.js`/`dist/table-handle-constants.js`/`dist/table-handle-types.js` 정상 생성
- `pnpm exec prettier --check`(변경 파일 5개: `table-handle-constants.tsx`, `table-handle-helpers.ts`, `table-handle-types.ts`, `table-handles.tsx`, `table-handle-overlays.tsx`) — pass

## 남은 제한

- 등록한 이슈 없음 — 순수 구조 리팩터 + 문서화이고 제품 동작·게이트 구멍·거짓 통과를 드러내지 않아 `issue-tracker.md` "등록 기준"을 통과하는 발견이 없었다.
- hover/재정렬/리사이즈/메뉴 4개 상태머신의 훅 재설계는 이번 결정으로 영구 종결됐다 — 이후 다시 다룰 때는 이 문서의 판단을 뒤집을 새 근거(구체적 버그, 측정된 리뷰 통증 등)가 필요하다.
- `table-handles.tsx`(진입점, plural)와 나머지 singular 파일들 사이의 네이밍 차이는 의도적으로 남긴 예외다(`TableHandles` 컴포넌트명과 일치, 계획서 5절).
