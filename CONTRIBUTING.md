# 기여 가이드

이 저장소에 기여하거나 내부 구조를 파악하려는 사람을 위한 문서다. 패키지 사용법은 각 패키지 README([model](./packages/model/README.md), [io](./packages/io/README.md), [core](./packages/core/README.md), [react](./packages/react/README.md))를, 프로젝트 소개는 루트 [README](./README.md)를 본다.

## 개발 환경

- Node.js 24.18 이상
- pnpm 12.4.1

```bash
pnpm install
pnpm dev
```

## 검증 명령

```bash
pnpm lint
pnpm build
pnpm check:escompat
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm check:boundaries
pnpm check:licenses
pnpm verify
```

`pnpm verify`는 lint, build, dist ES 호환성(check:escompat), typecheck, unit test, package boundary, license, Chromium E2E를 순서대로 실행하는 최종 게이트다.

단일 패키지는 filter로 검증할 수 있다.

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
pnpm --filter @cp949/geul-react typecheck
pnpm --filter consumer-fixture typecheck
```

## 릴리스

`model`/`io`/`core`/`react` 4개는 [ADR-0018](./docs/adr/0018-lockstep-version-and-publish-four-npm-packages-together.md)에 따라 [Changesets](https://github.com/changesets/changesets) `fixed` 모드로 lockstep 배포한다 — 하나라도 bump가 필요하면 4개 전부 같은 버전으로 함께 오르고 함께 배포된다.

1. 변경에 changeset을 추가한다(대화형 — patch/minor/major와 변경 요약을 묻는다).

   ```bash
   pnpm changeset
   ```

2. 배포 시점에 버전을 반영한다 — `package.json` 버전과 `CHANGELOG.md`를 갱신하고 소비한 changeset 파일을 지운다. 결과를 커밋한다.

   ```bash
   pnpm changeset:version
   ```

3. 배포한다 — `pnpm build` 후 로컬 버전이 npm 배포 버전보다 높은 패키지만 배포하고 git 태그를 만든다.

   ```bash
   pnpm changeset:publish
   ```

4. 태그를 push한다.

   ```bash
   git push --follow-tags
   ```

`pnpm changeset status`가 "일부 패키지가 바뀌었는데 changeset이 없다"고 실패할 수 있다 — `baseBranch: main` 기준 비교라 `dev`가 `main`보다 앞서 있는 동안은 정상이고, `main` 병합 뒤 해소된다.

## 아키텍처

```text
io       -> model
core     -> model
react    -> core
demo     -> react, io, model
showcase -> react, io, model
```

- `packages/model` (`@cp949/geul-model`): 독자 문서 타입, shape·의미 검증, 표 논리 격자 검증
- `packages/io` (`@cp949/geul-io`): model과 HTML/GFM 사이의 변환 및 HTML sanitize
- `packages/core` (`@cp949/geul-core`): Tiptap을 비공개 구현으로 감싼 headless editor controller
- `packages/react` (`@cp949/geul-react`): React 어댑터. 허용 표면은 [ADR-0002](./docs/adr/0002-enforce-layered-package-boundaries.md) 참조
- `apps/demo`: 배포된 패키지 공개 API를 사용하는 통합 데모
- `apps/showcase`: react 어댑터 공개 표면 쇼케이스(디자인·UX 확인, 에이전트 주도 UX 결함 탐지)
- `fixtures/consumer`: `dist`와 package exports만 사용하는 소비자 검증 fixture

패키지 경계 불변식(비의존·타입 비노출 상세)은 [ADR-0002](./docs/adr/0002-enforce-layered-package-boundaries.md)가 소유한다.

## 설계 기준선

[BlockNote](https://github.com/TypeCellOS/BlockNote) v0.54.0의 공개 문서와 동작을 제품 기능 기준선으로 참고한다. BlockNote의 소스 코드, 컴포넌트, 스타일, 아이콘은 복사하지 않는다. 공개 API, 저장 모델, 패키지 경계와 시각 디자인은 독자적으로 설계한다.

## 문서 지도

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
