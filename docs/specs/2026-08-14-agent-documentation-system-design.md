# 에이전트 중심 문서 체계 설계

## 1. 결정 요약

Geul 저장소는 Matt Pocock 엔지니어링 스킬이 사용하는 이슈 트래커와 도메인 문서 계약을 기존 제품 문서 체계에 통합한다.

- GitHub Issues는 발견 작업, 실행 계획, 체크리스트와 진행 상태의 단일 기준이다.
- 저장소 문서는 제품 계약, 공통 언어, 장기 결정, 반복 실패 예방 규칙과 단계 완료 증거만 보존한다.
- 저장소에 새 실행 plan 문서를 만들지 않는다.
- 기존 도구별 실행 plan 역사 자료와 저장소 follow-up 문서는 제거한다.
- 승인된 장기 spec은 도구 중립 경로인 `docs/specs/`에 보존한다.
- `docs/reviews/`는 단계별 완료 기준과 최종 검증 증거를 보존한다.
- `docs/pitfalls/`는 여러 작업에서 재사용할 예방·검증 지식을 보존한다.
- 저장소는 하나의 Geul 제품 문맥을 가진 single-context 구조를 유지한다.

## 2. 목표와 비목표

### 목표

- 사람과 에이전트가 작업 상태와 영구 지식의 원본을 혼동하지 않게 한다.
- Matt Pocock 스킬이 GitHub Issues와 프로젝트 도메인 문서를 일관되게 소비하게 한다.
- 도구 이름이 영구 문서 경로를 소유하지 않게 한다.
- `AGENTS.md`와 개발 문서 생명주기의 중복을 줄인다.
- 현재 범위 밖 발견 사항을 잃지 않으면서 현재 작업의 범위를 임의로 넓히지 않는다.
- 단계 완료 판정이 일시적인 이슈 진행 기록과 분리되게 한다.

### 비목표

- 제품 코드, 테스트, 의존성 또는 공개 API를 변경하지 않는다.
- `CONTEXT.md`, 기존 ADR, pitfall, product와 review 문서의 의미 계약을 불필요하게 다시 쓰지 않는다.
- `triage` 스킬이 설치되기 전에 triage 라벨 체계를 만들지 않는다.
- PR을 요청 접수 또는 triage 표면으로 사용하지 않는다.
- 과거 plan의 작업 일지나 명령 출력을 다른 문서로 복제하지 않는다.

## 3. 최종 문서 구조

```text
/
├── AGENTS.md
├── CLAUDE.md
├── CONTEXT.md
└── docs/
    ├── agents/
    │   ├── issue-tracker.md
    │   └── domain.md
    ├── product/
    ├── specs/
    ├── adr/
    ├── pitfalls/
    ├── reviews/
    └── process/
        └── development-lifecycle.md
```

| 위치 | 단일 책임 |
| --- | --- |
| `AGENTS.md` | 모든 에이전트가 따르는 공통 실행 규칙과 문서 진입 순서 |
| `CLAUDE.md` | Claude 전용 진입점과 Matt Pocock 스킬 설정 링크 |
| `docs/agents/` | 이슈 트래커와 도메인 문서의 소비 계약 |
| GitHub Issues | 발견 작업, 실행 계획, 체크리스트와 진행 상태 |
| `CONTEXT.md` | 프로젝트 고유 용어와 피해야 할 혼동 표현 |
| `docs/product/` | 제품 범위, 릴리스 순서와 현재 상태 |
| `docs/specs/` | 승인된 기능·기술 계약 |
| `docs/adr/` | 장기 아키텍처 결정과 선택 이유 |
| `docs/pitfalls/` | 반복 가능한 실패의 예방·검증 규칙 |
| `docs/reviews/` | 단계별 완료 기준과 최종 검증 증거 |
| `docs/process/` | 문서 생성·갱신·충돌 처리 생명주기 |

## 4. 에이전트 진입점

### `AGENTS.md`

`AGENTS.md`는 다음 공통 실행 계약만 소유한다.

- 작업 시작 시 확인할 문서와 코드 순서
- 패키지 의존 방향과 공개 경계 불변식
- 회귀 테스트 우선 구현 규칙
- 범위 밖 발견 사항을 별도 이슈 초안으로 분리하는 규칙
- 문서 책임에 따른 갱신 의무
- 변경 범위별 검증 게이트
- dirty 작업공간과 Git 작업 안전 규칙
- 완료 보고에 포함할 사실과 미검증 항목

문서별 상세 형식과 상태 전이는 복제하지 않고 `docs/process/development-lifecycle.md`를 참조한다.

### `CLAUDE.md`

`CLAUDE.md`는 공통 규칙을 복제하지 않는다. `AGENTS.md`를 공통 실행 계약으로 지정하고 `## Agent skills` 아래에서 다음 두 설정 문서를 연결한다.

- 이슈 트래커: `docs/agents/issue-tracker.md`
- single-context 도메인 문서: `docs/agents/domain.md`

`triage` 스킬이 설치되지 않았으므로 triage labels 블록과 `docs/agents/triage-labels.md`는 만들지 않는다.

## 5. 이슈 트래커 계약

`docs/agents/issue-tracker.md`는 `cp949/geul` GitHub Issues를 작업 추적의 단일 기준으로 지정한다. GitHub 작업에는 `gh` CLI를 사용하고 저장소는 현재 Git remote에서 추론한다.

문서는 다음을 정의한다.

- 이슈 생성, 조회, 목록, 댓글, 수정과 종료 명령
- PR을 요청 또는 triage 표면으로 사용하지 않는 설정
- 스킬이 말하는 “이슈 트래커에 게시”와 “관련 티켓 조회”의 의미
- map, child issue, dependency, claim과 resolve를 포함한 wayfinding 작업 규칙
- Geul 작업 이슈의 본문 구성

Geul 작업 이슈는 최소한 다음 정보를 포함한다.

- 목표와 사용자 결과
- 포함·제외 범위
- 관련 product, spec, ADR와 pitfall
- 구현 순서
- 완료 기준
- 검증 명령과 결과
- 남은 제한과 별도 후속 이슈

이슈가 존재한다는 사실만으로 제품 범위가 승인되지는 않는다. 제품 범위는 inventory, roadmap과 승인된 spec이 소유한다.

## 6. 도메인 문서 계약

저장소는 single-context 구조를 사용한다.

- 루트 `CONTEXT.md`는 Geul 공통 언어의 단일 기준이다.
- `docs/adr/`는 장기 결정과 이유의 단일 기준이다.
- `packages/model`, `io`, `core`, `react`는 별도 업무 도메인이 아니라 하나의 Geul 문맥을 구성하는 아키텍처 계층이다.
- `CONTEXT-MAP.md`와 패키지별 `CONTEXT.md`는 실제로 독립된 제품 문맥이 생기기 전에는 만들지 않는다.
- 에이전트 출력은 `CONTEXT.md`의 표준 용어를 사용하고 `_Avoid_` 표현을 피한다.
- ADR과 충돌하는 제안은 조용히 덮어쓰지 않고 충돌과 재검토 이유를 명시한다.

`docs/agents/domain.md`는 이 소비 규칙을 한국어로 설명한다. 전체 작업 시작 순서는 `AGENTS.md`, 문서 갱신 시점은 개발 문서 생명주기를 따른다.

## 7. 작업 생명주기

```text
GitHub Issue
→ 계약 확인 또는 spec 작성
→ Issue에 실행 계획·검증 기준 확정
→ 구현과 RED/GREEN
→ 리뷰·수정
→ docs/reviews 완료 판정
→ 제품·상태 문서 동기화
→ Issue 종료
```

운영 규칙은 다음과 같다.

1. 작업 시작 전에 현재 상태, 이슈 범위, 공통 언어, 제품 범위, 관련 spec·ADR·pitfall과 실제 코드·테스트를 확인한다.
2. 새 제품 또는 공개 기술 계약은 구현 전에 spec으로 확정한다.
3. 되돌리기 어렵고 맥락 없이는 의외이며 실제 대안 간 trade-off가 있었던 결정만 ADR로 기록한다.
4. 실행 순서, 체크리스트와 진행 상태는 GitHub Issue에 기록한다.
5. 기능 또는 버그 수정은 회귀 테스트의 RED를 확인한 뒤 최소 구현으로 GREEN을 만든다.
6. 현재 범위 밖 발견 사항은 별도 이슈 초안으로 만들고 현재 작업에 섞지 않는다. GitHub 등록은 사용자 지시를 기다린다.
7. 반복 가능한 실패 원인과 구체적인 예방·검증 규칙은 pitfall에 반영한다.
8. 단계 완료 보고서는 작업 일지가 아니라 고정 기준, 최종 판정과 재현 가능한 증거만 기록한다.
9. 제품 문서와 완료 증거를 실제 상태에 맞춘 뒤 작업 이슈를 종료한다.

## 8. 문서 충돌 규칙

문서는 각 책임 범위에서 다음 기준을 사용한다.

1. 현재 제품 단계와 다음 작업: `docs/product/current-status.md`
2. 제품 범위와 기능 상태: inventory
3. 릴리스 배정과 완료 조건: roadmap
4. 승인된 기능·기술 계약: spec
5. 장기 선택 이유: ADR
6. 실행 계획과 진행 상태: GitHub Issue
7. 실제 완료 판정과 증거: review
8. 프로젝트 공통 언어: `CONTEXT.md`

코드와 테스트는 현재 구현 사실을 검증하는 근거지만 승인된 제품 범위나 공개 계약을 자동으로 변경하지 않는다. 문서가 자기 책임 범위에서 충돌하면 임의로 하나를 선택하지 않고 코드와 테스트로 현재 사실을 확인한 뒤 사용자에게 결정이 필요한 지점을 보고한다.

## 9. 마이그레이션

다음 순서를 사용한다.

1. 현재 branch, worktree와 dirty 상태를 확인한다.
2. `gh auth status`와 GitHub 대상 저장소를 확인한다.
3. 기존 프로젝트 배포 라이선스 선택 follow-up을 GitHub Issue로 이전한다.
4. 생성된 이슈 번호를 관련 제품·완료 문서에 연결한다.
5. Tiptap MVP spec을 `docs/specs/`로 이동한다.
6. `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`와 개발 문서 생명주기를 한국어로 재작성한다.
7. 도구별 실행 plan 디렉터리, 기존 문서 생명주기 spec과 저장소 follow-up 디렉터리를 삭제한다.
8. README, current-status, review, product와 기타 Markdown 문서의 기존 경로·책임 참조를 갱신한다.
9. 저장소 전체에서 제거된 경로와 책임 표현이 남지 않았는지 확인한다.

이슈 생성에 실패하면 로컬 follow-up 원본을 삭제하지 않고 마이그레이션을 중단한다.

## 10. 검증과 완료 조건

최소 검증은 다음과 같다.

```bash
rg -n 'docs/specs|docs/agents|GitHub Issues' --glob '*.md' .
pnpm lint
git diff --check
git status --short
```

추가로 저장소 전체에서 제거 대상 도구명과 옛 경로가 남지 않았는지 확인한다.

- 모든 Markdown 상대 링크가 실제 파일을 가리킨다.
- `docs/pitfalls/INDEX.md`와 상세 문서 상태가 일치한다.
- R0 완료 기준과 판정 증거가 삭제된 plan 없이도 자체적으로 이해된다.
- `current-status.md`의 다음 작업이 GitHub Issue 기반 R1 계획 승인 흐름을 설명한다.
- 제품 코드, 테스트, 의존성과 공개 API가 변경되지 않는다.
- commit, push와 PR을 수행하지 않는다.

## 11. 위험과 롤백

위험도: 중간

- 저장소 문서 이동·삭제는 Git 이력에서 복원할 수 있다.
- 생성한 GitHub Issue는 삭제하지 않고 종료한 뒤 마이그레이션 취소 사유를 댓글로 남겨 기록을 보존한다.
- 문서 링크 또는 책임 경계 검증이 실패하면 이슈를 종료하지 않고 기존 로컬 문서를 유지한다.
