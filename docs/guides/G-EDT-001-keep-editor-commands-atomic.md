# G-EDT-001 편집기 command를 원자적 transaction으로 구현한다

- 상태: `ACTIVE`
- 적용 조건: document, selection, stored mark, revision 또는 undo 단위를 바꾸는 core command
- 관련 함정: [`PIT-0008`](../pitfalls/PIT-0008-avoid-object-narrowing-across-closures.md), [`PIT-0031`](../pitfalls/PIT-0031-pair-doc-identity-checks-with-doc-changed-for-filter-rejection.md)

## 구현 규칙

- 실행 가능성, 독자 문서 유효성, revision 증가 가능성을 mutation 전에 판정한다.
- 한 사용자 조작은 하나의 성공 transaction과 한 번의 undo 단위로 만든다.
- 거절된 command는 document, selection, stored mark와 change event를 모두 보존한다.
- DOM에서 직접 들어오는 transaction에도 command와 같은 guard를 적용한다.
- position이 무효화되는 구조 변경(서브트리 교체 등)은 결과 document의 안정 ID로 selection을 명시 복원한다. table 서브트리 교체의 구체 규칙은 [`G-TBL-001`](./G-TBL-001-use-logical-table-grid.md)이 소유한다.
- no-op 연산은 입력 참조를 그대로 반환해 transaction을 만들지 않는다.

## 완료 기준

성공·거절·no-op 각각에서 독자 문서, Tiptap document, selection, stored mark, revision, event 배열과 undo 단위를 단언한다.
