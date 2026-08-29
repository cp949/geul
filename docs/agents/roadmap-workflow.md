# roadmap-workflow

하나의 qq-workflow나 ff-workflow로 끝까지 추적하기 큰 Issue·슬라이스를 독립 완료 결과인 roadmap item(`RD-NNN`)으로 나누고, 준비된 RD부터 실행하는 상위 조정 흐름이다. roadmap-workflow 자체는 작업 레인이 아니다. 각 RD 구현은 qq-workflow 또는 ff-workflow를 사용한다.

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
      ├─ RD-001 → qq-workflow 또는 ff-workflow
      ├─ RD-002 → qq-workflow 또는 ff-workflow
      └─ RD-003 → qq-workflow 또는 ff-workflow
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
```

active roadmap 작업공간은 `_works/roadmap/` 하나다. Issue·슬라이스별 하위 폴더를 만들지 않는다. 한 roadmap 안에서 RD ID를 발급하며 삭제한 ID를 재사용하지 않는다.

새 roadmap을 등록하기 전에 `_works/roadmap/` 상태를 확인한다.

1. 없거나 비어 있으면 새 roadmap 파일을 루트에 만든다.
2. 모든 RD와 전체 통합 검증이 완료된 roadmap이면 아래 "roadmap 정리"에 따라 먼저 archive한다.
3. 미완료 roadmap이면 파일을 유지한다. 새 roadmap으로 덮어쓰거나 `_completed`로 옮기지 않는다. 기존 roadmap을 재개하거나 사용자에게 경합을 보고한다.

이 단계는 `_works/roadmap/`이 새 roadmap 파일만 포함할 때 완료다.

`roadmap.md`는 전체 결과 경계, 상태와 의존 DAG를 소유한다. `RD-NNN.md`는 해당 결과의 진입 조건, 포함·제외 범위, 완료 조건과 확정 결정을 소유한다. 상세 DELTA와 파일 목록은 현재 실행할 RD의 qq·ff 작업 폴더가 소유한다. `progress.md`는 readiness probe, 순서 변경, 숨은 의존 발견과 자동 재계획 이력을 append한다.

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
## 완료 조건
## 결정
```

결정은 주제, 결정, 근거와 틀렸을 때 비용을 기록한다. DELTA·파일 목록·테스트 건수는 하위 workflow 계획 전에는 쓰지 않는다.

## RD 상태

```text
CANDIDATE → READY → ACTIVE → DONE
                 ↘ BLOCKED
```

- `CANDIDATE`: 결과 경계만 있고 readiness probe를 통과하지 않았다.
- `READY`: 모든 선행 RD가 `DONE`이고 readiness probe가 진입 가능으로 판정했다.
- `ACTIVE`: 현재 qq·ff workflow가 실행 중이다. 한 roadmap에서 하나만 허용한다.
- `BLOCKED`: 선행 RD, 계약 결정 또는 외부 조건이 없어 진행할 수 없다. `blocked by`와 근거를 함께 기록한다.
- `DONE`: 하위 workflow의 리뷰·최종 gate·`dev` 이전과 RD 완료 동기화가 끝났다.

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

`READY`만 하위 workflow를 시작한다. `BLOCKED_BY`는 DAG edge와 상태를 갱신한 뒤 다른 READY RD를 찾는다. `REPLAN_WITHIN_RD`는 RD 결과를 유지한 채 진입 조건이나 내부 책임 경계를 고친 뒤 probe를 다시 실행한다. `CONTRACT_DECISION_REQUIRED`만 사용자에게 묻는다.

## RD 상세 계획과 DELTA 예산

현재 `READY` RD 하나만 상세 계획한다.

- readiness probe가 DELTA 하나의 크기와 완료 경계를 확정하면 qq-workflow를 쓴다.
- 그 외에는 초기 DELTA 1~2개로 ff-workflow를 쓴다. roadmap 하위 ff-workflow는 일반 ff 목표값 `3~5개` 대신 이 절의 예산을 적용한다.
- 초기 분석에서 DELTA 3개 이상이 필요하면 RD 결과를 더 작게 나눌 수 있는지 먼저 검토한다.

DELTA 예산:

```text
초기 계획: 1~2
자동 재계획: 3~4
RD 경계 재검토: 5~7
절대 상한: 7
```

초기 2개는 작업량 예측값이 아니라 숨은 선행 작업과 구현 중 학습을 수용하는 계획 여유다. 완료 조건 하나와 검출 변이가 응집된 작업은 1개로 유지한다. DELTA 수를 맞추려고 나누지 않는다.

roadmap 하위 qq-workflow가 브랜치 생성 전에 두 번째 DELTA 필요성을 발견하면 상위 조정자가 ff-workflow로 다시 선택한다. 이는 시작한 레인의 중간 승격이 아니라 readiness 판정 수정이다. 브랜치 생성 뒤에는 qq-workflow 크기 상한을 유지하고, 추가 결과는 현재 RD의 선행·후속 RD로 분리한다.

하위 작업 폴더의 `_meta.md`에는 다음 포인터를 추가한다.

```markdown
상위 로드맵: _works/roadmap/roadmap.md#RD-NNN
```

## 다음 작업 선택

RD 번호순으로 실행하지 않는다.

1. `DONE` 결과를 DAG에 반영한다.
2. 나머지 RD의 선행 조건을 다시 판정한다.
3. readiness probe가 `READY`인 RD를 찾는다.
4. READY가 여러 개면 가장 많은 후속 edge를 여는 RD를 먼저 선택한다.
5. READY가 없으면 누락 의존이나 순환을 판정한다.

한 RD의 각 DELTA가 끝날 때도 같은 방식으로 남은 DELTA와 상위 RD 의존을 재평가한다. 다음 번호가 아니라 현재 실행 가능한 노드를 선택한다.

## 자동 재계획

원칙:

```text
순서 변경은 보고 사항이다.
결과 의미 변경은 승인 사항이다.
```

### 같은 DELTA 내부

helper·fixture·호출 순서가 예상과 다르면 DELTA 완료 조건을 유지한 채 구현 순서를 바꾸고 하위 workflow ledger에 기록한다.

### 같은 RD 내부

숨은 선행 DELTA가 필요하면 기존 ID를 유지하고 `DELTA-02a`처럼 추가하거나 의존 edge를 바꾼다. 영향받는 계획 리뷰·테스트 계획만 다시 실행한다.

- 실행 DELTA 3~4개: 승인된 범위와 RD 완료 결과가 유지되면 자동 진행한다.
- 실행 DELTA 5~7개: 남은 결과를 후속 RD로 분리할 수 있는지 재검토한다. 분리해도 제품 범위·공개 계약이 유지되면 roadmap과 Issue 계획 초안을 갱신하고 자동 진행한다.
- 실행 DELTA 8개 이상: 현재 workflow에 추가하지 않는다. 독립 RD로 분리한다.

### RD 사이

다른 RD 결과가 실제 선행 조건이면 현재 RD를 `BLOCKED`로 바꾸고 DAG edge를 추가한다. 승인된 전체 범위와 RD 결과 의미가 유지되면 새로 READY가 된 선행 RD를 먼저 실행한다. 순환이 생기면 양쪽이 공유하는 선행 결과를 새 RD로 추출하고 readiness probe를 다시 실행한다.

진행 중인 하위 workflow에 아직 완료하지 않은 변경이 있으면 같은 RD 안에서 선행 DELTA로 흡수해 clean DELTA boundary까지 복구한다. 별도 RD로 이동하는 재분할은 커밋된 DELTA 경계에서 수행한다. 브랜치 수명과 의존 branch는 하위 qq·ff workflow 계약을 따른다.

### 사용자 결정 경계

다음 경우에만 자동 재계획을 멈추고 사용자에게 묻는다.

- Issue·슬라이스 제품 범위가 확대된다.
- 공개 API, 저장 형식, 보안 경계 또는 승인된 spec 의미가 바뀐다.
- 새 런타임 의존성이 필요하다.
- RD 완료 결과 자체를 바꾸거나 이미 `DONE`인 RD 계약을 깨야 한다.
- DAG 순환을 독립 완료 결과로 해소할 수 없다.

## RD 완료와 roadmap 종료

하위 qq·ff workflow가 리뷰와 최종 gate를 통과하고 `dev`로 이전된 뒤에만 RD를 `DONE`으로 바꾼다. 이어 다음을 수행한다.

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
| RD 내부 DELTA 형식·리뷰·브랜치 수명 | [`./ff-workflow.md`](./ff-workflow.md)                                       |
| 단일 DELTA 크기 작업 절차           | [`./qq-workflow.md`](./qq-workflow.md)                                       |
| 제품 범위·릴리스 완료 조건          | [`../product/roadmap.md`](../product/roadmap.md)                             |
| 실행 계획과 진행 상태 원본          | GitHub Issue                                                                 |
| 문서 생성·갱신과 종료 조건          | [`../process/development-lifecycle.md`](../process/development-lifecycle.md) |
| GitHub 게시·종료                    | [`./issue-tracker.md`](./issue-tracker.md)                                   |
