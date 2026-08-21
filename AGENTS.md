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
7. 관련 `docs/pitfalls/`의 `ACTIVE` 항목: 재발 방지 규칙과 검증 방법
8. 관련 `docs/reviews/`, 대상 코드와 기존 테스트: 완료 증거와 현재 동작

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

- `model`과 `io`는 DOM, React, Tiptap, ProseMirror에 의존하지 않는다.
- 저장 원본은 Tiptap JSON이 아닌 독자 `{ formatVersion, revision, blocks }` JSON이다.
- 모든 블록, 행, 열과 셀은 안정 ID를 가진다.
- 외부 입력 실패는 예상 가능한 예외 대신 구조화된 `Result<T, E>`로 반환한다.
- HTML warning fact는 raw HAST에서 수집할 수 있지만 의미 변환에는 sanitized HAST만 사용한다.
- HTML/GFM importer와 core는 `@cp949/geul-model`의 공통 canonicalization·validation 계약을 사용한다.
- `core`의 공개 `.d.ts`에 `@tiptap/*` 또는 `prosemirror-*` 타입을 노출하지 않는다.
- `react`는 `@tiptap/react`에 의존하지 않고 core의 공개 mount/command API와 저장 표현 직렬화 계약만 사용한다.
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
- 현재 범위 밖에서 발견한 작업은 `_works/<작업 폴더>/pending-issues/`에 초안으로 기록하고 현재 변경에 섞지 않는다. GitHub 등록은 사용자 지시를 기다린다.
- 다른 단계에서도 재발할 함정은 `docs/pitfalls/` 상세 문서와 INDEX에 예방 규칙·검증 방법과 함께 기록한다.
- 단계 또는 릴리스 검증이 끝나면 관련 `docs/reviews/` 완료 문서의 최신 판정과 증거를 갱신한다.

## 문서 책임

- 제품 범위와 기능 상태: `docs/product/blocknote-free-feature-inventory.md`
- 릴리스 배정과 완료 조건: `docs/product/roadmap.md`
- 현재 단계와 다음 작업: `docs/product/current-status.md`
- 승인된 기능·기술 계약: `docs/specs/`
- 장기 아키텍처 결정과 이유: `docs/adr/`
- 실행 계획과 진행 상태: GitHub Issues
- 반복 실패 예방 규칙: `docs/pitfalls/`
- 단계별 완료 판정과 증거: `docs/reviews/`
- 프로젝트 공통 언어: `CONTEXT.md`
- 세션 간 인계와 등록 전 초안: `_works/`(gitignore, 저장소 이력에 남기지 않음)

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

`pnpm verify`는 lint, build, typecheck, unit test, package boundary, license와 E2E 회귀 게이트(`test:e2e` — chromium 전량, firefox·webkit은 `@core` 부분집합)를 포함한다. 실패가 있으면 baseline 실패와 현재 변경이 만든 실패를 구분하고 성공으로 보고하지 않는다.

성능 기준선 spec(`e2e/table-performance.spec.ts`)은 게이트가 아니라 측정 도구라 `perf` 프로젝트로 분리했고 `pnpm verify`에 포함하지 않는다. 표 편집·클립보드 붙여넣기·undo의 성능 특성을 바꾸는 변경에서는 `pnpm test:e2e:perf`를 따로 실행하고 결과를 `docs/product/performance-baseline.md`에 갱신한다.

문서만 변경한 경우 최소 `pnpm lint`, `git diff --check`, `git status --short`를 실행한다. 문서가 명령, 패키지 경계, 기능 상태 또는 공개 계약을 설명하면 관련 코드와 설정도 대조한다.

## Git과 작업공간

기본 통합 브랜치는 `dev`다. 구현은 `dev`에서 분기한 작업 브랜치에서 하고 정리된 커밋만 `dev`로 되돌린다. `dev`에서 `main`으로의 병합은 사용자가 직접 한다. 에이전트는 `main`을 대상으로 merge, rebase와 push를 하지 않는다.

### 작업 브랜치 수명

1. 브레인스토밍과 조사는 `dev`에서 한다. 첫 커밋이 필요한 시점에 `dev`에서 `<type>/<이슈번호>-<slug>` 브랜치를 만든다. 이슈가 없으면 번호를 생략한다. worktree는 만들지 않는다.
2. 구현 세션은 세분화된 커밋을 작업 브랜치에 그대로 누적하고 정지한다. squash도 병합도 하지 않는다.
3. 리뷰 세션은 핸드오프를 받아 같은 작업 브랜치에서 수정 커밋을 이어 쌓는다.
4. 리뷰가 끝나면 `pnpm verify` 전량을 통과시킨 뒤 작업 브랜치에서 커밋을 의미 단위로 squash한다.
5. `git switch dev` 후 `git merge --ff-only <작업 브랜치>`로 이전한다. ff가 거절되면 작업 브랜치에서 `git rebase dev`를 먼저 한다.
6. 이전이 끝나면 `git branch -d <작업 브랜치>`로 삭제하고 백업 ref를 정리한다.
7. 작업 브랜치는 push하지 않는다. push 대상은 `dev`뿐이고 명시적 지시를 기다린다.

리뷰 세션을 거치지 않은 구현은 `dev`에 병합하지 않는다. 사용자가 그 세션에서 리뷰 생략을 명시 지시한 경우에만 예외로 한다.

작업 브랜치는 이슈당 하나이고 여러 개가 동시에 존재할 수 있다. 각각 `dev`에서 분기한다. 앞 작업의 산출물이 필요한 의존 작업일 때만 그 브랜치에서 분기하고 의존을 핸드오프에 명시한다.

### 커밋 해시 참조

커밋 해시는 작업 브랜치가 `dev`로 이전되는 순간에만 불변이 된다. 이전 전에는 이슈, 댓글, 초안과 핸드오프 어디에도 해시를 쓰지 않는다. 참조는 작업 브랜치명, 파일 경로와 줄 번호, 테스트 제목, 검증 명령 출력으로 한다. 이전 후 확정된 해시를 한 번만 기록한다.

### 로컬 작업공간

저장소 이력에 남기지 않는 작업 산출물은 `_works/<yyyyMMdd>-<NN>-<slug>/`에 둔다. `_works/`는 gitignore 대상이다. 이슈가 있으면 slug 앞에 `issue<번호>-`를 붙인다(`20260822-01-issue26-editmap-perf`).

| 경로 | 내용 |
| --- | --- |
| `meta.md` | 작업 브랜치, 대상 이슈, 상태와 진행 로그. 세션이 재개 지점을 판단하는 근거다 |
| `implementation-report.md` | 구현 세션의 1차 작업 결과 |
| `handoff/NN.md` | 리뷰 요청 핸드오프와 그 리뷰 결과 |
| `pending-issues/NN-<slug>.md` | 등록 전 이슈·댓글 초안 |
| `final-report.md` | 병합 후 최종 결과 |

`meta.md`의 상태는 `구현 중` → `리뷰 대기` → `리뷰 완료` → `병합 완료` → `보고 완료` → `등록 완료` 순으로 전이한다. 각 단계는 앞 단계 산출물이 있어야 시작한다. 없으면 추측해서 진행하지 않고 무엇이 없는지 보고하고 정지한다.

작업 폴더를 인자로 받는 절차는 접두 매칭을 허용한다. `20260822-01`처럼 앞부분만 주어도 `_works/` 아래에서 유일하게 매칭되면 그 폴더로 해석한다. `_works/` 접두사는 붙여도 생략해도 된다. 매칭이 없거나 둘 이상이면 후보를 출력하고 정지한다.

### 공통 규칙

- 작업 시작과 종료 시 현재 branch, worktree와 `git status --short`를 확인한다.
- 기존 modified, untracked와 ignored 파일은 사용자 작업으로 간주하고 보존한다.
- 요청받지 않은 파일을 되돌리거나 광범위하게 정리하지 않는다.
- worktree는 사용자가 그 세션에서 명시적으로 요청한 경우에만 만든다. 병렬 에이전트에도 worktree 격리를 기본으로 주지 않는다.
- `커밋` 요청은 현재 범위의 로컬 커밋만 허용한다. 작업 브랜치를 `dev`로 ff-only 이전하는 merge는 완료 절차의 일부다. 그 외 merge, push, tag와 PR 생성은 각각 별도 요청이 필요하다.
- push는 사용자가 그 세션에서 명시적으로 지시하기 전까지 실행하지 않는다. "작업 후 한번에" 같은 유예 답변은 완료 판단 시 자동 실행해도 된다는 허가가 아니다.
- 커밋 squash 절차와 무결성 검증은 [`PIT-0021`](./docs/pitfalls/PIT-0021-verify-regrouped-commits-against-a-backup-ref.md)을 따른다. 백업 ref 없이 재조립하지 않는다.
- merge conflict는 양쪽 변경 의도를 확인해 해결하고 전체 병합 결과를 다시 검증한다.
- `git reset --hard`, 강제 push와 광범위한 `git clean`을 사용하지 않는다.
- generated dist를 제거해야 하면 정확한 package 경로와 상태를 먼저 확인하고 해당 경로만 처리한다.

## 완료 보고

결론을 먼저 제시하고 다음을 구분한다.

- 확인된 사실과 아직 검증하지 않은 가정
- 변경한 계약과 파일
- RED/GREEN 또는 재현/해결 증거
- 실행한 검증과 결과
- 남은 제한, 위험과 후속 Issue
- commit, merge, push와 PR의 실제 수행 여부
