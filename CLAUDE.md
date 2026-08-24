# Claude Code 지침

모든 공통 실행 규칙은 `AGENTS.md`를 따른다. 공통 규칙을 이 파일에 중복해서 추가하지 않는다.

## qq-workflow와 ff-workflow

레인 선택은 `AGENTS.md`의 "레인 선택 규칙"이 소유한다 — 사용자가 레인을 명시하면 그 레인, 레인 명시 없는 이슈 작업은 에이전트가 qq/ff를 자동 선택하고 이유를 보고한다. 두 흐름 모두 슬래시 커맨드가 없다 — 사용자가 단계·트랙과 작업 폴더를 프롬프트로 지정한다.

단계·트랙 목록, 절차와 산출물 계약은 각각 `docs/agents/qq-workflow.md`, `docs/agents/ff-workflow.md`가 소유한다. 여기에 복제하지 않는다.

## Agent skills

### 이슈 트래커

작업은 `cp949/geul` GitHub Issues에서 관리한다. 자세한 내용은 `docs/agents/issue-tracker.md`를 참조한다.

### 도메인 문서

이 저장소는 single-context 도메인 문서 구조를 사용한다. 자세한 내용은 `docs/agents/domain.md`를 참조한다.
