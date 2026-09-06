# 툴체인 업그레이드: Node/pnpm/eslint-plugin-es-x/vitest

- 대상 이슈: [#157](https://github.com/cp949/geul/issues/157)
- 레인: qq-workflow
- 확정 커밋: `c733c95`(핵심 업그레이드), `0143ec2`(chrome83 Dockerfile 주석 정정) — `dev`로 ff-only 이전(2026-09-06)

## 목표

Node/pnpm/eslint-plugin-es-x/vitest 버전을 최신 안정 라인으로 올려 툴체인을 유지한다. 2026-08-26 `fd21506`이 명시적으로 낮춘 pnpm 버전을 다시 올렸다.

## 바꾼 계약과 파일

- `package.json`: `engines.node` `>=22.12.0`→`>=24.18.0`, `packageManager` `pnpm@10.34.5`→`pnpm@11.25.0`, `eslint-plugin-es-x` `9.7.0`→`10.0.0`, `vitest` `4.1.10`→`5.0.0`
- `.github/workflows/ci.yml`: `node-version` `22.12.0`→`24.18.1`, `corepack prepare pnpm@11.25.0`
- `README.md:42-43`: 개발 환경 버전 문구 동기화
- `pnpm-lock.yaml`: 재생성
- `docker/chrome83/Dockerfile`: stale해진 버전 비교 주석 정정(새 engines 계약과 무관함을 명시)
- `vite`(8.2.1)는 vitest 5의 peer 요구(`^6.4.0||^7.0.0||^8.0.0`)를 이미 만족해 무변경
- `typescript`(6.0.3)·`typescript-eslint`(8.68.0)·pnpm v12 검토는 범위 밖으로 제외(TS7.1 미출시·typescript-eslint 미호환 확인)

## 실행한 검증과 결과

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm check:escompat`(+ `tests/check-escompat.test.ts` 검출력 테스트), `pnpm typecheck`(합성 스크립트 전체), `pnpm lint`, `pnpm check:boundaries`, `pnpm check:licenses`, `pnpm test`(241 test files / 3107 tests), `pnpm verify` 전량(e2e 183/183 chromium) — 전부 통과. 단계-4 병합 직전 메인 세션이 `pnpm verify` 전량을 독립 재실행해 재확인했다.

## 남은 제한

- [Issue #158](https://github.com/cp949/geul/issues/158): vitest 5 업그레이드 후 `media-drop-paste-extension.test.ts`가 저확률(관측 1/5)로 프로세스 레벨 크래시한다(prosemirror-view의 미취소 `setTimeout` vs vitest 5 워커 종료 타이밍 추정). 현재 `pnpm verify`는 그린이라 완료 기준 위반은 아니다.
- devDependency(`vitest`/`eslint-plugin-es-x`)의 `engines.node`가 루트 `engines.node`(`>=24.18.0`, 상한 없음) 선언 범위를 Node 25.x·26.0-26.3.x 구간에서 완전히 커버하지 못한다. 미배포(`private: true`) 패키지라 실사용 영향 없고 기존에도 있던 패턴(vitest 4.1.10이 23.x에서)이 구간만 이동한 것 — 등록 기준 미달로 이슈 미등록.
- eslint-plugin-es-x 10.x 재상향은 이번에 흡수됐으나 pnpm v12(러스트 재작성판)는 검토하지 않았다.

## 등록한 이슈

- [#158](https://github.com/cp949/geul/issues/158) 신규 등록(vitest5 flaky test)
- [#157](https://github.com/cp949/geul/issues/157) 완료 댓글 등록 후 종료
