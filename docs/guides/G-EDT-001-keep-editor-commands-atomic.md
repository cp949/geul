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
- 속성 setter와 `updateBlock`은 새 attrs·내용이 현재와 같으면 dispatch 전에 거절한다. 같은 값 재적용이 빈 history 단위를 남기면 다음 undo를 삼킨다. `setText`는 hardBreak를 `\n`으로 읽은 텍스트로 비교하고, 텍스트·hardBreak 밖의 인라인 원소가 있으면 항상 다름으로 본다. 마크는 보지 않는다.
- 명령이 모델에서 노드를 다시 만들어 교체할 때 저장 모델에 없는 PM 전용 attrs(로컬 프리뷰, ADR-0015)를 blockId로 이어받는다. 같은 내용 판정은 그 attrs를 현재 값으로 고정해 비교하고, 거절한 command는 PM 상태를 바꾸지 않는다.
- 노드를 복제하는 명령은 PM 전용 attrs(로컬 프리뷰, ADR-0015)의 blob URL을 옮기지 않고 같은 `File`로 새로 발급한다. 두 블록이 URL을 공유하면 한쪽 정리가 다른 쪽 프리뷰를 깨뜨린다.
- 로컬 프리뷰(ADR-0015) blob URL을 발급한 뒤 dispatch하는 명령은 문서에 못 들어간 URL을 `onLocalPreviewCleanup`으로 통지한다. 거절·되돌림·예외가 해당한다.
- 이 판정은 호스트 콜백이 돌기 전에 URL이 문서에 한 번이라도 들어갔는지로 한다. Tiptap `beforeTransaction`의 `nextState`를 쓴다.
- 명령이 끝난 뒤 최종 문서에 URL이 있는지로 판정하지 않는다. 호스트 콜백이 블록을 지우거나 `replaceDocument`를 부르면 오판한다.
- callback에서 찾은 node는 callback 밖으로 내보내지 않는다. position만 찾고, 좁힌 뒤 `doc.nodeAt(position)`으로 다시 조회한다 — TypeScript는 callback 밖 객체 narrowing을 보존하지 않는다.
- dispatch 거절 판정에 document reference 동일성 검사는 document를 바꾸는 transaction에만 사용한다. selection-only·stored-mark transaction은 성공해도 reference가 같으므로 `tr.docChanged`, selection 또는 별도 신호로 판정한다.

## 완료 기준

성공·거절·no-op 각각에서 독자 문서, Tiptap document, selection, stored mark, revision, event 배열과 undo 단위를 단언한다. 거절 판별 경로는 `docChanged: false` 정상 transaction fixture로 거절 오반환이 없는지 확인한다.
