# roadmap RD 실행 — 경량 DELTA 사이클 설계

## 1. 결정 요약

roadmap-workflow가 RD를 qq-workflow·ff-workflow로 위임하던 방식을 버리고, roadmap-workflow가 직접 소유하는 **경량 DELTA 사이클**로 바꾼다.

- RD 하나를 시작할 때 DELTA 여러 개를 미리 계획하지 않는다. 매번 DELTA 하나만 골라 계획·구현·리뷰·병합까지 완결한다.
- DELTA는 RD 경계를 넘나들 수 있다. 다만 기본값은 **현재 진행 중인 RD를 이어서 진행**하는 것이고, 다른 RD로 전환하는 것은 정해진 예외 조건에서만 일어난다.
- RD별 "예상 DELTA" 목록은 확정 계획이 아니라 언제든 추가·삭제·수정 가능한 참고 백로그다.
- RD의 "완료 조건"은 체크리스트로 바꾸고, DELTA가 완료될 때마다 대조해 체크한다. RD `DONE` 판정은 이 체크리스트 전체 충족으로만 한다.
- 독립 ff-workflow·qq-workflow(로드맵과 무관한 작업)는 이 설계의 영향을 받지 않는다. roadmap RD의 특정 DELTA가 Risky 신호를 보이면 예외적으로 승격해 쓸 수 있다.

## 2. 배경

`docs/agents/roadmap-workflow.md`의 "RD 상세 계획과 DELTA 예산"은 RD 진입 시 ff-workflow에 DELTA 1~2개를 초기 계획시키고, 구현 중 드러나는 사실에 맞춰 3~4개, 5~7개로 "자동 재계획"한다. 실제 운용에서 이 사전 계획 자체가 구현 중 반복적으로 틀어져 `DELTA-02a` 삽입, 의존 edge 변경, RD 재분리 같은 조정이 잦았고, 이 조정 절차를 오가는 것이 순조로운 작업 흐름을 방해했다.

원인은 구조적이다 — ff-workflow 트랙-1이 DELTA 집합 **전체**를 구현 전에 확정하고 트랙-2가 그 집합의 구조 정합성을 통째로 리뷰하는 모델이기 때문에, 구현 중 새로 드러나는 사실이 있으면 이미 확정한 집합을 고치는 절차(자동 재계획)를 반드시 거쳐야 한다. 이 설계는 애초에 여러 DELTA를 확정하지 않음으로써 "재계획"이라는 사건 자체를 없앤다.

## 3. 목표와 비목표

### 목표

- roadmap 하위 RD 실행에서 DELTA 순서·개수를 사전 확정하지 않고, 매 순간 다음 DELTA 하나만 판단한다.
- RD 완료 여부를 실측 가능한 체크리스트로 판정한다.
- 여러 RD를 동시에 진행 중 상태로 두되, 기본 동작은 현재 RD를 끝까지 진행하는 것으로 유지해 맥락 전환 비용을 줄인다.
- 독립 ff-workflow·qq-workflow의 절차·계약은 그대로 둔다.

### 비목표

- ff-workflow·qq-workflow 자체의 트랙/단계 구조를 바꾸지 않는다(참조만 한다).
- roadmap 작성 단계(roadmap.md/RD-NNN.md 최초 승인 절차)는 바꾸지 않는다.
- 제품 코드·테스트·의존성을 바꾸지 않는다. 이 스펙은 `docs/agents/*.md` 문서 변경만 다룬다.

## 4. RD 상태 모델

`ACTIVE`의 정의를 바꾼다.

- 기존: "현재 qq·ff workflow가 실행 중이다. 한 roadmap에서 하나만 허용한다."
- 변경: "이 RD에 속한 DELTA 사이클이 하나 이상 시작됐고 아직 완료 조건 체크리스트가 다 차지 않았다. 여러 RD가 동시에 `ACTIVE`일 수 있다."

상태 이름과 다이어그램(`CANDIDATE → READY → ACTIVE → DONE`, `↘ BLOCKED`)은 바꾸지 않는다.

## 5. RD-NNN.md 형식 변경

### 5.1 예상 DELTA 절 추가

새 절을 추가한다. 확정 계획이 아니라 메모다 — 수정에 승인이나 재계획 보고가 필요 없다.

```markdown
## 예상 DELTA (참고용 — 확정 아님, 언제든 추가·삭제·수정)

- [ ] DELTA-01: <한 줄 스코프>
- [ ] DELTA-02: <한 줄 스코프>
- [x] DELTA-03: <한 줄 스코프> → 완료: result/RD-NNN-DELTA-03.md
```

### 5.2 완료 조건 절 — 체크리스트화

기존 "## 완료 조건"은 서술문이었다. 검증 가능한 체크리스트로 바꾼다.

```markdown
## 완료 조건

- [ ] 조건 1: <검증가능 문장> — 증거: <미충족>
- [ ] 조건 2: <검증가능 문장> — 증거: <미충족>
```

DELTA 완료 후 그 결과가 충족한 조건이 있으면 체크하고 증거(테스트 제목·명령·`result/` 파일 경로)를 적는다. RD `DONE`은 이 표 전체 체크로만 판정한다 — 예상 DELTA 백로그가 비어도 완료 조건이 안 채워졌으면 `DONE`이 아니다.

## 6. 작업공간 — `result/` 폴더 추가

```text
_works/roadmap/
  roadmap.md
  progress.md
  RD-001.md  RD-002.md  ...
  result/
    RD-001-DELTA-01.md
    RD-002-DELTA-01.md
    ...
```

`result/<RD-NNN>-<DELTA-NN>.md` 하나가 그 DELTA의 계획과 결과를 함께 담는다(별도 계획 파일·결과 파일로 나누지 않는다).

```markdown
# RD-NNN-DELTA-NN

## 계획
- 목적: <한 문장>
- 변경 대상: <파일 경로>
- 완료 조건: <검증가능 문장 + 검출 변이>
- 검증 명령: <copy-paste 가능>
- 적용 가이드·함정: <해당 없음 명시>

## 결과 (구현 후 append)
- 상태: DONE | ABANDONED
- 검증: <실행 명령과 결과>
- 리뷰 발견과 처리: <없음 또는 목록>
- 변경 파일: <목록>
- 남은 위험: <없으면 근거>
```

## 7. 다음 DELTA 선택 (기존 "다음 작업 선택" 대체)

1. 완료된 DELTA·RD를 백로그·DAG에 반영한다.
2. **현재 `ACTIVE`인 RD가 있고 그 RD의 백로그에 실행 가능한 다음 항목이 있으면 그것을 선택한다.** 다른 RD로 전환하지 않는다.
3. 다음 중 하나에 해당할 때만 전환한다.
   - 현재 RD가 완료 조건 체크리스트를 전부 채워 `DONE`이 됐다.
   - 현재 RD가 `BLOCKED`로 전환됐다(선행 RD·계약 결정·외부 조건 부재).
   - 현재 RD 백로그가 비었고, readiness 재검토로도 새로 추가할 항목이 없다.
   - 사용자가 다른 RD를 먼저 진행하라고 명시적으로 지시했다.
4. 전환이 필요해 `READY` RD가 여럿이면 후속 edge를 가장 많이 여는 RD를 선택한다(새 RD를 고를 때만 쓰는 우선순위이지, 진행 중인 RD를 미루는 근거로 쓰지 않는다).
5. 선정한 DELTA가 백로그에 없던 새 발견이면 그 RD의 예상 DELTA 절에 한 줄 추가한다.

## 8. DELTA 사이클 본체

roadmap 승인 이후 사용자 승인 게이트 없이 자동 진행한다. 사용자 결정이 필요한 지점(§10)만 멈추고 묻는다.

1. §7로 선정한 DELTA의 `result/RD-NNN-DELTA-NN.md`를 만들고 "## 계획" 절을 채운다.
2. `dev`에서 분기해 구현한다. 회귀 테스트 RED를 먼저 확인하고 최소 구현으로 GREEN을 만든다.
3. **메인 세션이 직접** 완료 조건 대조와 결함 탐지를 한 번에 수행한다(qq 단계-3의 두 렌즈를 subagent 없이 메인 세션 1인이 수행 — DELTA 하나 크기에서는 별도 dispatch 비용이 더 크다).
4. 발견을 수정한다. 회귀 테스트 RED 먼저, 기존 테스트 약화 금지 — 기존 qq/ff 수정 규칙을 그대로 따른다.
5. "## 결과" 절을 채운다.
6. [`ff-workflow.md`](../agents/ff-workflow.md)의 "재그룹화 실행 명령"을 그대로 써서 재조립하고 `dev`에 ff-only 병합한다. 브랜치를 삭제하고 백업 ref를 정리한다.
7. GitHub 게시·`docs/history/` 기록을 한다([`issue-tracker.md`](../agents/issue-tracker.md) 기준).
8. `RD-NNN.md`의 예상 DELTA 체크박스와 완료 조건 체크리스트를 갱신한다.

커밋 해시 참조, pending-issues/guides/pitfalls, subagent 협업 규칙은 모두 [`ff-workflow.md`](../agents/ff-workflow.md)를 참조한다 — 복제하지 않는다.

### 승격 예외

구현 중 다음 신호가 나타나면 이 사이클을 멈추고 사용자에게 qq-workflow 또는 ff-workflow로 독립 승격할지 묻는다. 에이전트가 스스로 승격하지 않는다(기존 ff-workflow 원칙과 동일).

- 패키지 경계 또는 공개 API shape 변경, 신규 외부 의존성
- DB migration·production config·credential·보안 경계 변경
- 변경 diff가 DELTA 크기 상한(ff-workflow "크기 규칙")에 근접·초과

## 9. 자동 재계획 — 축소

"같은 DELTA 내부"·"같은 RD 내부"(실행 DELTA 3~4/5~7/8+ 예산) 규칙을 삭제한다. 사전 확정한 다중 DELTA 계획이 없으므로 이를 고치는 "재계획"이라는 사건 자체가 없다 — §7의 정상 선택일 뿐이다.

유지하는 것:

- **RD 사이**: 다른 RD 결과가 실제 선행 조건으로 드러나면 현재 RD를 `BLOCKED`로 바꾸고 DAG edge를 추가한다. 순환이 생기면 공유 선행 결과를 새 RD로 추출한다.
- **사용자 결정 경계**: 제품 범위 확대, 공개 API·저장 형식·보안 경계·승인된 spec 의미 변경, 새 런타임 의존성, RD 완료 결과 자체 변경 또는 이미 `DONE`인 RD 계약 파괴, DAG 순환을 독립 결과로 해소 불가 — 이 다섯 가지만 자동 진행을 멈추고 사용자에게 묻는다.

백로그가 과도하게 늘어나 RD 결과가 실제로는 여러 결과를 담고 있다고 판단되면(하드 상한 없음), "roadmap 작성" 절의 원칙(독립 완료 가능한 RD 결과 분리)에 따라 RD를 나눈다.

## 10. RD 완료와 roadmap 종료

RD `DONE` 판정 기준을 바꾼다.

- 기존: "하위 qq·ff workflow가 리뷰와 최종 gate를 통과하고 `dev`로 이전된 뒤에만 RD를 `DONE`으로 바꾼다."
- 변경: RD의 완료 조건 체크리스트(§5.2) 전체가 체크되면 `DONE`이다. 각 DELTA가 이미 개별적으로 리뷰·`dev` 이전을 마쳤으므로 RD 단위의 별도 게이트는 없다 — 마지막 DELTA 완료 시점에 메인 세션이 완료 조건 전체를 실측 증거와 한 번 더 재대조한다.

이어지는 절차(DAG·readiness 재판정, Issue 진행 계획 동기화, 제품 문서 갱신표 적용, roadmap 정리·archive)는 바꾸지 않는다.

## 11. 문서 변경 대상

### `docs/agents/roadmap-workflow.md`

| 절 | 변경 |
| --- | --- |
| 작업공간 | `_works/roadmap/` 트리에 `result/` 추가(§6) |
| `RD-NNN.md` 형식 | 예상 DELTA 절 추가, 완료 조건 체크리스트화(§5) |
| RD 상태 | `ACTIVE` 정의에서 "하나만 허용" 제거(§4) |
| RD 상세 계획과 DELTA 예산 | 전체를 "경량 DELTA 사이클" 절로 교체(§8) |
| 다음 작업 선택 | §7의 절차로 교체 |
| 자동 재계획 | "같은 DELTA 내부"·"같은 RD 내부" 삭제, 나머지 유지(§9) |
| RD 완료와 roadmap 종료 | DONE 판정 기준 교체(§10) |
| 소유 경계 표 | "RD 내부 DELTA 형식·리뷰·브랜치 수명"·"단일 DELTA 크기 작업 절차" 행을 이 문서 자체 소유로 변경, 승격 예외 시에만 ff/qq 참조 |

### `docs/agents/ff-workflow.md`

| 위치 | 변경 |
| --- | --- |
| L17 | roadmap RD가 이 문서에 DELTA 계획 예산을 위임한다는 문장 삭제. §8 승격 예외 시에만 쓰인다는 문장으로 교체 |
| L71, L74 | "roadmap 하위 작업이면" → "roadmap RD에서 승격된 작업이면"으로 재기술 |
| L102, L195 | 같은 재기술(승격 컨텍스트로 한정) |
| L124, L126, L127, L146 | "roadmap 하위 workflow" 초기 2개 목표·예산 위임 문구 삭제. 독립 workflow 규칙(3~5개 목표, 7개 상한)만 남긴다 |
| L367, L369 | "roadmap 하위 workflow" 크기 규칙 carve-out 삭제 |

L150(`docs/product/roadmap.md` 참조)은 제품 로드맵 문서를 가리키는 별개 항목이라 손대지 않는다.

### `docs/agents/qq-workflow.md`

| 위치 | 변경 |
| --- | --- |
| L17 | roadmap RD 위임 문장을 승격 예외 컨텍스트로 재기술 |
| L64, L67, L94, L103, L105 | "roadmap 하위 작업이면" → 승격 컨텍스트로 재기술 |
| L199 | 소유 경계 표 문구는 유지(roadmap-workflow가 여전히 RD 상태·DAG 소유) |

## 12. 검증과 완료 조건

```bash
rg -n 'roadmap 하위 작업|roadmap 하위 workflow|DELTA 예산' docs/agents/*.md
```

- 위 검색 결과가 승격 예외 문맥(§8 "승격 예외")을 설명하는 문장만 남아야 한다.
- 세 문서의 상대 링크가 실제 절 제목을 가리킨다.
- `roadmap-workflow.md`의 예시(RD-NNN.md 형식, 작업공간 트리)가 §5·§6과 일치한다.
- `ff-workflow.md`/`qq-workflow.md`의 "소유 경계" 표에 남은 roadmap 관련 행이 이 스펙의 승격 예외와 모순되지 않는다.
- 제품 코드·테스트는 변경하지 않는다. `git status --short`에 `docs/agents/*.md`, 이 spec 파일 외 변경이 없다.

## 13. 위험과 롤백

위험도: 낮음 — 문서 변경만 포함하고 실행 중인 코드 경로에 영향이 없다.

- 롤백: Git 이력에서 이전 커밋으로 즉시 복원 가능하다.
- 진행 중인 roadmap(`_works/roadmap/`)이 있는 상태에서 이 설계를 적용하면 진행 중 RD의 `RD-NNN.md`를 새 형식(예상 DELTA 절·완료 조건 체크리스트)으로 소급 보정해야 한다 — 적용 시점에 활성 roadmap이 있는지 먼저 확인한다.
