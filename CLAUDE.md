# Claude Code 지침

모든 공통 실행 규칙은 `AGENTS.md`를 따른다. 공통 규칙을 이 파일에 중복해서 추가하지 않는다.

## 워크플로 커맨드

`.claude/commands/`의 커맨드가 작업 단계를 실행한다. 각 커맨드는 앞선 맥락이 없는 독립 세션에서 실행할 수 있고, 상태는 `_works/<작업 폴더>/meta.md`가 소유한다. 절차 원본은 `AGENTS.md`의 "Git과 작업공간"이며 커맨드는 그것을 참조한다.

| 순서 | 커맨드 | 인자 | 결과 |
| --- | --- | --- | --- |
| 1 | `/a-issue-work` | `<이슈번호>` | 작업 폴더·브랜치 생성, 구현과 자체 리뷰, `implementation-report.md` |
| 2 | `/a-handoff-write` | `<작업폴더> [초점]` | `handoff/NN.md` |
| 3 | `/a-handoff-run` | `<작업폴더>` | 리뷰-수정 커밋, 핸드오프에 리뷰 결과 |
| 4 | `/a-merge-dev` | `[작업폴더]` | `pnpm verify` → squash → `dev` ff-only 이전 → 브랜치 삭제 |
| 5 | `/a-final-report` | `<작업폴더>` | `final-report.md`와 완료 댓글 초안 |
| 6 | `/a-issue-publish` | `[작업폴더]` | 초안을 GitHub에 등록 |
| — | `/a-wip` | `[작업폴더]` | 현황 조회(읽기 전용) |

`/a-merge-dev`는 인자가 없으면 현재 브랜치로 작업 폴더를 역추적한다. `/a-issue-publish`는 인자가 없으면 전체 초안을 대상으로 한다. 작업 폴더 이름을 모르면 인자 없는 `/a-wip`으로 목록을 얻는다.

`dev` push와 `dev` → `main` 병합은 커맨드가 하지 않는다. 사용자가 직접 지시하거나 수행한다.

## Agent skills

### 이슈 트래커

작업은 `cp949/geul` GitHub Issues에서 관리한다. 자세한 내용은 `docs/agents/issue-tracker.md`를 참조한다.

### 도메인 문서

이 저장소는 single-context 도메인 문서 구조를 사용한다. 자세한 내용은 `docs/agents/domain.md`를 참조한다.
