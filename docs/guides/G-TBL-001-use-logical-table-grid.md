# G-TBL-001 table 동작은 안정 ID와 span이 만든 논리 격자를 사용한다

- 상태: `ACTIVE`
- 적용 조건: table model, HTML·GFM 변환, command, selection 또는 overlay 변경

## 구현 규칙

- 저장 배열 위치가 아니라 column ID와 span을 논리 격자로 투영한 결과를 사용한다.
- 역순 cell 배열, 병합, header row·column 교차 fixture를 포함한다.
- 구조 변경 command는 결과 document의 cell ID로 selection을 복원한다.
- 범위 서식 command는 anchor·head cell ID를 보존해 새 표에서 `CellSelection`을 재구성한다.
- overlay hit-test는 병합 셀이 경계를 가로지르는 행을 제외한 실제 cell 경계만 사용한다.
- 선택 UI는 selection type이 아니라 실제로 바뀔 기준 cell 수로 동작 가능성을 판정한다.

## 검증

```bash
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
pnpm --filter @cp949/geul-react test
```

사용자 interaction을 바꾸면 관련 table E2E도 실행한다.
