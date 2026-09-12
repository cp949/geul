# G-TST-005 jsdom 환경 테스트의 자기 파일 기준 경로는 fileURLToPath(import.meta.url)+path.join으로 만든다

- 상태: `ACTIVE`
- 적용 조건: 테스트 파일 상단에 `// @vitest-environment jsdom`이 있고, 그 파일 안에서 자기 자신 기준 상대 경로(fixture, 소스 파일 등)를 만들어야 한다

## 구현 규칙

- `new URL("../상대경로", import.meta.url)`을 쓰지 않는다. jsdom 환경은 전역 `URL` 생성자를 jsdom 자체 구현으로 바꿔치기하고, 이 jsdom `URL`은 `import.meta.url`(진짜 `file:` URL 문자열)을 두 번째 인자(base)로 줘도 그걸 무시하고 jsdom의 가짜 문서 위치(`http://localhost/...`류)를 기준으로 상대 경로를 다시 푼다 — 결과가 `http:` 스킴이 되고, 이걸 `fileURLToPath()`에 넘기면 `TypeError: The URL must be of scheme file`로 죽는다.
- 대신 `fileURLToPath(import.meta.url)`(문자열을 직접 넘긴다 — `new URL()`을 거치지 않는다)로 이 테스트 파일의 절대 경로를 얻고, `node:path`의 `dirname`/`join`으로 상대 경로를 조립한다.
- `node:url`의 `URL`을 명시적으로 import해 그 클래스로 `new URL(...)`을 만들면(전역 `URL`을 안 쓰므로) 이론상 우회되지만, 이후 다른 코드가 실수로 전역 `URL`을 다시 쓰기 쉬워 함정이 반복될 여지가 있다 — `fileURLToPath(import.meta.url)` + `path.join` 조합을 기본값으로 삼는다.
- jsdom pragma가 없는 순수 node 환경 테스트(예: `packages/io/test/*.test.ts`)는 전역 `URL`이 node 것 그대로라 이 문제가 없다 — 이 규칙은 jsdom 환경 테스트에만 적용된다.

## 검증

jsdom 환경 테스트 파일에서 자기 자신 기준 파일 경로가 필요할 때 `dirname(fileURLToPath(import.meta.url))` + `join(...)` 패턴을 쓰는지 확인한다. `new URL(상대경로, import.meta.url)`을 jsdom 환경 테스트에 새로 추가하지 않는다.

관련 helper: `packages/io/test/micromark-table-patch-integrity.test.ts`(jsdom 아님, 순수 node 환경) — `createRequire(new URL("../package.json", import.meta.url))` 패턴이 이 파일에서는 안전하게 동작한다(전역 `URL`이 node 것). jsdom 환경으로 옮겨 쓸 때 그대로 복사하면 깨진다.

발견 경위: `apps/showcase/test/examples/00-composite.test.tsx`(Issue #178 RD-002 DELTA-01)에서 로컬 CSS 파일 내용을 읽는 회귀 테스트를 추가하며 실측(`TypeError: The URL must be of scheme file`, 이어서 `URL === NodeURL` 비교로 원인 확인).
