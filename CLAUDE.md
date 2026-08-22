# Claude Code 지침

모든 공통 실행 규칙은 `AGENTS.md`를 따른다. 공통 규칙을 이 파일에 중복해서 추가하지 않는다.

## ff-workflow

사용자가 **ff-workflow**를 명시적으로 지시할 때만 그 흐름으로 진행한다. 지시가 없으면 `AGENTS.md`의 "기본 레인"으로 진행한다. 이 흐름에는 슬래시 커맨드가 없다 — 사용자가 트랙과 작업 폴더를 프롬프트로 지정한다.

트랙 목록, 절차와 산출물 계약은 `docs/agents/ff-workflow.md`가 소유한다. 여기에 복제하지 않는다.

## Agent skills

### 이슈 트래커

작업은 `cp949/geul` GitHub Issues에서 관리한다. 자세한 내용은 `docs/agents/issue-tracker.md`를 참조한다.

### 도메인 문서

이 저장소는 single-context 도메인 문서 구조를 사용한다. 자세한 내용은 `docs/agents/domain.md`를 참조한다.
