---
description: 이슈를 검토하고 작업 브랜치에서 구현·자체 리뷰까지 수행한다
argument-hint: <이슈번호>
---

이슈 `#$1`을 구현한다. 이 세션에 앞선 맥락이 없다고 가정하고 필요한 문서를 직접 읽는다.

## 전제

인자가 없으면 정지한다.

```
에러: 이슈 번호가 필요하다 — /issue-work <이슈번호>
```

## 절차

1. `AGENTS.md`의 "작업 시작 순서" 1~8을 실행하고 `gh issue view $1 --comments`로 본문과 댓글을 읽는다.
2. 작업 폴더를 정한다. `_works/`에 이 이슈의 미완료 폴더(`meta.md` 상태가 `등록 완료`가 아닌 것)가 있으면 새로 만들지 않고 이어받는다. 없으면 `_works/<오늘 yyyyMMdd>-<NN>-issue$1-<slug>/`를 만들고 `handoff/`, `pending-issues/`와 `meta.md`를 함께 만든다. `NN`은 그날 순번이다.
3. superpowers `brainstorming` → `writing-plans` → `subagent-driven-development` 순으로 진행한다. 의사결정이 필요한 지점은 추측하지 말고 사용자에게 묻는다.
4. 첫 커밋이 필요한 시점에 `dev`에서 `<type>/$1-<slug>` 브랜치를 만들고 `meta.md`에 기록한다. worktree를 만들지 않고 subagent에도 worktree 격리를 주지 않는다.
5. 구현 후 자체 리뷰와 수정을 한다.
6. 변경 범위 focused 검증을 실행한다. `pnpm verify` 전량은 이 단계에서 실행하지 않는다 — 리뷰 세션의 수정이 뒤따르므로 `/merge-dev`가 실행한다.
7. `implementation-report.md`를 쓴다.
8. `meta.md` 상태를 `리뷰 대기`로 바꾸고 진행 로그에 한 줄 덧붙인다.

## meta.md 형식

```markdown
---
작업 브랜치: <type>/$1-<slug>
대상 이슈: #$1
상태: 구현 중
시작: <yyyy-MM-dd>
---

## 진행 로그

- <yyyy-MM-dd> /issue-work 시작
```

## implementation-report.md

형식은 `AGENTS.md`의 "완료 보고"를 따른다. 커밋 해시를 쓰지 않는다 — 이 시점의 해시는 squash로 사라진다. 참조는 작업 브랜치명, 파일 경로와 줄 번호, 테스트 제목, 검증 명령 출력으로 한다.

## 정지 조건

squash, `dev` 병합, push, GitHub 쓰기를 하지 않는다. 범위 밖에서 발견한 항목은 `pending-issues/`에 초안으로 남긴다.

보고: 작업 폴더 경로, 작업 브랜치명, 커밋 수, 미해결 항목, 실행한 검증과 결과.
