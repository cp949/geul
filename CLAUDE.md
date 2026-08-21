# Claude Code 지침

모든 공통 실행 규칙은 `AGENTS.md`를 따른다. 공통 규칙을 이 파일에 중복해서 추가하지 않는다.

## 워크플로 커맨드

`a-` 접두 슬래시 커맨드는 **a-workflow**를 실행한다. 사용자가 명시적으로 지시할 때만 쓴다 — 지시가 없으면 `AGENTS.md`의 "기본 레인"으로 진행한다.

커맨드 목록, 실행 순서와 절차 원본은 `docs/agents/a-workflow.md`가 소유한다. 여기에 복제하지 않는다.

## Agent skills

### 이슈 트래커

작업은 `cp949/geul` GitHub Issues에서 관리한다. 자세한 내용은 `docs/agents/issue-tracker.md`를 참조한다.

### 도메인 문서

이 저장소는 single-context 도메인 문서 구조를 사용한다. 자세한 내용은 `docs/agents/domain.md`를 참조한다.
