---
status: accepted
---

# 4개 npm 패키지를 lockstep 버전으로 항상 함께 배포한다

`@cp949/geul-model`·`@cp949/geul-io`·`@cp949/geul-core`·`@cp949/geul-react`는 항상 같은 버전 번호를 쓴다. 배포 시점에 실제 코드 변경이 없는 패키지도 예외 없이 같은 새 버전으로 함께 배포한다(사용자 지시, 2026-09-14) — 일부만 새 버전을 내는 부분 배포는 없다.

ADR-0002가 이 4개를 하나의 npm 패키지로 합치는 안을 이미 기각했다(서버 전용 소비·프레임워크 독립 소비 분리, Tiptap/ProseMirror 타입 비노출). 패키지 경계를 유지하면서 "몇 개를 배포해야 하는가"라는 별개 질문에는 lockstep으로 답한다 — 내부 의존 그래프(`io -> model`, `core -> model, io`, `react -> core`)가 이미 긴밀히 결합돼 있어 독립 버전 관리(예: semantic-release 개별 패키지별)가 주는 이점(패키지별 독립 릴리스 주기)보다 버전 어긋남 방지 이점이 크다. `workspace:*` 내부 의존 표기는 `pnpm publish`가 실제 버전으로 치환하므로, lockstep이면 이 4개가 서로를 항상 정확히 같은 버전으로 참조한다.

## Consequences

- 4개 `package.json`의 `"version"` 필드는 항상 동일한 값을 가진다. 하나라도 어긋나면 사고이지 의도가 아니다.
- 배포는 4개를 한 커맨드(`pnpm -r publish` 계열)로 같은 실행 안에서 수행한다. 하나만 배포하고 나머지를 나중에 배포하지 않는다.
- 어떤 변경이 major/minor/patch를 유발하는지 정하는 버전 증가 규칙은 이 ADR의 범위 밖이다 — 필요해지면 별도로 정한다.
- 최초 배포 버전 번호(예: `0.1.0`) 자체는 이 ADR이 정하지 않는다 — 배포 시점에 확정한다.
- `apps/demo`·`apps/showcase`·`fixtures/consumer`는 `"private": true`로 이 lockstep 대상이 아니다.
