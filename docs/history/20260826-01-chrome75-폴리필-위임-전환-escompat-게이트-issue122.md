# 2026-08-26 Chrome 75 폴리필 위임 전환과 escompat 게이트 (Issue #122)

qq-workflow(계획 승인 → subagent 구현 → 리뷰 1회 → 병합)로 진행했다.

## 목표

디펜던시의 Chrome 75 미지원 런타임 API를 pnpm patch로 고치는 대신 사용처 core-js에 위임한다(ADR-0009). tiptap findLast 호환성 패치를 제거하고, chrome83 e2e가 사용처 조건(core-js 로드)을 재현하게 하며, geul 자기 소스의 API 규율에 dist ES 호환성 게이트를 만든다.

## 확정 커밋

- `744298f` feat(compat): Chrome75 폴리필을 사용처 core-js에 위임하고 dist ES 호환성 게이트를 추가한다
- `894d4b8` docs(adr,readme): 폴리필 책임 위임을 ADR-0009로 기록하고 브라우저 지원 절을 추가한다
- `a451c05` test(compat): check:escompat 게이트와 demo 폴리필 계약에 회귀 게이트를 추가한다

## 바꾼 계약

- **ADR-0009 신설** — Chrome 75 floor(ADR-0008)를 지키는 책임의 4분면: 자기 소스 문법은 tsc `target: "ES2019"`(+react는 esbuild `--target=chrome75`), 자기 소스 런타임 API는 소스 규율 + `check:escompat` 게이트, 디펜던시 문법은 사용처 번들러 `build.target`, 디펜던시 런타임 API는 사용처 core-js. 호환성 패치는 금지·위임하고 출력 동일 성능 패치만 ADR-0006에 남는다.
- **`pnpm verify`에 `check:escompat` 게이트 추가** — `packages/*` dist 전량(workspace-roots 열거 파생)을 eslint + eslint-plugin-es-x(restrict-to-es2019 + Chrome 75 이하 지원 8종 해제, aggressive 모드, ES2025 iterator/set 충돌 규칙군 해제)로 검사. ES 표준 한정 — Web API는 #121 소유. 게이트 자신의 계약은 `tests/check-escompat.test.ts`가 진다.
- **demo 폴리필 계약** — `apps/demo`는 Chrome 75 사용처 재현: 엔트리 첫 import `"core-js/stable"`(`tests/demo-polyfill-entry.test.ts`가 고정) + `build.target: 'chrome75'` + polyfills 전용 청크.

## 주요 파일

패치 삭제(`patches/@tiptap__core@3.30.1.patch`, 무결성 테스트), `pnpm-workspace.yaml`(patchedDependencies·allowBuilds), `scripts/check-escompat.mjs` 신설, `apps/demo`(package.json·main.tsx·vite.config.ts·core-js.d.ts), `tests/`(check-escompat·demo-polyfill-entry 신설, workspace-boundaries allowlist), README·ADR-0009·dependency-licenses.

## 검증

- `pnpm verify` 전량 exit 0 — lint / build / escompat 67파일 / typecheck / unit 1025/1025 / boundaries / licenses / chromium e2e 81 passed.
- `pnpm test:e2e:chrome83` — 패치 제거만으로 RED(`findLast is not a function`) → core-js 도입 후 1 passed. 위임 필요성과 동작을 한 쌍으로 실측.
- 게이트 변이 실측 — aggressive 제거·대상 filter 축소·core-js import 이동 3종 전부 대응 테스트 RED, 원복 후 GREEN.

## 남은 제한

- Web API 격차(`crypto.randomUUID`가 dist에 실재)는 게이트 밖 — Issue #121이 소유.
- demo의 vendor-runtime ⇄ document-io 청크 순환은 잠재 상태 — core-js를 vendor-runtime에 섞으면 평가 순서가 뒤집혀 기동이 깨진다(실측). polyfills 전용 청크로 회피했고 `apps/demo/vite.config.ts` 주석이 재발 조건을 문서화한다. 이슈 등록 기준 미충족으로 미등록.
- chrome83 실검증은 `pnpm verify` 밖(도커 수동 실행).

## 등록·종료한 이슈

- 종료: #122 (완료 댓글에 완료 기준 대조·검증·남은 제한 기록)
- 신규 등록: 없음
