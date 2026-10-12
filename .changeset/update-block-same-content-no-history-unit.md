---
"@cp949/geul-core": patch
---

같은 내용을 다시 적용한 `updateBlock`이 빈 undo 단위를 남겨 다음 undo를 삼키던 결함을 고친다.

- core: 현재 블록과 내용이 완전히 같은 `updateBlock` 호출이 dispatch 전에 `COMMAND_NOT_APPLICABLE`을 반환한다. 반환값은 이전과 같고 undo 한 번이 직전의 실제 변경을 되돌린다.
- core: 비교는 attrs·marks·자식을 포함한 노드 전체다. `children: []`로 자식을 비우는 호출처럼 내용이 달라지면 이전처럼 적용된다.
- core: 값 검증이 no-op 판정보다 먼저다. `BLOCK_NOT_FOUND`·`DOCUMENT_INVALID` 등 기존 에러 우선순위는 그대로다.
