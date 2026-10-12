---
"@cp949/geul-core": patch
---

로컬 프리뷰가 있는 미디어 블록에서 거절 Result인데 PM 상태가 바뀌고, `updateBlock`이 프리뷰를 조용히 지우던 결함을 고친다.

- core: `setMediaBlockUrl`과 업로드 적용이 모델이 같고 로컬 프리뷰 attrs만 달라지는 경우 dispatch 전에 `COMMAND_NOT_APPLICABLE`로 거절한다. PM 상태와 change event가 바뀌지 않는다. `updateBlock`도 url과 프리뷰가 함께 심긴 노드를 같은 내용으로 호출하면 같은 방식으로 거절한다.
- core: `updateBlock`이 모델에서 노드를 다시 만들 때 로컬 프리뷰를 blockId로 이어받는다. 자식 미디어의 프리뷰도 유지한다. 캡션 같은 필드만 바꿔도 프리뷰가 사라지지 않는다.
- core: `updateBlock`으로 url이 생기면 프리뷰를 정리한다. `onLocalPreviewCleanup` 통지는 그 URL이 undo·redo로 못 돌아올 때 1회 낸다(Issue #382). `setMediaBlockUrl`과 같은 판정이다.
