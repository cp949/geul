# G-EDT-001 편집기 command를 원자적 transaction으로 구현한다

- 상태: `ACTIVE`
- 적용 조건: document, selection, stored mark, revision 또는 undo 단위를 바꾸는 core command

## 구현 규칙

- 실행 가능성, 독자 문서 유효성, revision 증가 가능성을 mutation 전에 판정한다.
- 한 사용자 조작은 하나의 성공 transaction과 한 번의 undo 단위로 만든다.
- 거절된 command는 document, selection, stored mark와 change event를 모두 보존한다.
- DOM에서 직접 들어오는 transaction에도 command와 같은 guard를 적용한다.
- position이 무효화되는 구조 변경(서브트리 교체 등)은 결과 document의 안정 ID로 selection을 명시 복원한다. table 서브트리 교체의 구체 규칙은 [`G-TBL-001`](./G-TBL-001-use-logical-table-grid.md)이 소유한다.
- no-op 연산은 입력 참조를 그대로 반환해 transaction을 만들지 않는다.
- callback에서 찾은 node는 callback 밖으로 내보내지 않는다. position만 찾고, 좁힌 뒤 `doc.nodeAt(position)`으로 다시 조회한다 — TypeScript는 callback 밖 객체 narrowing을 보존하지 않는다.
- dispatch 거절 판정에 document reference 동일성 검사는 document를 바꾸는 transaction에만 사용한다. selection-only·stored-mark transaction은 성공해도 reference가 같으므로 `tr.docChanged`, selection 또는 별도 신호로 판정한다.

## 완료 기준

성공·거절·no-op 각각에서 독자 문서, Tiptap document, selection, stored mark, revision, event 배열과 undo 단위를 단언한다. 거절 판별 경로는 `docChanged: false` 정상 transaction fixture로 거절 오반환이 없는지 확인한다.
