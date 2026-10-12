---
"@cp949/geul-core": patch
---

호스트의 `onBeforeChange` 거절 등으로 transaction이 문서에 못 들어갈 때, 발급한 로컬 프리뷰 blob URL이 해제 통지 없이 남던 결함을 고친다.

- core: `duplicateBlock`과 붙여넣기·드롭 삽입이 URL을 발급한 뒤 dispatch 거절·되돌림·중간 예외로 끝나면, 문서에 못 들어간 URL마다 `onLocalPreviewCleanup`으로 통지한다.
- core: 판정은 호스트 콜백이 돌기 전에 URL이 문서에 한 번이라도 들어갔는지다. 콜백이 블록을 동기로 지워도 undo 가능한 블록의 URL을 통지하지 않는다.
- core: 콜백이 `replaceDocument`를 불러도 같은 URL을 두 번 통지하지 않는다.
- core: 붙여넣기·드롭은 `createId()`가 던지면 URL을 발급하지 않는다.
