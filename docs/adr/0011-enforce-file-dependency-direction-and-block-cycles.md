---
status: accepted
---

# 패키지 내부 파일 의존 방향을 강제하고 순환 의존을 차단한다

Geul 패키지 내부(특히 `core`)는 파일이 늘어날수록 어떤 파일이 어떤 파일을 참조해도 되는지 규칙이 없었다. ADR-0002는 패키지 *간* 의존 방향만 강제하고 패키지 *내부* 방향은 다루지 않는다. CommonJS cycle에서 Node는 아직 실행이 끝나지 않은 export object를 반환해 초기화 순서에 따라 undefined를 읽을 수 있고, ES module cycle도 Cyclic Module Record의 SCC evaluate 순서에 값 초기화가 묶인다 — cycle이 명세상 허용된다고 안전을 뜻하지 않는다. 따라서 진입점(`editor-controller.ts`, `production-editor-assembly.ts`류) → 조립/커맨드(`*-commands.ts`) → 통합/leaf(`*-extension.ts`, `*-grid.ts`, `*-codec.ts`, 접미사 없는 도메인 파일) 순으로 참조 방향을 고정한다. `io`처럼 이미 feature 폴더(`clipboard/`, `html/`, `markdown/`)가 있는 경우 폴더 단위로 같은 방향을 적용하고, 새 폴더 도입은 강제하지 않는다 — core/react/model은 flat 구조와 접미사 네이밍을 유지한 채 방향만 규칙화한다. 각 패키지 최상위 `index.ts`는 외부 공개 전용 facade로 한정하고, 같은 패키지의 다른 파일은 index.ts를 다시 import하지 않는다. 값을 읽거나 함수를 호출하는 runtime edge는 전부 이 방향을 지켜 DAG를 이루어야 하며, `import type`만 있는 type-only edge는 런타임 cycle에서는 제외되지만 계층 역류 신호이므로 별도로 경고 대상이다. 자동 검사는 `dependency-cruiser`를 devDependency로 추가해 `packages/*`(apps/demo 제외) 전체를 단일 그래프로 검사하고, production source의 runtime cycle은 error, test source의 cycle과 신규 type-only cycle은 warning으로 시작해 0건이 된 뒤 error로 승격한다. 패키지 *간* 방향(ADR-0002)과 manifest·공개 declaration 검사는 기존 `check:boundaries`가 계속 소유하며 이 검사와 합치지 않는다.

## Consequences

- production source의 runtime SCC 수는 0을 목표로 한다.
- 패키지 내부 파일은 자기보다 하위 역할의 파일만 import한다 — 역방향이 필요하면 파일을 분리하거나 공용 계약을 하위로 내린다.
- 각 패키지 `index.ts`를 그 패키지의 다른 파일이 다시 import하지 않는다.
- `dependency-cruiser`는 devDependency다. `docs/product/dependency-licenses.md`는 production dependency만 기록하므로 갱신 대상이 아니다 — 단 `pnpm check:licenses`의 devDependency 스캔 여부는 도입 시 재확인한다.
- `check:boundaries`는 패키지 간 방향과 manifest·공개 declaration 검사를 계속 단독 소유한다. `dependency-cruiser`는 cycle 탐지만 전담한다.
- `apps/demo`는 이 방향 규칙의 대상이 아니다.
- devDependency 추가, `check:cycles` 스크립트 작성, CI 게이트 연결은 이 ADR이 아니라 별도 이슈에서 진행한다.
