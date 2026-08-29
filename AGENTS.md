# 저장소 에이전트 실행 계약

이 문서는 Claude Code와 Codex를 포함한 모든 에이전트가 따르는 공통 실행 규칙이다. 문서별 상세 형식과 갱신 시점은 `docs/process/development-lifecycle.md`가 소유한다.

## 작업 시작 순서

작업 전에 다음 순서로 범위와 계약을 확인한다.

1. `docs/product/current-status.md`: 현재 단계와 바로 다음 작업
2. 관련 GitHub Issue: 목표, 포함·제외 범위, 실행 계획과 완료 기준
3. `CONTEXT.md`: 프로젝트 고유 용어와 피해야 할 혼동 표현
4. `docs/product/blocknote-free-feature-inventory.md`: 기능 ID, 목표 수준과 현재 검증 상태
5. `docs/product/roadmap.md`: 릴리스 배정, 구현 순서와 단계 완료 조건
6. 관련 `docs/specs/`와 `docs/adr/`: 승인된 계약과 장기 결정 이유
7. `docs/guides/INDEX.md`에서 작업 조건에 맞는 개발 가이드
8. `docs/pitfalls/INDEX.md`에서 적용 조건이 현재 작업과 맞는 `ACTIVE` 함정: 반복 실수의 오해 신호와 탐지법 — 가이드 선택과 별개 판단이다
9. 관련 `docs/reviews/`, 대상 코드와 기존 테스트: 완료 증거와 현재 동작

이슈 트래커와 도메인 문서 소비 규칙은 각각 `docs/agents/issue-tracker.md`, `docs/agents/domain.md`를 따른다.

문서가 충돌하면 각 문서의 책임 범위와 코드·테스트의 현재 사실을 대조한다. 제품 범위나 공개 계약을 임의로 바꾸지 않고 사용자 결정이 필요한 지점을 보고한다.

특정 worktree, branch, commit 범위, handoff, Issue 또는 spec을 지정받으면 그것을 실행 범위로 취급한다.

## 아키텍처 불변식

패키지 의존 방향은 다음과 같다.

```text
io    -> model
core  -> model, io
react -> core
demo  -> react, io, model
```

- `model`과 `io`의 DOM·프레임워크 비의존 불변식은 `docs/adr/0002-enforce-layered-package-boundaries.md`(ADR-0002)가 소유한다.
- 저장 원본은 Tiptap JSON이 아닌 독자 `{ formatVersion, revision, blocks }` JSON이다.
- 모든 블록, 행, 열과 셀은 안정 ID를 가진다.
- 외부 입력 실패는 예상 가능한 예외 대신 구조화된 `Result<T, E>`로 반환한다.
- HTML warning fact는 raw HAST에서 수집할 수 있지만 의미 변환에는 sanitized HAST만 사용한다.
- HTML/GFM importer와 core는 `@cp949/geul-model`의 공통 canonicalization·validation 계약을 사용한다.
- `core`의 공개 타입 비노출 불변식은 `docs/adr/0002-enforce-layered-package-boundaries.md`(ADR-0002)가 소유한다.
- `react`의 core 의존 허용 표면은 `docs/adr/0002-enforce-layered-package-boundaries.md`(ADR-0002)가 소유한다.
- table은 R0에서 model과 HTML/GFM 변환만 지원한다. 편집기가 지원하지 않는 문서는 변경 없이 `EDITOR_FEATURE_UNAVAILABLE`로 거절한다.
- 외부 npm 의존성은 exact version을 사용하고 내부 workspace 패키지만 `workspace:*`를 사용한다.

## 구현 규칙

- 기능 또는 버그 수정은 회귀 테스트를 먼저 추가하고 RED를 확인한 뒤 GREEN 구현을 한다.
- 기존 테스트를 삭제하거나 assertion을 약화해 통과시키지 않는다.
- 테스트 제목(`describe`/`it`/`test`)은 한글로 쓴다. API 식별자, 오류 코드와 `it.each` 플레이스홀더는 원문을 유지한다.
- `describe` 직속 `it`이 20개 이상이면 관심사 단위 파일로 나눈다. 분할은 순수 이동으로 하고, 테스트 제목 집합과 총 개수가 변하지 않음을 `vitest run --reporter=json`으로 확인한다.
- 공개 계약을 바꾸면 model, io, core, React adapter와 consumer fixture에 미치는 영향을 확인한다.
- BlockNote의 소스 코드, 컴포넌트, 스타일과 아이콘을 복사하지 않는다.
- `xl-*`, `@blocknote/*`, `@tiptap-pro/*`, GPL/AGPL 또는 상용 라이선스 패키지를 추가하지 않는다.
- 새 런타임 의존성이 필요하면 추가 전에 필요성과 라이선스 영향을 사용자에게 알린다.
- 의존성을 추가하거나 변경하면 `docs/product/dependency-licenses.md`와 license 검사를 함께 갱신한다.
- 생성된 `dist`, `coverage`, `.turbo`, `.vite`, `playwright-report`, `test-results`를 소스처럼 편집하거나 커밋하지 않는다.
- 현재 범위 밖에서 발견한 작업은 현재 변경에 섞지 않는다. 기록 위치는 레인이 정한다 — 아래 "Git과 작업공간". GitHub 게시·종료 권한은 `docs/agents/issue-tracker.md`가 소유한다.
- 정상 구현 경로가 없거나 불명확하면 `docs/guides/`를 추가·보강한다. 가이드나 명시적 계약을 따르지 않았거나 모호하게 해석해 반복된 실수만 `docs/pitfalls/`에 기록한다.
- 단계 또는 릴리스 검증이 끝나면 관련 `docs/reviews/` 완료 문서의 최신 판정과 증거를 갱신한다.

## 문서 책임

- 제품 범위와 기능 상태: `docs/product/blocknote-free-feature-inventory.md`
- 릴리스 배정과 완료 조건: `docs/product/roadmap.md`
- 현재 단계와 다음 작업: `docs/product/current-status.md`
- 승인된 기능·기술 계약: `docs/specs/`
- 장기 아키텍처 결정과 이유: `docs/adr/`
- 실행 계획과 진행 상태: GitHub Issues
- 단계별 완료 판정과 증거: `docs/reviews/`
- 프로젝트 공통 언어: `CONTEXT.md`
- 반복 작업의 정상 구현·검증 경로: `docs/guides/`
- 가이드 미준수·모호한 해석으로 반복된 실수의 탐지: `docs/pitfalls/`
- ff-workflow 절차와 `_works/` 작업공간: `docs/agents/ff-workflow.md`
- qq-workflow 절차와 계획서 형식: `docs/agents/qq-workflow.md`
- 큰 Issue·슬라이스의 RD 의존 DAG와 자동 재계획: `docs/agents/roadmap-workflow.md`

같은 사실을 여러 문서에 원본처럼 복제하지 않는다. 문서 생성, 갱신과 종료 조건은 `docs/process/development-lifecycle.md`를 따른다.

## 검증

변경 범위에 맞는 focused 검증을 먼저 실행하고 완료를 보고하기 전 최종 게이트를 실행한다.

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
pnpm --filter @cp949/geul-react typecheck
pnpm test
pnpm verify
git diff --check
git status --short
```

`pnpm verify`는 lint, build, typecheck, unit test, package boundary, license와 E2E 회귀 게이트(`test:e2e` — chromium 전량)를 포함한다. firefox·webkit(`@core` 부분집합)은 기본 게이트에서 제외돼 있다 — 필요할 때 `pnpm test:e2e:full`(chromium·firefox·webkit)로 실행한다. 실패가 있으면 baseline 실패와 현재 변경이 만든 실패를 구분하고 성공으로 보고하지 않는다.

성능 기준선 spec(`e2e/table-performance.spec.ts`)은 게이트가 아니라 측정 도구라 `perf` 프로젝트로 분리했고 `pnpm verify`에 포함하지 않는다. 표 편집·클립보드 붙여넣기·undo의 성능 특성을 바꾸는 변경에서는 `pnpm test:e2e:perf`를 따로 실행하고 결과를 `docs/product/performance-baseline.md`에 갱신한다.

문서만 변경한 경우 최소 `pnpm lint`, `git diff --check`, `git status --short`를 실행한다. 문서가 명령, 패키지 경계, 기능 상태 또는 공개 계약을 설명하면 관련 코드와 설정도 대조한다.

## Git과 작업공간

기본 통합 브랜치는 `dev`다. `dev`에서 `main`으로의 병합은 사용자가 직접 한다. 에이전트는 `main`을 대상으로 merge, rebase와 push를 하지 않는다.

### 상위 roadmap-workflow

하나의 qq-workflow나 ff-workflow로 끝까지 추적하기 큰 Issue·슬라이스는 [`docs/agents/roadmap-workflow.md`](./docs/agents/roadmap-workflow.md)에 따라 독립 완료 결과인 `RD-NNN` 의존 DAG로 나눈다. roadmap-workflow는 별도 레인이 아니다. 각 RD가 아래 세 레인 중 하나를 사용한다.

### 세 가지 작업 레인

|           | 기본                           | qq-workflow                                                  | ff-workflow                                                  |
| --------- | ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 진입      | 이슈 대상이 아닌 작업의 기본값 | 사용자 지시 또는 이슈 작업 자동 선택                         | 사용자 지시 또는 이슈 작업 자동 선택                         |
| 커밋      | `dev` 직접                     | `dev`에서 분기한 작업 브랜치                                 | `dev`에서 분기한 작업 브랜치                                 |
| 리뷰      | 없음                           | 병합 전 1회(단계-3)                                          | 트랙-2, 트랙-5, 트랙-6                                       |
| 산출물    | 없음                           | `_works/<작업 폴더>/` 최소 구성                              | `_works/<작업 폴더>/`                                        |
| 절차 원본 | 아래 "기본 레인"               | [`docs/agents/qq-workflow.md`](./docs/agents/qq-workflow.md) | [`docs/agents/ff-workflow.md`](./docs/agents/ff-workflow.md) |

**레인 선택 규칙.**

- 사용자가 레인을 명시하면 그 레인으로 진행한다.
- 사용자가 roadmap-workflow를 명시하면 그 흐름으로 진행한다.
- 레인 명시 없이 GitHub 이슈를 지목해 구현·수정을 지시하면 먼저 roadmap-workflow 진입 여부를 판정한다. 독립 완료 결과가 둘 이상이거나 전체 범위가 ff-workflow 실행 DELTA 7개 상한을 넘거나 선행 순서가 불확실하면 roadmap-workflow를 선택한다. 그 외에는 ff-workflow의 "크기 규칙"으로 예상 변경이 DELTA 하나 크기에 들어오면 qq, 넘으면 ff를 선택한다. 선택한 흐름·레인과 이유 한두 문장을 작업 시작 시 사용자에게 보고한다.
- 이슈 대상이 아닌 작업은 지시가 없으면 기본 레인으로 진행한다. 에이전트는 지시 없이 qq·ff로 들어가지 않는다.
- 레인은 작업을 시작할 때 정해지고 중간에 바뀌지 않는다. 독립 qq·ff 작업이 예상보다 커져도 에이전트가 승격하지 않는다 — 커진 사실은 "완료 보고"의 남은 제한과 위험에 적고 판단은 사용자에게 남긴다. roadmap 하위 작업은 같은 레인을 유지한 채 roadmap-workflow의 자동 재계획을 적용한다.
- roadmap-workflow의 RD·DELTA 순서 변경은 레인 변경이 아니다. readiness probe가 작업 브랜치 생성 전에 하위 레인 선택을 고치는 경우도 레인 중간 변경으로 보지 않는다.

### 기본 레인

1. `dev`에 직접 커밋한다. 작업 브랜치를 만들지 않는다.
2. 커밋 전 변경 범위에 맞는 focused 검증을 실행한다(위 "검증").
3. 별도 리뷰 세션이 없다. 되돌릴 일이 생기면 `git revert`로 한다.
4. 현재 범위 밖에서 발견한 결함은 사용자에게 보고하고 지시를 기다린다. `_works/` 초안을 만들지 않는다.
5. push는 사용자가 그 세션에서 명시적으로 지시하기 전까지 실행하지 않는다.

### qq-workflow

단계 1~4의 절차, 계획서 형식과 `_works/` 작업 폴더 구성은 [`docs/agents/qq-workflow.md`](./docs/agents/qq-workflow.md)가 소유한다. 이 문서에 복제하지 않는다.

### ff-workflow

트랙 0~8의 절차, 작업 브랜치 수명, `_works/` 작업공간, 커밋 해시 참조와 재그룹화 실행 명령은 [`docs/agents/ff-workflow.md`](./docs/agents/ff-workflow.md)가 소유한다. 이 문서에 복제하지 않는다.

### roadmap-workflow

RD 상태·의존 DAG, readiness probe, DELTA 계획 예산과 자동 재계획은 [`docs/agents/roadmap-workflow.md`](./docs/agents/roadmap-workflow.md)가 소유한다. 하위 RD의 커밋·merge·push 승인 경계는 선택한 qq·ff 레인을 그대로 따른다.

### 공통 규칙

두 레인 모두에 적용된다.

- 작업 시작과 종료 시 현재 branch, worktree와 `git status --short`를 확인한다.
- 기존 modified, untracked와 ignored 파일은 사용자 작업으로 간주하고 보존한다.
- 요청받지 않은 파일을 되돌리거나 광범위하게 정리하지 않는다.
- worktree는 사용자가 그 세션에서 명시적으로 요청한 경우에만 만든다. 병렬 에이전트에도 worktree 격리를 기본으로 주지 않는다.
- `커밋` 요청은 현재 범위의 로컬 커밋만 허용한다. merge, push, tag와 PR 생성은 각각 별도 요청이 필요하다. 예외: qq-workflow의 단계-1 계획 승인과 ff-workflow의 트랙-8 실행 지시는 작업 브랜치의 해당 종료 단계 `dev` fast-forward merge까지 허가한다. push, tag와 PR 생성은 두 레인에서도 별도 요청이 필요하다.
- push는 사용자가 그 세션에서 명시적으로 지시하기 전까지 실행하지 않는다. "작업 후 한번에" 같은 유예 답변은 완료 판단 시 자동 실행해도 된다는 허가가 아니다.
- 편집기를 여는 git 명령(`git rebase -i`, `-m` 없는 `git commit`·`git commit --amend`·`git tag -a`, `--no-edit` 없는 `git merge`)을 쓰지 않는다. 에이전트 세션은 `GIT_EDITOR=true`라 입력 없이 기본값으로 조용히 성공한다 — [`PIT-0023`](./docs/pitfalls/PIT-0023-editor-opening-git-commands-succeed-silently.md).
- merge conflict는 양쪽 변경 의도를 확인해 해결하고 전체 병합 결과를 다시 검증한다.
- `git reset --hard`, 강제 push와 광범위한 `git clean`을 사용하지 않는다.
- generated dist를 제거해야 하면 정확한 package 경로와 상태를 먼저 확인하고 해당 경로만 처리한다.

## 완료 보고

결론을 먼저 제시하고 다음을 구분한다.

- 확인된 사실과 아직 검증하지 않은 가정
- 변경한 계약과 파일
- RED/GREEN 또는 재현/해결 증거
- 실행한 검증과 결과
- 남은 제한, 위험과 후속 이슈 초안
- commit, merge, push와 PR의 실제 수행 여부
