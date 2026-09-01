# roadmap-workflow

하나의 qq-workflow나 ff-workflow로 끝까지 추적하기 큰 Issue·슬라이스를 독립 완료 결과인 roadmap item(`RD-NNN`)으로 나누고, 준비된 RD부터 실행하는 상위 조정 흐름이다. roadmap-workflow 자체는 작업 레인이 아니다. 각 RD는 이 문서의 "경량 DELTA 사이클"로 실행하고, 특정 DELTA가 승격 조건에 해당할 때만 qq-workflow 또는 ff-workflow를 예외로 쓴다.

## 언제 쓰나

진입 규칙은 [`../../AGENTS.md`](../../AGENTS.md)의 "레인 선택 규칙"이 소유한다. 다음 중 하나면 roadmap-workflow를 쓴다.

- 사용자가 roadmap-workflow를 지목한다.
- 하나의 Issue·슬라이스가 독립적으로 완료·통합 검증할 수 있는 결과 둘 이상을 포함한다.
- 전체 범위가 ff-workflow 실행 DELTA 7개 상한을 넘는다.
- 선행 결과의 실행 순서가 불확실해 하나의 선형 DELTA 계획으로 확정할 수 없다.

단일 결과가 qq-workflow나 ff-workflow 하나에 들어오면 이 흐름을 추가하지 않는다.

## 용어와 계층

```text
Issue / Slice
  └─ roadmap
      ├─ RD-001 → 경량 DELTA 사이클 (승격 시 qq·ff-workflow)
      ├─ RD-002 → 경량 DELTA 사이클 (승격 시 qq·ff-workflow)
      └─ RD-003 → 경량 DELTA 사이클 (승격 시 qq·ff-workflow)
```

- `RD-NNN`: 독립 완료 조건과 통합 검증 결과를 가진 roadmap item이다.
- RD 번호: 안정 참조 ID다. 실행 순서를 뜻하지 않으며 다시 매기지 않는다.
- 의존 DAG: RD 사이의 선행 관계다. 표의 행 순서나 RD 번호로 의존을 암시하지 않는다.
- readiness probe: RD 상세 계획 전에 현재 코드·테스트로 진입 조건을 판정하는 읽기 전용 검사다.

## 작업공간

```text
_works/roadmap/
  roadmap.md
  progress.md
  RD-001.md  RD-002.md  ...
  result/
    RD-001-DELTA-01.md  RD-002-DELTA-01.md  ...
```

active roadmap 작업공간은 `_works/roadmap/` 하나다. Issue·슬라이스별 하위 폴더를 만들지 않는다 — `result/`는 DELTA별 계획·결과 파일을 모으는 고정 하위 폴더이고 이 규칙의 예외다. 한 roadmap 안에서 RD ID를 발급하며 삭제한 ID를 재사용하지 않는다.

새 roadmap을 등록하기 전에 `_works/roadmap/` 상태를 확인한다.

1. 없거나 비어 있으면 새 roadmap 파일을 루트에 만든다.
2. 모든 RD와 전체 통합 검증이 완료된 roadmap이면 아래 "roadmap 정리"에 따라 먼저 archive한다.
3. 미완료 roadmap이면 파일을 유지한다. 새 roadmap으로 덮어쓰거나 `_completed`로 옮기지 않는다. 기존 roadmap을 재개하거나 사용자에게 경합을 보고한다.

이 단계는 `_works/roadmap/`이 새 roadmap 파일만 포함할 때 완료다.

`roadmap.md`는 전체 결과 경계, 상태와 의존 DAG를 소유한다. `RD-NNN.md`는 해당 결과의 진입 조건, 포함·제외 범위, 예상 DELTA 백로그, 완료 조건 체크리스트와 확정 결정을 소유한다. DELTA별 상세 계획·파일 목록·결과는 `result/RD-NNN-DELTA-NN.md`가 소유한다(승격된 DELTA는 예외로 해당 qq·ff 작업 폴더가 소유한다). `progress.md`는 readiness probe, RD 전환과 숨은 의존 발견 이력을 append한다.

실행 계획과 제품 진행 상태의 원본은 GitHub Issue다. `_works/roadmap/`은 실행 중 조정 작업공간이며 승인된 제품 범위·spec·roadmap을 대신하지 않는다.

`RD-NNN.md`는 다음 형식을 쓴다.

```markdown
# RD-NNN — <독립 완료 결과>

- 상태: CANDIDATE | READY | ACTIVE | BLOCKED | DONE
- 의존: RD-NNN | 없음
- blocked by: RD-NNN | 계약 결정 | 외부 조건 | 없음

## 결과
## 진입 조건
## 포함 범위
## 제외 범위

## 예상 DELTA (참고용 — 확정 아님, 언제든 추가·삭제·수정)

- [ ] DELTA-01: <한 줄 스코프>

## 완료 조건

- [ ] 조건 1: <검증가능 문장> — 증거: <미충족>

## 결정
```

결정은 주제, 결정, 근거와 틀렸을 때 비용을 기록한다. 예상 DELTA는 한 줄 스코프만 적는다 — 상세 계획(변경 대상·완료 조건과 검출 변이·검증 명령·적용 가이드와 함정)은 그 DELTA를 시작할 때 `result/RD-NNN-DELTA-NN.md`에 채운다.

## RD 상태

```text
CANDIDATE → READY → ACTIVE → DONE
                 ↘ BLOCKED
```

- `CANDIDATE`: 결과 경계만 있고 readiness probe를 통과하지 않았다.
- `READY`: 모든 선행 RD가 `DONE`이고 readiness probe가 진입 가능으로 판정했다.
- `ACTIVE`: 이 RD에 속한 DELTA 사이클이 하나 이상 시작됐고 아직 완료 조건 체크리스트가 다 차지 않았다. 여러 RD가 동시에 `ACTIVE`일 수 있다.
- `BLOCKED`: 선행 RD, 계약 결정 또는 외부 조건이 없어 진행할 수 없다. `blocked by`와 근거를 함께 기록한다.
- `DONE`: 완료 조건 체크리스트 전체를 체크하고 최종 재대조를 마쳤다.

## roadmap 작성

현재 계약과 Issue를 대조해 다음만 확정한다.

1. Issue·슬라이스 사용자 결과와 전체 포함·제외 범위
2. 독립 완료 가능한 RD 결과와 완료 조건
3. 확인된 의존 edge와 각 RD 진입 조건
4. 전체 완료 조건과 최종 통합 검증

미래 RD는 결과와 진입 조건만 둔다. DELTA, 파일 목록, 테스트 건수와 실행 순서를 미리 확정하지 않는다. 사용자가 roadmap을 승인하면 결과 경계와 전체 범위를 승인한 것이다. 실행 순서 변경까지 다시 승인한 것은 아니며, 아래 "자동 재계획" 규칙이 순서를 소유한다.

`roadmap.md`의 진행 표는 다음 형식을 쓴다.

```markdown
| RD     | 결과                 | 상태      | 의존   | 진입 조건                    |
| ------ | -------------------- | --------- | ------ | ---------------------------- |
| RD-001 | model 저장 계약      | CANDIDATE | —      | model focused test 실행 가능 |
| RD-002 | production load/save | CANDIDATE | RD-001 | production schema seam 존재  |
```

로드맵 작성 완료 조건:

- 모든 Issue 완료 기준이 RD 하나 이상 또는 전체 완료 조건에 연결된다.
- 모든 RD가 독립 판정 가능한 완료 조건을 가진다.
- DAG에 순환이 없다.
- 첫 readiness probe 대상이 하나 이상 있다.
- 사용자 결정이 필요한 제품 범위·공개 계약이 승인됐다.

완료 조건을 충족한 `roadmap.md`와 `RD-NNN.md`를 사용자에게 제시해 승인을 받는다. 승인 전에는 하위 작업 브랜치를 만들거나 코드를 고치지 않는다. 승인 뒤 실행 순서만 바뀌는 경우에는 다시 묻지 않는다.

## readiness probe

현재 실행 후보 RD만 상세 조사한다. 코드를 고치거나 작업 브랜치를 만들기 전에 다음을 확인한다.

- 필요한 공개 타입·schema·생산 seam이 현재 `dev`에 존재하는가.
- focused build·typecheck 실패가 현재 RD 범위에서 해소 가능한가.
- exhaustiveness consumer나 package boundary가 후속 RD 결과를 먼저 요구하는가.
- 완료 조건을 검증할 test seam과 production 경로가 존재하는가.
- 변경이 예상 패키지·공개 계약 경계를 넘는가.
- 모든 선행 RD가 `DONE`인가.

판정은 하나다.

```text
READY
BLOCKED_BY: RD-NNN
REPLAN_WITHIN_RD
CONTRACT_DECISION_REQUIRED
```

`READY`만 DELTA 사이클을 시작한다. `BLOCKED_BY`는 DAG edge와 상태를 갱신한 뒤 다른 READY RD를 찾는다. `REPLAN_WITHIN_RD`는 RD 결과를 유지한 채 진입 조건이나 내부 책임 경계를 고친 뒤 probe를 다시 실행한다. `CONTRACT_DECISION_REQUIRED`만 사용자에게 묻는다.

## 경량 DELTA 사이클

현재 `ACTIVE`이거나 새로 `READY`가 된 RD는 DELTA를 미리 여러 개 계획하지 않는다. "다음 DELTA 선택" 절차로 DELTA 하나만 골라 계획·구현·리뷰·병합까지 완결하고, 그 결과를 보고 나서 다음 DELTA를 고른다.

roadmap 승인 이후 사용자 승인 게이트 없이 자동 진행한다. 아래 "사용자 결정 경계"에 해당할 때만 멈추고 묻는다.

1. "다음 DELTA 선택" 절차로 DELTA 하나를 정한다.
2. `_works/roadmap/result/RD-NNN-DELTA-NN.md`를 만들고 "## 계획" 절(목적·변경 대상·완료 조건과 검출 변이·검증 명령·적용 가이드와 함정)을 채운다.
3. `dev`에서 분기해 구현한다. 회귀 테스트 RED를 먼저 확인하고 최소 구현으로 GREEN을 만든다.
4. 메인 세션이 직접 완료 조건 대조와 결함 탐지를 한 번에 수행한다 — subagent dispatch 없이 진행한다. DELTA 하나 크기에서는 별도 dispatch 비용이 검토 비용보다 크다.
5. 발견을 수정한다. 회귀 테스트 RED를 먼저 확인하고 기존 테스트를 지우거나 약화해 통과시키지 않는다.
6. `result/RD-NNN-DELTA-NN.md`의 "## 결과" 절(상태·검증·리뷰 발견과 처리·변경 파일·남은 위험)을 채운다.
7. [`./ff-workflow.md`](./ff-workflow.md)의 "재그룹화 실행 명령"을 그대로 써서 재조립하고 `dev`에 ff-only 병합한다. 브랜치를 삭제하고 백업 ref를 정리한다.
8. [`./issue-tracker.md`](./issue-tracker.md)에 따라 GitHub 게시·종료를 판단하고 `docs/history/`에 기록한다.
9. `RD-NNN.md`의 "예상 DELTA" 체크박스와 "완료 조건" 체크리스트를 갱신한다 — 이 DELTA가 충족한 완료 조건이 있으면 체크하고 증거(테스트 제목·명령·`result/` 파일 경로)를 적는다.

커밋 해시 참조, pending-issues·pending-guides·pending-pitfalls, subagent 협업 규칙은 모두 [`./ff-workflow.md`](./ff-workflow.md)를 참조한다 — 복제하지 않는다.

백로그(예상 DELTA)가 늘어나 RD 결과가 실제로는 여러 결과를 담고 있다고 판단되면(하드 상한 없음), 위 "roadmap 작성" 절의 원칙에 따라 RD를 나눈다.

### 승격 예외

구현 중 다음 신호가 나타나면 이 사이클을 멈추고 사용자에게 qq-workflow 또는 ff-workflow로 독립 승격할지 묻는다. 에이전트가 스스로 승격하지 않는다.

- 패키지 경계 또는 공개 API shape 변경, 신규 외부 의존성
- DB migration·production config·credential·보안 경계 변경
- 변경 diff가 [`./ff-workflow.md`](./ff-workflow.md) "크기 규칙"의 DELTA 크기 상한에 근접·초과

승격한 하위 workflow의 `_meta.md`에는 다음 포인터를 추가한다.

```markdown
상위 로드맵: _works/roadmap/roadmap.md#RD-NNN
```

## 다음 DELTA 선택

RD 번호순으로 실행하지 않는다. 기본값은 현재 RD를 이어서 진행하는 것이다 — 다른 RD로 전환하는 것은 예외다.

1. 완료된 DELTA·RD를 백로그·DAG에 반영한다.
2. 현재 `ACTIVE`인 RD가 있고 그 RD의 "예상 DELTA" 백로그에 실행 가능한 다음 항목이 있으면 그것을 선택한다. 다른 RD로 전환하지 않는다.
3. 다음 중 하나에 해당할 때만 전환한다.
   - 현재 RD가 완료 조건 체크리스트를 전부 채워 `DONE`이 됐다.
   - 현재 RD가 `BLOCKED`로 전환됐다.
   - 현재 RD 백로그가 비었고, readiness 재검토로도 새로 추가할 항목이 없다.
   - 사용자가 다른 RD를 먼저 진행하라고 명시적으로 지시했다.
4. 전환이 필요해 `READY` RD가 여럿이면 후속 edge를 가장 많이 여는 RD를 선택한다.
5. 선정한 DELTA가 백로그에 없던 새 발견이면 그 RD의 "예상 DELTA" 절에 한 줄 추가한다.
6. `READY`도 `ACTIVE`도 없으면 누락 의존이나 순환을 판정한다.

## 자동 재계획

원칙:

```text
DELTA 선택은 정상 동작이라 보고 사항이 아니다.
결과 의미 변경은 승인 사항이다.
```

### RD 사이

다른 RD 결과가 실제 선행 조건이면 현재 RD를 `BLOCKED`로 바꾸고 DAG edge를 추가한다. 승인된 전체 범위와 RD 결과 의미가 유지되면 새로 READY가 된 선행 RD를 먼저 실행한다. 순환이 생기면 양쪽이 공유하는 선행 결과를 새 RD로 추출하고 readiness probe를 다시 실행한다.

진행 중인 DELTA에 아직 완료하지 않은 변경이 있으면 그 DELTA를 완결한 뒤 전환한다. 별도 RD로 이동하는 재분할은 커밋된 DELTA 경계에서 수행한다. 브랜치 수명과 의존 branch는 [`./ff-workflow.md`](./ff-workflow.md) 계약을 따른다.

### 사용자 결정 경계

다음 경우에만 자동 진행을 멈추고 사용자에게 묻는다.

- Issue·슬라이스 제품 범위가 확대된다.
- 공개 API, 저장 형식, 보안 경계 또는 승인된 spec 의미가 바뀐다.
- 새 런타임 의존성이 필요하다.
- RD 완료 결과 자체를 바꾸거나 이미 `DONE`인 RD 계약을 깨야 한다.
- DAG 순환을 독립 완료 결과로 해소할 수 없다.

## RD 완료와 roadmap 종료

RD의 "완료 조건" 체크리스트 전체가 체크되면 `DONE`이다. 각 DELTA가 이미 개별적으로 리뷰·`dev` 이전을 마쳤으므로 RD 단위의 별도 게이트는 없다 — 마지막 DELTA 완료 시점에 메인 세션이 완료 조건 전체를 실측 증거와 한 번 더 재대조한다. 재대조를 통과하면 다음을 수행한다.

1. RD 완료 증거와 실제 결과를 `RD-NNN.md`와 `progress.md`에 기록한다.
2. DAG와 나머지 RD의 readiness를 다시 판정한다.
3. Issue 진행 계획·체크리스트 초안을 동기화한다.
4. 제품 기능 상태가 실제로 바뀐 경우에만 lifecycle의 제품 문서 갱신표를 적용한다.

모든 RD가 `DONE`이고 전체 통합 검증이 통과해야 roadmap을 완료한다. 남은 RD가 있는데 개별 기능이 동작한다는 이유로 Issue·슬라이스 완료를 주장하지 않는다.

### roadmap 정리

roadmap 완료 동기화가 끝나면 active 작업공간 전체를 다음 위치로 옮긴다.

```text
_works/_completed/yyyyMMdd-NN-roadmap-<title>/
  roadmap.md
  progress.md
  RD-001.md  RD-002.md  ...
```

- `yyyyMMdd`: archive를 실행한 로컬 날짜다.
- `NN`: 같은 날짜의 `_works/_completed/yyyyMMdd-*-roadmap-*` 중 가장 큰 두 자리 번호 + 1이다. 항목이 없으면 `01`부터 시작한다. 삭제된 번호를 재사용하지 않는다.
- `<title>`: roadmap 결과를 식별하는 짧은 lowercase ASCII kebab-case다. Issue 번호나 slice 번호만으로 이름을 만들지 않는다.
- archive 폴더에는 active `_works/roadmap/`의 파일 전체를 직접 넣는다. `roadmap/` 또는 Issue slug 중간 폴더를 한 번 더 중첩하지 않는다.
- 상대 링크가 archive 뒤에도 같은 폴더 안의 대상을 가리키는지 확인한다.
- `_works/roadmap/`의 이전 파일과 하위 폴더가 남지 않았는지 확인한다. 빈 디렉터리는 제거하거나 다음 roadmap 생성 시 재사용한다.
- `_works/`는 Git ignored 작업공간이다. archive를 위해 root `_completed/`를 만들거나 `.gitignore` 규칙을 추가하지 않는다.

정리 완료 조건:

- archive 폴더가 완료 roadmap의 파일을 전부 포함한다.
- `_works/roadmap/`에 완료 roadmap 파일이 남아 있지 않다.
- 다음 roadmap을 등록할 때 `_works/roadmap/`에는 새 roadmap 파일만 존재한다.
- `git status --short`에 archive 파일이 나타나지 않는다.

## 소유 경계

| 질문                                | 소유자                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| roadmap-workflow 진입 여부          | [`../../AGENTS.md`](../../AGENTS.md)의 "레인 선택 규칙"                      |
| RD 결과·상태·의존 DAG·자동 재계획   | 이 문서                                                                      |
| DELTA 사이클 절차·문서 형식         | 이 문서의 "경량 DELTA 사이클"                                                |
| 재그룹화·커밋 해시 참조·pending 셋  | [`./ff-workflow.md`](./ff-workflow.md)(참조, 복제 없음)                      |
| 승격된 DELTA의 워크플로 절차         | 승격 대상에 따라 [`./ff-workflow.md`](./ff-workflow.md) 또는 [`./qq-workflow.md`](./qq-workflow.md) |
| 제품 범위·릴리스 완료 조건          | [`../product/roadmap.md`](../product/roadmap.md)                             |
| 실행 계획과 진행 상태 원본          | GitHub Issue                                                                 |
| 문서 생성·갱신과 종료 조건          | [`../process/development-lifecycle.md`](../process/development-lifecycle.md) |
| GitHub 게시·종료                    | [`./issue-tracker.md`](./issue-tracker.md)                                   |
