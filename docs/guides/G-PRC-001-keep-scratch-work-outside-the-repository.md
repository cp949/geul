# G-PRC-001 일회성 조사 script는 저장소 밖에서 실행한다

- 상태: `ACTIVE`
- 적용 조건: 재현·분석·일회성 scan용 script 생성

## 실행 규칙

- script는 `mktemp -d`로 만든 저장소 밖 임시 디렉터리에 둔다.
- 장기 유지할 gate만 `scripts/`와 tests에 정식 source로 추가한다.
- 사전 실패는 stash 하나가 아니라 기준 commit의 별도 checkout 또는 검사 대상 파일 수로 대조한다.
- 작업 종료 시 `git status --short --ignored`로 저장소 안 scratch file을 확인한다.

Markdown 보고서와 diff 산출물은 workflow가 지정한 `_works/` 위치에 둘 수 있다.
