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
- `react`는 `@tiptap/react`에 의존하지 않고 core의 공개 mount/command API만 사용한다.
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
- 현재 범위 밖에서 발견한 작업은 별도 GitHub Issue로 기록하고 현재 변경에 섞지 않는다.
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

`pnpm verify`는 lint, build, typecheck, unit test, package boundary, license와 Chromium E2E를 포함한다. 실패가 있으면 baseline 실패와 현재 변경이 만든 실패를 구분하고 성공으로 보고하지 않는다.

문서만 변경한 경우 최소 `pnpm lint`, `git diff --check`, `git status --short`를 실행한다. 문서가 명령, 패키지 경계, 기능 상태 또는 공개 계약을 설명하면 관련 코드와 설정도 대조한다.

## Git과 작업공간

- 작업 시작과 종료 시 현재 branch, worktree와 `git status --short`를 확인한다.
- 기존 modified, untracked와 ignored 파일은 사용자 작업으로 간주하고 보존한다.
- 요청받지 않은 파일을 되돌리거나 광범위하게 정리하지 않는다.
- 새 branch 또는 worktree는 사용자 요청이나 승인된 Issue 계획에 포함된 경우에만 만든다.
- `커밋` 요청은 현재 범위의 로컬 커밋만 허용한다. merge, push, tag와 PR 생성은 각각 별도 요청이 필요하다.
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
