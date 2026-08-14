# Geul

독자 JSON 문서 모델과 HTML/GFM 상호운용을 제공하는 TypeScript 블록 에디터다. Tiptap은 비공개 편집 엔진으로만 사용하며 공개 API와 저장 형식은 특정 에디터 구현에 의존하지 않는다.

## 현재 상태

현재 단계와 바로 다음 작업은 [현재 프로젝트 상태](./docs/product/current-status.md)를 기준으로 한다.

기능별 목표와 검증 상태는 [무료 기능 인벤토리](./docs/product/blocknote-free-feature-inventory.md), 릴리스별 구현 순서는 [제품 로드맵](./docs/product/roadmap.md)을 참고한다.

## 아키텍처

```text
io    -> model
core  -> model
react -> core
demo  -> react, io, model
```

- `packages/model` (`@cp949/geul-model`): 독자 문서 타입, shape·의미 검증, 표 논리 격자 검증
- `packages/io` (`@cp949/geul-io`): model과 HTML/GFM 사이의 변환 및 HTML sanitize
- `packages/core` (`@cp949/geul-core`): Tiptap을 비공개 구현으로 감싼 headless editor controller
- `packages/react` (`@cp949/geul-react`): core의 공개 mount/command API만 사용하는 React 어댑터
- `apps/demo`: 배포된 패키지 공개 API를 사용하는 통합 데모
- `fixtures/consumer`: `dist`와 package exports만 사용하는 소비자 검증 fixture

`model`과 `io`는 DOM, React, Tiptap, ProseMirror에 의존하지 않는다. `core`의 공개 타입에는 Tiptap/ProseMirror 타입을 노출하지 않는다.

## 개발 환경

- Node.js 22.12 이상
- pnpm 11.21.0

```bash
pnpm install
pnpm dev
```

## 검증 명령

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm check:boundaries
pnpm check:licenses
pnpm verify
```

`pnpm verify`는 lint, build, typecheck, unit test, package boundary, license, Chromium E2E를 순서대로 실행하는 최종 게이트다.

단일 패키지는 filter로 검증할 수 있다.

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
pnpm --filter @cp949/geul-react typecheck
pnpm --filter consumer-fixture typecheck
```

## 제품 문서

- [현재 프로젝트 상태](./docs/product/current-status.md): 현재 단계와 바로 다음 작업
- [GitHub Issues](https://github.com/cp949/geul/issues): 발견 작업, 실행 계획, 체크리스트와 진행 상태
- [프로젝트 공통 언어](./CONTEXT.md): 저장·변환·완료 계약의 표준 용어
- [무료 기능 인벤토리](./docs/product/blocknote-free-feature-inventory.md): 기능 범위와 검증 상태의 단일 기준
- [제품 로드맵](./docs/product/roadmap.md): R0-R8 구현 순서와 단계별 완료 조건
- [개발 문서 생명주기](./docs/process/development-lifecycle.md): 설계, 구현, 리뷰와 완료 판정 절차
- [이슈 트래커 계약](./docs/agents/issue-tracker.md): Matt Pocock 스킬의 GitHub Issue 소비 규칙
- [도메인 문서 계약](./docs/agents/domain.md): single-context 공통 언어와 ADR 소비 규칙
- [아키텍처 결정](./docs/adr/): 장기 결정과 선택 이유
- [반복 함정](./docs/pitfalls/INDEX.md): 재발 방지 규칙과 검증 방법
- [R0 완료 판정](./docs/reviews/r0-project-foundation-completion.md): R0 체크리스트와 소급 검증 증거
- [MVP 설계](./docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md): R0/R1 설계 계약
- [에이전트 문서 체계 설계](./docs/specs/2026-08-14-agent-documentation-system-design.md): 작업 상태와 영구 문서의 책임 경계
- [의존성 라이선스](./docs/product/dependency-licenses.md): 외부 런타임 의존성 라이선스 목록

## 독자 구현 원칙

[BlockNote](https://github.com/TypeCellOS/BlockNote) v0.54.0의 공개 문서와 동작을 제품 기능 기준선으로 참고한다. BlockNote의 소스 코드, 컴포넌트, 스타일, 아이콘은 복사하지 않는다. 공개 API, 저장 모델, 패키지 경계와 시각 디자인은 독자적으로 설계한다.

프로젝트 자체 배포 라이선스는 아직 결정하지 않았다. 공개 배포 전 [GitHub Issue #2](https://github.com/cp949/geul/issues/2)를 완료하고 저장소 루트에 `LICENSE`를 추가해 이 문서와 동기화한다.
