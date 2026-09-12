# G-WKS-007 새 앱을 floor 브라우저 e2e에 편입하기 전 ADR-0009 준수를 계획 단계에서 확인한다

- 상태: `ACTIVE`
- 적용 조건: 새 `apps/*` 앱을 `chrome83` Playwright project(또는 다른 floor 브라우저 실검증)에 처음 연결하는 계획 단계. `apps/demo`처럼 이미 편입된 앱은 대상이 아니다.

## 구현 규칙

- e2e 편입 계획을 세우기 전에 대상 앱의 엔트리(`main.tsx` 등)와 번들러 설정(`vite.config.ts` 등)이 ADR-0009 사용처 계약을 이미 만족하는지 먼저 확인한다 — 엔트리 첫 import로 `import "core-js/stable"`을 두고 번들러 `build.target`을 `chrome75`로 둔다.
- 만족하지 않으면 e2e 편입과 같은 계획에 그 적용을 포함시킨다. 실제 floor 브라우저에서 실행해보기 전까지는 이 격차가 컴파일·타입 단계에서 드러나지 않고 런타임에 화면이 완전히 비는 형태(`Object.hasOwn is not a function` 등)로만 나타나, 계획 단계에서 놓치면 e2e 인프라 연결 자체가 끝난 뒤에야 발견돼 별도 조사·수정 사이클을 새로 열게 된다(Issue #180 계획 때 이 확인을 놓쳐 Issue #182에서 뒤늦게 발견·수정).
- `core-js`가 이미 타입 선언을 배포하지 않으므로 `apps/demo/src/core-js.d.ts`와 동일한 shorthand ambient module 선언(`declare module "core-js/stable";`)도 같이 추가한다.
- `apps/*` 매니페스트에 `core-js`를 새로 추가하면 다음도 같은 변경에서 함께 갱신한다 — 빠뜨리면 `pnpm verify`가 뒤늦게 실패로 드러낸다.
  - `tests/workspace-boundaries.test.ts`의 해당 앱 dependency allowlist.
  - `docs/product/dependency-licenses.md`의 `core-js` 행 "Used by" 컬럼.
  - `docs/adr/0009-*.md` Consequences의 사용처 목록.

## 완료 기준

- 대상 앱이 floor 브라우저(Chrome83 Docker 등) e2e에서 빈 화면이나 문법·API 오류 없이 렌더링된다.
- `tests/workspace-boundaries.test.ts`, `docs/product/dependency-licenses.md`, `docs/adr/0009-*.md`가 새 사용처를 반영해 `pnpm verify`가 통과한다.
