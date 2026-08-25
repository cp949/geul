---
status: accepted
---

# Chrome 75를 공식 browser floor로 선언한다

Geul은 공식 browser floor로 Chrome 75(2019-06)를 선언한다. Issue #4(Tailwind v4 내부 빌드 마이그레이션)의 완료 기준에는 "browser floor 기록: Chrome 111+, Safari 16.4+, Firefox 128+"가 남아 있었으나, 이 값은 그 작업 시점의 잠정 기록이었고 별도 결정 문서 없이 한 이슈의 완료 기준에만 적혀 있어 장기 참조로 쓰기 부적절했다. 대안은 둘이었다 — Chrome 111+를 그대로 유지하거나, Issue #4 본문을 직접 고쳐 값을 바꾸는 것. 전자는 실제로 진행 중인 Chrome 75 지원 방향과 계속 어긋나고, 후자는 Issue #4가 그 시점에 무엇을 기준으로 기록했는지 사후에 덮어써 추적할 수 없게 만든다. CSS 트랙은 이미 Chrome 75 floor로 전환을 마쳤다 — `packages/react`가 Tailwind v4 대신 SCSS(`sass`) + PostCSS(`autoprefixer`)로 빌드되고 `package.json`에 `"browserslist": ["Chrome >= 75"]`를 선언한다(커밋 `e40d4be`). 이 실측을 근거로 Chrome 75를 공식 floor로 확정하고, Issue #4에 남은 Chrome 111+ 기록을 이 ADR로 대체한다. 최초 기록은 Issue #119다.

## Consequences

- Chrome 75가 Geul의 공식 browser floor다. Issue #4 완료 기준의 "browser floor 기록: Chrome 111+, Safari 16.4+, Firefox 128+"는 이 ADR로 대체된 것으로 취급한다. Issue #4 본문 자체는 고치지 않는다 — 완료 당시 기록을 그대로 보존하고 정정은 댓글로 남긴다.
- CSS 트랙은 이미 이 floor를 충족한다 — PostCSS + Autoprefixer + `browserslist: ["Chrome >= 75"]`(커밋 `e40d4be`).
- JS 트랙에는 아직 미해결 차단 요인이 남아 있다 — TS 빌드 타겟이 ES2022(`tsconfig.base.json`)이고, `packages/react` 배포 산출물에 downlevel 변환 단계가 없으며, `apps/demo/vite.config.ts`에 `build.target`이 설정돼 있지 않고, `Array.prototype.at()`(Chrome 92+)과 `structuredClone`(Chrome 98+)을 Chrome 75 미지원 상태로 사용하는 곳이 남아 있다(Issue #119가 정리). 이 차단 요인의 실제 해소(빌드 타겟 변경, downlevel 도입 여부, API 대체 또는 polyfill, Chrome 75 E2E 검증)는 별도 후속 이슈가 소유한다.
- Safari/Firefox 구형 버전 지원은 이 결정의 범위 밖이다. 이 floor는 Chrome 전용이며 Safari/Firefox의 하한을 정하지 않는다.
